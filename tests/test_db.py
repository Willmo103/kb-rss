import pytest
import sqlite_utils
from kb_rss.db import (
    init_db,
    get_or_create_category,
    save_or_update_feed,
    link_feed_to_category,
    save_new_feed_entry,
    update_entry_interaction,
)
from kb_rss.models import RssFeed, FeedItemEntry


@pytest.fixture
def temp_db(tmp_path):
    """
    Create a fresh in-memory or temp file SQLite Database for testing.
    """
    db_file = tmp_path / "test_kb.db"
    db = sqlite_utils.Database(str(db_file))
    init_db(db)
    return db


def test_init_db(temp_db):
    """
    Verify tables and indexes are created successfully.
    """
    tables = temp_db.table_names()
    assert "rss_feeds" in tables
    assert "rss_feed_entries" in tables
    assert "rss_categories" in tables
    assert "rss_feed_categories" in tables
    assert "rss_daily_reports" in tables


def test_get_or_create_category(temp_db):
    """
    Test creating categories, ensuring no duplicates.
    """
    cat_id1 = get_or_create_category(temp_db, "Tech")
    cat_id2 = get_or_create_category(temp_db, "Tech ")  # whitespace stripping
    cat_id3 = get_or_create_category(temp_db, "Science")

    assert cat_id1 == cat_id2
    assert cat_id1 != cat_id3

    rows = list(temp_db["rss_categories"].rows)
    assert len(rows) == 2


def test_save_or_update_feed(temp_db):
    """
    Test upserting feeds metadata.
    """
    feed = RssFeed(
        title="Test Feed",
        subtitle="Description of feed",
        link="https://example.com",
    )

    feed_url = "https://example.com/feed.xml"
    feed_id1 = save_or_update_feed(temp_db, feed_url, feed)

    # Update title
    feed.title = "Updated Feed"
    feed_id2 = save_or_update_feed(temp_db, feed_url, feed)

    assert feed_id1 == feed_id2

    rows = list(temp_db["rss_feeds"].rows)
    assert len(rows) == 1
    assert rows[0]["title"] == "Updated Feed"
    assert rows[0]["feed_url"] == feed_url


def test_save_new_feed_entry(temp_db):
    """
    Test saving individual posts/entries.
    """
    feed = RssFeed(
        title="Test Feed",
        subtitle="Description",
        link="https://example.com",
    )
    feed_id = save_or_update_feed(temp_db, "https://example.com/rss", feed)

    entry = FeedItemEntry(
        feed_id=feed_id,
        title="Post Title",
        summary="Post Summary",
        published="2026-05-30",
        link="https://example.com/post1",
        author="Will",
    )

    entry_id, status = save_new_feed_entry(temp_db, entry)
    assert status == "added"

    # Save same entry again (duplicate link)
    entry_id2, status2 = save_new_feed_entry(temp_db, entry)
    assert status2 == "exists"
    assert entry_id == entry_id2

    rows = list(temp_db["rss_feed_entries"].rows)
    assert len(rows) == 1


def test_update_entry_interaction(temp_db):
    """
    Test setting liked, favorite, and adding user comments.
    """
    feed = RssFeed(
        title="Test Feed",
        subtitle="Description",
        link="https://example.com",
    )
    feed_id = save_or_update_feed(temp_db, "https://example.com/rss", feed)

    entry = FeedItemEntry(
        feed_id=feed_id,
        title="Post Title",
        summary="Post Summary",
        published="2026-05-30",
        link="https://example.com/post1",
        author="Will",
    )
    entry_id, _ = save_new_feed_entry(temp_db, entry)

    # Perform interactions
    update_entry_interaction(
        temp_db,
        entry_id,
        liked=1,
        favorite=1,
        comment="Awesome!",
        clicked=True,
        shared=True,
    )

    rows = list(temp_db["rss_feed_entries"].rows)
    assert len(rows) == 1
    assert rows[0]["liked"] == 1
    assert rows[0]["favorite"] == 1
    assert rows[0]["comment"] == "Awesome!"
    assert rows[0]["clicked"] == 1
    assert rows[0]["shared"] == 1

    # Check increment
    update_entry_interaction(temp_db, entry_id, clicked=True)
    rows2 = list(temp_db["rss_feed_entries"].rows)
    assert rows2[0]["clicked"] == 2


def test_scrape_full_article_content(mocker):
    """
    Test scraping full article content and extracting images.
    """
    mock_html = """
    <html>
      <head>
        <meta property="og:image" content="https://example.com/og.jpg" />
      </head>
      <body>
        <nav>Navigation links</nav>
        <article>
          <h1>Article Title</h1>
          <p>This is the first paragraph.</p>
          <img src="/relative-img.jpg" />
          <script>console.log("hello")</script>
        </article>
        <footer>Footer details</footer>
      </body>
    </html>
    """
    # Mock httpx.get and httpx.post
    mock_response = mocker.Mock()
    mock_response.text = mock_html
    mock_response.raise_for_status = mocker.Mock()
    mocker.patch("httpx.get", return_value=mock_response)
    mocker.patch("httpx.post", return_value=mock_response)

    from kb_rss.db import scrape_full_article_content

    content, img_url = scrape_full_article_content("https://example.com/post")

    assert "Article Title" in content
    assert "This is the first paragraph." in content
    assert 'src="https://example.com/relative-img.jpg"' in content
    assert "Navigation" not in content
    assert "console.log" not in content
    assert "Footer" not in content
    assert img_url == "https://example.com/og.jpg"
