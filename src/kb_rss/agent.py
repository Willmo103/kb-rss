"""
AI Agentic helper using Ollama and Gemma4 model for RSS taste determination.
Generates personalized suggestions, updates taste profiles, and triggers Gotify notifications.
"""

from datetime import datetime
import json
import traceback
from typing import Dict, Any, List

import httpx
import sqlite_utils

from .config import Config


def get_paths(config: Config):
    """
    Get file paths for user interests and taste profile.
    """
    user_interests_path = config.root / "user_interests.md"
    agent_tastes_path = config.root / "agent_user_tastes.md"

    # Initialize default interests file if not exists
    if not user_interests_path.exists():
        default_interests = (
            "# User Interests\n\n"
            "Define your interests and topics you want to keep track of.\n"
            "Examples:\n"
            "- Software engineering, Python, C#, Node.js development\n"
            "- Local AI/ML progress, Ollama models, open weights LLMs\n"
            "- Technology news, hardware, gadget reviews\n"
            "- General news, science, engineering achievements\n"
        )
        user_interests_path.write_text(default_interests, encoding="utf-8")

    return user_interests_path, agent_tastes_path


def call_ollama(
    config: Config, system_prompt: str, user_prompt: str, json_mode: bool = False
) -> str:
    """
    Send chat request to Ollama endpoint.
    """
    url = f"{config.ollama_host}/api/chat"
    payload = {
        "model": config.ollama_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
        "options": {"temperature": 0.1},
    }

    if json_mode:
        payload["format"] = "json"

    print(
        f"Connecting to Ollama host: {config.ollama_host} using model: {config.ollama_model}..."
    )
    try:
        response = httpx.post(url, json=payload, timeout=60.0)
        response.raise_for_status()
        data = response.json()
        return data["message"]["content"].strip()
    except Exception as e:
        print(f"Ollama API request failed: {e}")
        raise e


def update_taste_profile(db: sqlite_utils.Database) -> str:
    """
    Explore liked/disliked feed items, comments, clicks, and update the tastes file.
    """
    config = Config()
    user_interests_path, agent_tastes_path = get_paths(config)

    user_interests = user_interests_path.read_text(encoding="utf-8")
    existing_tastes = ""
    if agent_tastes_path.exists():
        existing_tastes = agent_tastes_path.read_text(encoding="utf-8")

    # Fetch User Interaction History from Database
    # Query liked, disliked, commented, or clicked articles
    entries_table = db["rss_feed_entries"]
    try:
        interacted_rows = list(
            entries_table.rows_where(
                "liked != 0 OR favorite = 1 OR (comment IS NOT NULL AND comment != '') OR clicked > 0"
            )
        )
    except Exception as e:
        print(f"Error fetching interacted rows: {e}")
        interacted_rows = []

    # Format the interaction log
    interaction_log = []
    for row in interacted_rows:
        status_parts = []
        if row.get("liked") == 1:
            status_parts.append("LIKED")
        elif row.get("liked") == -1:
            status_parts.append("DISLIKED")
        if row.get("favorite") == 1:
            status_parts.append("FAVORITED")
        if row.get("clicked", 0) > 0:
            status_parts.append(f"CLICKED ({row['clicked']} times)")
        if row.get("shared", 0) > 0:
            status_parts.append(f"SHARED ({row['shared']} times)")

        status_str = ", ".join(status_parts) if status_parts else "INTERACTED"
        comment_str = (
            f" | User Comment: '{row['comment']}'" if row.get("comment") else ""
        )

        interaction_log.append(
            f"- [{status_str}] Title: {row['title']}\n"
            f"  Summary: {row['summary'][:200]}...\n"
            f"  Link: {row['link']}{comment_str}"
        )

    interactions_content = (
        "\n".join(interaction_log)
        if interaction_log
        else "No interaction history recorded yet."
    )

    system_prompt = (
        "You are an expert user behavior and preference taste analyst.\n"
        "Your task is to update the user's taste profile file based on their stated interests,\n"
        "their previous taste profile, and their actual interaction logs (likes, dislikes, comments, clicks, shares).\n"
        "Synthesize these signals into a comprehensive, structured markdown profile detailing:\n"
        "1. CORE INTEREST AREAS: Topics and publication sources they love.\n"
        "2. FILTER OUT / DEPRIORITIZE: Topics, keywords, or feed styles they want to avoid.\n"
        "3. EXPLANATIONS & RATIONALE: Rationale drawing from user comments or dislikes.\n"
        "Return ONLY the markdown taste profile content. Do not include introductory notes or markdown codeblocks wrapping the whole report."
    )

    user_prompt = (
        f"Stated Interests:\n{user_interests}\n\n"
        f"Previous Taste Profile:\n{existing_tastes if existing_tastes else 'No prior tastes recorded.'}\n\n"
        f"Latest User Interactions:\n{interactions_content}"
    )

    try:
        new_profile = call_ollama(config, system_prompt, user_prompt)
        agent_tastes_path.write_text(new_profile, encoding="utf-8")
        print(f"Taste profile successfully updated and saved to: {agent_tastes_path}")
        return new_profile
    except Exception as e:
        print(f"Error updating taste profile: {e}")
        traceback.print_exc()
        raise e


