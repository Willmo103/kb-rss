"""
Database schema initialization and queries for `kb-rss`.
Provides interface for inserting, updating, and querying feeds, entries, and categories.
"""

from datetime import datetime, timezone
import json
from typing import List, Optional, Tuple, Dict, Any

import re
import feedparser
import sqlite_utils

from .models import FeedItemEntry, RssFeed


def extract_image_url(e: Any) -> Optional[str]:
    """
    Attempt to extract an image URL from an RSS feed entry's enclosures,
    media:content, or HTML content.
    """
    # 1. Check for enclosure image
    enclosures = e.get("enclosures", [])
    for enc in enclosures:
        if enc.get("type", "").startswith("image/"):
            return enc.get("href")
            
    # 2. Check media content
    media_content = e.get("media_content", [])
    for media in media_content:
        m_type = media.get("type", "")
        m_medium = media.get("medium", "")
        if m_medium == "image" or "image" in m_type:
            return media.get("url")

    # 3. Check media_thumbnail
    media_thumbnail = e.get("media_thumbnail", [])
    for thumb in media_thumbnail:
        if thumb.get("url"):
            return thumb.get("url")

    # 4. Check links list
    links = e.get("links", [])
    for link in links:
        if link.get("rel") == "enclosure" and link.get("type", "").startswith("image/"):
            return link.get("href")

    # 5. Check for img src in HTML summary or description
    for content_key in ("summary", "value", "description"):
        content = e.get(content_key, "")
        if isinstance(content, list) and content:
            content = content[0].get("value", "")
        if content and isinstance(content, str):
            match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', content)
            if match:
                return match.group(1)
                
    return None


def scrape_full_article_content(url: str) -> Tuple[str, Optional[str]]:
    """
    Fetch the web page at url, scrape the main content, clean it,
    and try to extract a primary image URL.
    Returns (cleaned_html, image_url).
    """
    import httpx
    from bs4 import BeautifulSoup
    import urllib.parse

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        response = httpx.get(url, headers=headers, follow_redirects=True, timeout=10.0)
        response.raise_for_status()
        html = response.text
    except Exception as e:
        return f"<p class='text-retro-red font-semibold'>Failed to retrieve article content: {e}</p>", None

    try:
        soup = BeautifulSoup(html, "html.parser")

        # Try to find a primary image from og:image or twitter:image
        image_url = None
        og_image = soup.find("meta", property="og:image") or soup.find("meta", attrs={"name": "twitter:image"})
        if og_image and og_image.get("content"):
            image_url = og_image.get("content")

        # Clean script, style, nav, footer, header tags
        for tag in soup(["script", "style", "nav", "footer", "header", "form", "iframe", "aside", "noscript"]):
            tag.decompose()

        # Try to find main content container
        main_content = soup.find("article") or soup.find("main")
        if not main_content:
            for css_class in ["post-content", "article-content", "entry-content", "content", "main-content-inner"]:
                container = soup.find(class_=re.compile(css_class, re.I))
                if container:
                    main_content = container
                    break

        if not main_content:
            main_content = soup.body if soup.body else soup

        # Reconstruct clean list of elements
        content_elements = []
        for el in main_content.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "p", "blockquote", "pre", "ul", "ol", "code", "img"]):
            if any(parent in el.parents for parent in content_elements):
                continue
            
            if el.name == "img":
                src = el.get("src")
                if src:
                    resolved_src = urllib.parse.urljoin(url, src)
                    el["src"] = resolved_src
                    if not image_url and not resolved_src.endswith(".gif"):
                        image_url = resolved_src
                else:
                    continue

            content_elements.append(el)

        if not content_elements:
            return "<p class='opacity-70 italic'>Could not extract clean text content from this page.</p>", image_url

        cleaned_html = "".join(str(el) for el in content_elements)
        return cleaned_html, image_url
    except Exception as e:
        return f"<p class='text-retro-red font-semibold'>Error parsing article: {e}</p>", None


