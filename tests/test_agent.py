import json
import pytest
import sqlite_utils
from unittest.mock import MagicMock
from kb_rss.agent import update_taste_profile, generate_daily_suggestions, get_paths
from kb_rss.db import (
    init_db,
    save_or_update_feed,
    save_new_feed_entry,
    update_entry_interaction,
)
from kb_rss.models import RssFeed, FeedItemEntry
from kb_rss.config import Config


@pytest.fixture
def temp_db(tmp_path):
    db_file = tmp_path / "test_kb.db"
    db = sqlite_utils.Database(str(db_file))
    init_db(db)
    return db


def test_update_taste_profile(temp_db, mocker, tmp_path):
    """
    Test generating/updating the user taste markdown profile.
    """
    # Setup mock configuration paths
    config = Config()
    config.root = tmp_path
    mocker.patch("kb_rss.agent.Config", return_value=config)

    # Seed interactions
    feed = RssFeed(title="Test", link="http://example.com")
    feed_id = save_or_update_feed(temp_db, "http://example.com/rss", feed)
    entry = FeedItemEntry(
        feed_id=feed_id,
        title="Open Source",
        summary="Python is open source.",
        published="2026",
        link="http://example.com/p1",
    )
    entry_id, _ = save_new_feed_entry(temp_db, entry)
    update_entry_interaction(temp_db, entry_id, liked=1, comment="Love it!")

    # Mock Ollama HTTP Chat completion response
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "message": {"content": "# Synthesized AI Tastes\n- Python & Open Source"}
    }
    mocker.patch("httpx.post", return_value=mock_response)

    # Run
    new_profile = update_taste_profile(temp_db)

    assert "Python & Open Source" in new_profile
    user_interests_path, agent_tastes_path = get_paths(config)
    assert agent_tastes_path.exists()
    assert "# Synthesized AI Tastes" in agent_tastes_path.read_text(encoding="utf-8")


def test_generate_daily_suggestions(temp_db, mocker, tmp_path):
    """
    Test curating suggestions and writing daily reports.
    """
    config = Config()
    config.root = tmp_path
    mocker.patch("kb_rss.agent.Config", return_value=config)

    # Seed articles
    feed = RssFeed(title="Verge", link="http://verge.com")
    feed_id = save_or_update_feed(temp_db, "http://verge.com/rss", feed)

    from datetime import datetime

    entry1 = FeedItemEntry(
        feed_id=feed_id,
        title="Gemma 2",
        summary="Gemma 2 released.",
        published=datetime.now().isoformat(),
        link="http://verge.com/p1",
    )
    entry2 = FeedItemEntry(
        feed_id=feed_id,
        title="NASA Mars",
        summary="Mars expedition details.",
        published=datetime.now().isoformat(),
        link="http://verge.com/p2",
    )

    id1, _ = save_new_feed_entry(temp_db, entry1)
    id2, _ = save_new_feed_entry(temp_db, entry2)

    # Mock Ollama JSON curation response
    mock_response = MagicMock()
    mock_response.status_code = 200
    curation_payload = {
        "selections": [{"id": id1, "reason": "Interested in AI models."}],
        "summary_report": "# Today's curation summary\nMajor topics: AI model progress.",
    }
    mock_response.json.return_value = {
        "message": {"content": json.dumps(curation_payload)}
    }
    mocker.patch("httpx.post", return_value=mock_response)

    # Mock Gotify notification to avoid errors
    mocker.patch("kb_core.notifier.Gotify.send_notification")

    # Run curation
    report = generate_daily_suggestions(temp_db)

    assert "Today's curation summary" in report

    # Check that database matches selection
    entries = list(temp_db["rss_feed_entries"].rows)
    # Entry 1 was suggested
    e1 = next(e for e in entries if e["id"] == id1)
    assert e1["taste_suggested"] == 1
    assert e1["taste_summary"] == "Interested in AI models."

    # Entry 2 was NOT suggested
    e2 = next(e for e in entries if e["id"] == id2)
    assert e2["taste_suggested"] == 0

    # Report is written to daily reports table
    reports = list(temp_db["rss_daily_reports"].rows)
    assert len(reports) == 1
    assert "Today's curation summary" in reports[0]["report_content"]
    assert json.loads(reports[0]["suggested_entries"]) == [id1]