def generate_daily_suggestions(db: sqlite_utils.Database) -> str:
    """
    Process recent RSS feed entries, score/select items based on tastes,
    save to daily suggestions table, and notify via Gotify.
    """
    config = Config()
    user_interests_path, agent_tastes_path = get_paths(config)

    user_interests = user_interests_path.read_text(encoding="utf-8")
    tastes = (
        agent_tastes_path.read_text(encoding="utf-8")
        if agent_tastes_path.exists()
        else "No tastes profile generated yet."
    )

    # Fetch recent un-suggested feed entries from the current day, limit to 50
    # Also fetch the parent feed title so Ollama knows the source
    sql = """
        SELECT e.*, f.title as feed_title
        FROM rss_feed_entries e
        JOIN rss_feeds f ON e.feed_id = f.id
        WHERE e.taste_suggested = 0 AND e.published_today = 1
        ORDER BY e.created_at DESC
        LIMIT 50
    """
    try:
        recent_entries = list(db.query(sql))
    except Exception as e:
        print(f"Error querying recent feed entries: {e}")
        raise e

    if not recent_entries:
        print(
            "No feed entries found from today. Falling back to recent uncurated entries..."
        )
        sql_fallback = """
            SELECT e.*, f.title as feed_title
            FROM rss_feed_entries e
            JOIN rss_feeds f ON e.feed_id = f.id
            WHERE e.taste_suggested = 0
            ORDER BY e.created_at DESC
            LIMIT 50
        """
        try:
            recent_entries = list(db.query(sql_fallback))
        except Exception as e:
            print(f"Error querying fallback entries: {e}")
            raise e

    if not recent_entries:
        print("No new/unprocessed feed entries to curate suggestions from.")
        return ""

    # Format list for Ollama
    articles_list = []
    for entry in recent_entries:
        articles_list.append(
            f"ID: {entry['id']}\n"
            f"Feed Source: {entry['feed_title']}\n"
            f"Title: {entry['title']}\n"
            f"Summary: {entry['summary'][:200]}...\n"
        )
    articles_payload = "\n---\n".join(articles_list)

    system_prompt = (
        "You are an AI news curator and editor.\n"
        "Your task is to analyze the provided recent RSS articles list and select the top 5 to 10 most relevant articles\n"
        "matching the user's Taste Profile and Stated Interests.\n"
        "Also generate a markdown summary report today's curation (the 'summary_report'), explaining the overall news themes of interest.\n"
        "Your output MUST be a valid JSON object matching this schema:\n"
        "{\n"
        '  "selections": [\n'
        '    {"id": <integer_id>, "reason": "<1-sentence reason why this article was selected>"}\n'
        "  ],\n"
        '  "summary_report": "<detailed markdown summary report of today\'s news curation>"\n'
        "}\n"
        "Respond ONLY with the JSON object. Ensure all JSON string values are correctly escaped."
    )

    user_prompt = (
        f"User Interests:\n{user_interests}\n\n"
        f"User Taste Profile:\n{tastes}\n\n"
        f"Recent Articles List:\n{articles_payload}"
    )

    try:
        response_json = call_ollama(config, system_prompt, user_prompt, json_mode=True)
        curation = json.loads(response_json)

        selections = curation.get("selections", [])
        summary_report = curation.get("summary_report", "Today's daily digest report.")

        date_str = datetime.now().strftime("%Y-%m-%d")

        suggested_ids = []
        # Update suggested articles in database
        for selection in selections:
            entry_id = selection.get("id")
            reason = selection.get("reason", "")
            if entry_id is not None:
                db["rss_feed_entries"].update(
                    entry_id, {"taste_suggested": 1, "taste_summary": reason}
                )
                suggested_ids.append(entry_id)

        # Save the daily report record
        db["rss_daily_reports"].insert(
            {
                "date": date_str,
                "report_content": summary_report,
                "suggested_entries": json.dumps(suggested_ids),
            },
            pk="id",
            replace=True,
        )

        print(f"Curation report successfully generated and saved for: {date_str}.")

        # Send Gotify Notification
        notifier = config.get_notifier()
        if notifier.POST_ENABLED:
            notification_title = f"Daily RSS Curated Digest - {date_str}"
            # Extract plain text or clean summary from markdown for the Gotify notification
            clean_message = f"{summary_report[:500]}...\n\nOpen kb-rss explorer to view full report."
            notifier.send_notification(title=notification_title, message=clean_message)
            print("Gotify notification dispatched successfully.")
        else:
            print("Gotify is not configured. Skipping push notification.")

        return summary_report

    except Exception as e:
        print(f"Error generating suggestions: {e}")
        traceback.print_exc()
        raise e