def init_db(db: sqlite_utils.Database) -> None:
    """
    Ensure the target tables, columns, and indexes are initialized.

    Args:
        db (sqlite_utils.Database): The target SQLite Database.
    """
    # 1. Feeds Metadata Table
    if "rss_feeds" not in db.table_names():
        db["rss_feeds"].create(
            {
                "id": int,
                "feed_url": str,
                "link": str,
                "title": str,
                "subtitle": str,
                "updated": str,
                "image_href": str,
                "image_title": str,
                "image_link": str,
                "description": str,
            },
            pk="id",
        )
        db["rss_feeds"].create_index(["feed_url"], unique=True)
        db["rss_feeds"].create_index(["link"])

    # 2. Feed Entries Table
    if "rss_feed_entries" not in db.table_names():
        db["rss_feed_entries"].create(
            {
                "id": int,
                "feed_id": int,
                "title": str,
                "summary": str,
                "published": str,
                "link": str,
                "author": str,
                "image_url": str,
                "liked": int,  # 1 = liked, -1 = disliked, 0 = neutral
                "favorite": int,  # 1 = favorited, 0 = normal
                "comment": str,  # User's notes
                "clicked": int,  # Clicks counter
                "shared": int,  # Shares counter
                "created_at": str,  # ISO8601 ingestion timestamp
                "taste_suggested": int,  # 1 = suggested by AI, 0 = normal
                "taste_summary": str,  # AI-generated explanation
                "full_content": str,  # Cached full article text
            },
            pk="id",
            foreign_keys=[("feed_id", "rss_feeds", "id")],
        )
        db["rss_feed_entries"].create_index(["link"], unique=True)
        db["rss_feed_entries"].create_index(["feed_id"])
        db["rss_feed_entries"].create_index(["liked"])
        db["rss_feed_entries"].create_index(["favorite"])
    else:
        # Dynamic check and migration to support full_content column on existing db
        columns = db["rss_feed_entries"].columns_dict
        if "full_content" not in columns:
            db["rss_feed_entries"].add_column("full_content", str)

    # 3. Categories Table
    if "rss_categories" not in db.table_names():
        db["rss_categories"].create(
            {
                "id": int,
                "name": str,
            },
            pk="id",
        )
        db["rss_categories"].create_index(["name"], unique=True)

    # 4. Feed Categories Mapping (Many-to-Many)
    if "rss_feed_categories" not in db.table_names():
        db["rss_feed_categories"].create(
            {
                "id": int,
                "feed_id": int,
                "category_id": int,
            },
            pk="id",
            foreign_keys=[
                ("feed_id", "rss_feeds", "id"),
                ("category_id", "rss_categories", "id"),
            ],
        )
        db["rss_feed_categories"].create_index(["feed_id", "category_id"], unique=True)

    # 5. Daily Suggestions Table
    if "rss_daily_reports" not in db.table_names():
        db["rss_daily_reports"].create(
            {
                "id": int,
                "date": str,  # YYYY-MM-DD
                "report_content": str,  # Markdown report
                "suggested_entries": str,  # JSON list of entry IDs
            },
            pk="id",
        )
        db["rss_daily_reports"].create_index(["date"], unique=True)


def get_or_create_category(db: sqlite_utils.Database, name: str) -> int:
    """
    Get the ID of a category, creating it if it doesn't exist.

    Args:
        db (sqlite_utils.Database): The database.
        name (str): Category name.

    Returns:
        int: The primary key of the category.
    """
    table = db["rss_categories"]
    name_clean = name.strip()
    existing = list(table.rows_where("name = ?", [name_clean]))
    if existing:
        return int(existing[0]["id"])

    record = table.insert({"name": name_clean})
    return int(record.last_pk)


def save_or_update_feed(
    db: sqlite_utils.Database, feed_url: str, feed: RssFeed, description: str = ""
) -> int:
    """
    Upsert feed metadata to the database.

    Args:
        db (sqlite_utils.Database): The database.
        feed_url (str): The RSS feed URL.
        feed (RssFeed): Parsed feed details.
        description (str): Custom description.

    Returns:
        int: The feed's primary key.
    """
    table = db["rss_feeds"]
    existing = list(table.rows_where("feed_url = ?", [feed_url]))

    feed_data = feed.model_dump()
    feed_data["feed_url"] = feed_url
    if description:
        feed_data["description"] = description
    elif "description" not in feed_data:
        feed_data["description"] = feed.subtitle or ""

    if existing:
        feed_id = existing[0]["id"]
        # Update existing records, ensuring feed_url is preserved
        table.update(feed_id, feed_data)
        return int(feed_id)
    else:
        record = table.insert(feed_data)
        return int(record.last_pk)


def link_feed_to_category(db: sqlite_utils.Database, feed_id: int, category_id: int) -> None:
    """
    Map a feed to a category if not already linked.

    Args:
        db (sqlite_utils.Database): The database.
        feed_id (int): Feed ID.
        category_id (int): Category ID.
    """
    table = db["rss_feed_categories"]
    existing = list(
        table.rows_where("feed_id = ? AND category_id = ?", [feed_id, category_id])
    )
    if not existing:
        table.insert({"feed_id": feed_id, "category_id": category_id})


