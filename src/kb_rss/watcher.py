"""
Background watcher daemon for `kb-rss`.
Handles polling all active RSS feeds from the database and logging new entries.
"""

import time
import traceback
from typing import Optional

import feedparser
import sqlite_utils

from .config import Config
from .db import (
    init_db,
    save_new_feed_entry,
    extract_image_url,
    update_published_today_flags,
)
from .models import FeedItemEntry


def poll_all_feeds(db: sqlite_utils.Database) -> int:
    """
    Poll all registered RSS feeds from the database once.
    Saves new entries and logs errors per-feed.

    Args:
        db (sqlite_utils.Database): Database instance.

    Returns:
        int: Number of new entries added across all feeds.
    """
    init_db(db)
    update_published_today_flags(db)
    feeds_table = db["rss_feeds"]
    new_entries_count = 0

    try:
        feeds = list(feeds_table.rows)
    except Exception as e:
        print(f"Error querying active RSS feeds: {e}")
        return 0

    print(f"Polling {len(feeds)} RSS feeds...")

    for feed_row in feeds:
        feed_id = feed_row["id"]
        feed_url = feed_row["feed_url"]
        feed_title = feed_row.get("title", "Unknown Feed")

        print(f"Fetching: {feed_title} ({feed_url})...")
        try:
            parsed = feedparser.parse(feed_url)
            if parsed.bozo:
                print(
                    f"Warning: Non-fatal parsing issues with {feed_title}: {parsed.bozo_exception}"
                )

            feed_entries_count = 0
            for e in parsed.entries:
                item = FeedItemEntry(
                    feed_id=feed_id,
                    title=e.get("title", "No Title"),
                    summary=e.get("summary") or e.get("description") or "",
                    published=e.get("published")
                    or e.get("pubDate")
                    or e.get("updated")
                    or "",
                    link=e.get("link", ""),
                    author=e.get("author"),
                    image_url=extract_image_url(e),
                )
                _, status = save_new_feed_entry(db, item)
                if status == "added":
                    feed_entries_count += 1
                    new_entries_count += 1

            if feed_entries_count > 0:
                print(
                    f"✅ Processed {feed_title}: {feed_entries_count} new entries added."
                )
            else:
                print(f"Processed {feed_title}: No new entries.")

        except Exception as e:
            print(f"❌ Error polling feed {feed_title} ({feed_url}): {e}")
            traceback.print_exc()

    return new_entries_count


def run_watcher(poll_interval: float = 300.0) -> None:
    """
    Main polling loop that periodically triggers feed ingestion.

    Args:
        poll_interval (float): Polling loop interval in seconds. Defaults to 300.0 (5 min).
    """
    config = Config()
    db = config.get_db()
    init_db(db)

    print(f"Starting RSS watcher polling daemon. Interval: {poll_interval}s.")
    while True:
        try:
            start_time = time.time()
            new_added = poll_all_feeds(db)
            duration = time.time() - start_time
            print(
                f"Finished polling loop. Added {new_added} new entries (took {duration:.2f}s)."
            )
        except KeyboardInterrupt:
            print("Watcher daemon interrupted by user. Exiting.")
            break
        except Exception as e:
            print(f"Critical error in watcher polling loop: {e}")
            traceback.print_exc()

        # Calculate remaining sleep time to maintain interval consistency
        time.sleep(poll_interval)
