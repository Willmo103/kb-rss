import pytest
import sqlite_utils
from unittest.mock import MagicMock
from kb_rss.watcher import poll_all_feeds
from kb_rss.db import init_db, save_or_update_feed
from kb_rss.models import RssFeed


@pytest.fixture
def temp_db(tmp_path):
    db_file = tmp_path / "test_kb.db"
    db = sqlite_utils.Database(str(db_file))
    init_db(db, seed=False)
    return db


def test_poll_all_feeds(temp_db, mocker):
    """
    Test polling all active feeds by mocking feedparser.parse output.
    """
    # Create an active feed to poll
    feed = RssFeed(
        title="Verge",
        subtitle="Verge description",
        link="https://theverge.com",
    )
    save_or_update_feed(temp_db, "https://theverge.com/rss.xml", feed)

    # Mock feedparser.parse
    mock_parsed = MagicMock()
    mock_parsed.bozo = False
    mock_parsed.feed = {
        "title": "Verge",
        "subtitle": "Verge description",
        "link": "https://theverge.com",
        "image": {"href": "https://theverge.com/logo.png"},
    }
    mock_parsed.entries = [
        {
            "title": "AI in 2026",
            "summary": "AI is advancing rapidly in 2026.",
            "published": "2026-05-30T00:00:00",
            "link": "https://theverge.com/ai-2026",
            "author": "TechReporter",
        }
    ]

    mocker.patch("feedparser.parse", return_value=mock_parsed)

    # Trigger poll
    new_entries_count = poll_all_feeds(temp_db)

    assert new_entries_count == 1

    # Check that database has the entry logged
    entries = list(temp_db["rss_feed_entries"].rows)
    assert len(entries) == 1
    assert entries[0]["title"] == "AI in 2026"
    assert entries[0]["link"] == "https://theverge.com/ai-2026"
    assert entries[0]["author"] == "TechReporter"