def save_new_feed_entry(db: sqlite_utils.Database, entry: FeedItemEntry) -> Tuple[int, str]:
    """
    Save a new entry to the database. Prevents duplication by checking uniqueness of link.

    Args:
        db (sqlite_utils.Database): The database.
        entry (FeedItemEntry): The entry details.

    Returns:
        Tuple[int, str]: (entry_id, status: 'added' | 'exists')
    """
    table = db["rss_feed_entries"]
    existing = list(table.rows_where("link = ?", [entry.link]))

    if existing:
        return int(existing[0]["id"]), "exists"

    entry_data = entry.model_dump()
    entry_data.update(
        {
            "liked": 0,
            "favorite": 0,
            "comment": "",
            "clicked": 0,
            "shared": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "taste_suggested": 0,
            "taste_summary": "",
        }
    )
    record = table.insert(entry_data)
    return int(record.last_pk), "added"


def add_feed_by_url(
    db: sqlite_utils.Database, feed_url: str, category_name: Optional[str] = None
) -> int:
    """
    Helper command to add and initially parse a new RSS feed url.

    Args:
        db (sqlite_utils.Database): The database.
        feed_url (str): RSS XML endpoint.
        category_name (Optional[str]): Category to assign.

    Returns:
        int: Feed ID in database.
    """
    init_db(db)
    parsed = feedparser.parse(feed_url)
    if parsed.bozo:
        raise ValueError(f"Failed to parse RSS feed from URL '{feed_url}': {parsed.bozo_exception}")

    # Extract Feed Details
    f = parsed.feed
    img = f.get("image", {})
    feed_obj = RssFeed(
        title=f.get("title", "Unknown Title"),
        subtitle=f.get("subtitle") or f.get("description"),
        link=f.get("link", ""),
        updated=f.get("updated") or f.get("pubDate"),
        image_href=img.get("href"),
        image_title=img.get("title"),
        image_link=img.get("link"),
    )

    feed_id = save_or_update_feed(db, feed_url, feed_obj)

    # Link category if provided
    if category_name:
        cat_id = get_or_create_category(db, category_name)
        link_feed_to_category(db, feed_id, cat_id)

    # Parse and save entries
    for e in parsed.entries:
        item = FeedItemEntry(
            feed_id=feed_id,
            title=e.get("title", "No Title"),
            summary=e.get("summary") or e.get("description") or "",
            published=e.get("published") or e.get("pubDate") or e.get("updated") or "",
            link=e.get("link", ""),
            author=e.get("author"),
            image_url=extract_image_url(e),
        )
        save_new_feed_entry(db, item)

    return feed_id


def remove_feed(db: sqlite_utils.Database, feed_id: int) -> None:
    """
    Remove feed metadata, entries, and category link from database.

    Args:
        db (sqlite_utils.Database): The database.
        feed_id (int): Feed ID to delete.
    """
    db["rss_feed_categories"].delete_where("feed_id = ?", [feed_id])
    db["rss_feed_entries"].delete_where("feed_id = ?", [feed_id])
    db["rss_feeds"].delete_where("id = ?", [feed_id])


def update_entry_interaction(
    db: sqlite_utils.Database,
    entry_id: int,
    liked: Optional[int] = None,
    favorite: Optional[int] = None,
    comment: Optional[str] = None,
    clicked: bool = False,
    shared: bool = False,
) -> None:
    """
    Update interaction details for a specific post.

    Args:
        db (sqlite_utils.Database): Database connection.
        entry_id (int): Entry ID.
        liked (Optional[int]): Like status.
        favorite (Optional[int]): Favorite status.
        comment (Optional[str]): Comment text.
        clicked (bool): Increment clicks.
        shared (bool): Increment shares.
    """
    table = db["rss_feed_entries"]
    existing = list(table.rows_where("id = ?", [entry_id]))
    if not existing:
        raise KeyError(f"RSS entry with ID {entry_id} not found.")

    updates: Dict[str, Any] = {}
    if liked is not None:
        updates["liked"] = liked
    if favorite is not None:
        updates["favorite"] = favorite
    if comment is not None:
        updates["comment"] = comment

    if clicked:
        updates["clicked"] = int(existing[0].get("clicked") or 0) + 1
    if shared:
        updates["shared"] = int(existing[0].get("shared") or 0) + 1

    if updates:
        table.update(entry_id, updates)
