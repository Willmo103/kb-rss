"""
Typer CLI interface for `kb-rss`.
Provides commands to control the background service, interact with database metadata,
seed feeds, and invoke Ollama agent curations.
"""

import json
import os
import signal
import subprocess
import sys
from pathlib import Path
from typing import Optional

import typer

from .config import Config
from .db import (
    init_db,
    add_feed_by_url,
    remove_feed,
    get_or_create_category,
    upload_entry_to_kb_web,
)
from .watcher import run_watcher, poll_all_feeds
from .agent import update_taste_profile, generate_daily_suggestions

config = Config()
kb_rss_cli = typer.Typer(
    help="CLI for `kb-rss` - the RSS curation and interaction component of the `kb` stack."
)

# Subgroup for feed management
feed_cli = typer.Typer(help="Manage RSS feeds in the curation pool.")
kb_rss_cli.add_typer(feed_cli, name="feed")

# Subgroup for category management
category_cli = typer.Typer(help="Manage feed categories.")
kb_rss_cli.add_typer(category_cli, name="category")

PID_FILE = config.root / "kb-rss_watcher.pid"


def is_pid_running(pid: int) -> bool:
    """
    Check if a process with the given PID is active.
    """
    if pid <= 0:
        return False
    if sys.platform == "win32":
        import ctypes

        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        handle = ctypes.windll.kernel32.OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION, False, pid
        )
        if handle == 0:
            return False
        ctypes.windll.kernel32.CloseHandle(handle)
        return True
    else:
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False


@kb_rss_cli.command("watch")
def watch(
    interval: float = typer.Option(
        300.0,
        "--interval",
        "-i",
        help="Polling interval in seconds. Defaults to 300.",
    )
):
    """
    Start the RSS watcher loop synchronously in the foreground.
    """
    try:
        run_watcher(poll_interval=interval)
    except KeyboardInterrupt:
        typer.echo("\nWatcher stopped by user.")
    except Exception as e:
        typer.echo(f"Watcher execution halted with error: {e}")


@kb_rss_cli.command("poll-once")
def poll_once():
    """
    Poll all feeds in the database once and exit.
    """
    db = config.get_db()
    init_db(db)
    try:
        new_entries = poll_all_feeds(db)
        typer.echo(f"Finished polling once. Added {new_entries} new entries.")
    except Exception as e:
        typer.echo(f"Failed to poll: {e}")


@kb_rss_cli.command("start")
def start():
    """
    Start the RSS watcher in the background as a detached silent process.
    Uses pythonw.exe on Windows to suppress console windows.
    """
    config.root.mkdir(parents=True, exist_ok=True)

    if PID_FILE.exists():
        try:
            pid = int(PID_FILE.read_text().strip())
            if is_pid_running(pid):
                typer.echo(f"RSS watcher is already running (PID: {pid}).")
                raise typer.Exit()
        except ValueError:
            pass

    # Find the pythonw.exe silent interpreter on Windows
    executable = sys.executable
    if sys.platform == "win32" and executable.endswith("python.exe"):
        w_executable = executable[:-10] + "pythonw.exe"
        if Path(w_executable).exists():
            executable = w_executable

    project_dir = Path(__file__).resolve().parent.parent.parent

    # Detach flags for Windows
    creationflags = 0
    if sys.platform == "win32":
        # DETACHED_PROCESS = 0x00000008, CREATE_NO_WINDOW = 0x08000000
        creationflags = 0x00000008 | 0x08000000

    try:
        proc = subprocess.Popen(
            [
                executable,
                "-c",
                "import kb_rss.watcher; kb_rss.watcher.run_watcher()",
            ],
            cwd=str(project_dir),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
            close_fds=True,
        )
        PID_FILE.write_text(str(proc.pid))
        typer.echo(f"Started RSS watcher in background (PID: {proc.pid}).")
    except Exception as e:
        typer.echo(f"Failed to start background watcher: {e}")


@kb_rss_cli.command("stop")
def stop():
    """
    Stop the background RSS watcher daemon.
    """
    if not PID_FILE.exists():
        typer.echo("No active RSS watcher process found (no PID file).")
        return

    try:
        pid = int(PID_FILE.read_text().strip())
        if is_pid_running(pid):
            typer.echo(f"Terminating RSS watcher process {pid}...")
            try:
                os.kill(pid, signal.SIGTERM)
            except Exception:
                pass

            # Wait briefly and verify shutdown
            for _ in range(10):
                import time

                if not is_pid_running(pid):
                    break
                time.sleep(0.1)

            # If still running, force termination
            if is_pid_running(pid):
                if sys.platform == "win32":
                    subprocess.run(
                        ["taskkill", "/F", "/PID", str(pid)],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                else:
                    os.kill(pid, signal.SIGKILL)

            typer.echo("RSS watcher stopped.")
        else:
            typer.echo(
                f"Watcher process {pid} is not running. Cleaning up stale PID file."
            )
    except ValueError:
        typer.echo("Stale PID file detected. Cleaning up.")
    except Exception as e:
        typer.echo(f"Error while stopping watcher: {e}")
    finally:
        PID_FILE.unlink(missing_ok=True)


@kb_rss_cli.command("status")
def status():
    """
    Query the status of the background RSS watcher daemon.
    """
    if not PID_FILE.exists():
        typer.echo("RSS watcher is stopped.")
        return

    try:
        pid = int(PID_FILE.read_text().strip())
        if is_pid_running(pid):
            typer.echo(f"RSS watcher is running (PID: {pid}).")
        else:
            typer.echo(f"RSS watcher is stopped (stale PID file: {pid}).")
    except ValueError:
        typer.echo("RSS watcher is stopped (invalid PID file).")


@kb_rss_cli.command("install")
def install():
    """
    Install the RSS watcher daemon to start automatically on Windows logon.
    Creates a silent batch script shortcut in the Windows Startup directory.
    """
    if sys.platform != "win32":
        typer.echo("Autostart installation is currently only supported on Windows.")
        raise typer.Exit(code=1)

    startup_dir = (
        Path.home()
        / "AppData"
        / "Roaming"
        / "Microsoft"
        / "Windows"
        / "Start Menu"
        / "Programs"
        / "Startup"
    )
    startup_dir.mkdir(parents=True, exist_ok=True)

    # Resolve pythonw path
    executable = sys.executable
    if executable.endswith("python.exe"):
        w_executable = executable[:-10] + "pythonw.exe"
        if Path(w_executable).exists():
            executable = w_executable

    startup_script = startup_dir / "start_kb_rss.cmd"
    script_content = f'@echo off\nstart "" "{executable}" -c "import kb_rss.watcher; kb_rss.watcher.run_watcher()"\n'
    try:
        startup_script.write_text(script_content)
        typer.echo(f"Successfully installed startup script at: {startup_script}")
    except Exception as e:
        typer.echo(f"Failed to install startup script: {e}")


@kb_rss_cli.command("serve")
def serve(
    dev: bool = typer.Option(
        False,
        "--dev",
        help="Run in development mode (pointing to localhost:3000 instead of built assets)",
    )
):
    """
    Launch the Electron desktop application.
    """
    desktop_dir = Path(__file__).resolve().parent.parent.parent / "desktop"
    typer.echo("Launching Electron application...")

    env = os.environ.copy()
    if dev:
        env["NODE_ENV"] = "development"
    else:
        env["NODE_ENV"] = "production"

    creationflags = 0
    if sys.platform == "win32":
        # DETACHED_PROCESS = 0x00000008, CREATE_NO_WINDOW = 0x08000000
        creationflags = 0x00000008 | 0x08000000

    try:
        subprocess.Popen(
            ["npm", "start"],
            cwd=desktop_dir,
            shell=sys.platform == "win32",
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
            close_fds=True,
        )
    except Exception as e:
        typer.echo(f"Error launching Electron: {e}")


@kb_rss_cli.command("agent-run")
def agent_run(
    skip_taste: bool = typer.Option(
        False,
        "--skip-taste",
        help="Skip updating the user taste profile, only generate daily suggestions.",
    )
):
    """
    Manually trigger Ollama agent to update tastes and generate daily curation suggestions.
    """
    db = config.get_db()
    init_db(db)

    try:
        if not skip_taste:
            typer.echo("Updating user taste profile...")
            profile = update_taste_profile(db)
            if profile:
                typer.echo("Taste profile successfully updated.")
            else:
                typer.echo("Taste profile update failed or skipped.")

        typer.echo("Generating daily curation suggestions...")
        report = generate_daily_suggestions(db)
        if report:
            typer.echo("Daily suggestions curated successfully.")
        else:
            typer.echo("Daily suggestions generation completed (no entries available).")

    except Exception as e:
        typer.echo(f"Agent curation failed with error: {e}")
        raise typer.Exit(code=1)


@feed_cli.command("add")
def feed_add(
    url: str = typer.Argument(..., help="The URL of the RSS feed to register."),
    category: Optional[str] = typer.Option(
        None,
        "--category",
        "-c",
        help="Category to assign to this feed.",
    ),
):
    """
    Add a new feed source to the database and import current entries.
    """
    db = config.get_db()
    try:
        feed_id = add_feed_by_url(db, url, category)
        typer.echo(f"Feed registered successfully (ID: {feed_id}).")
    except Exception as e:
        typer.echo(f"Error adding feed: {e}")


@feed_cli.command("list")
def feed_list():
    """
    List all active feeds registered in the pool.
    """
    db = config.get_db()
    init_db(db)
    try:
        feeds = list(db["rss_feeds"].rows)
        if not feeds:
            typer.echo("No RSS feeds registered in the database.")
            return

        # Fetch category mapping
        mapping = {}
        for row in db["rss_feed_categories"].rows:
            mapping.setdefault(row["feed_id"], []).append(row["category_id"])

        categories = {row["id"]: row["name"] for row in db["rss_categories"].rows}

        for f in feeds:
            feed_id = f["id"]
            title = f.get("title", "Unknown")
            url = f.get("feed_url")
            cat_ids = mapping.get(feed_id, [])
            cat_names = [categories[c] for c in cat_ids if c in categories]
            cat_str = f" [{', '.join(cat_names)}]" if cat_names else ""
            typer.echo(f"ID: {feed_id} | {title} | {url}{cat_str}")
    except Exception as e:
        typer.echo(f"Error querying feeds: {e}")


@feed_cli.command("remove")
def feed_remove(
    feed_id: int = typer.Argument(..., help="The database ID of the feed to delete.")
):
    """
    Delete a feed source and all its related entries.
    """
    db = config.get_db()
    init_db(db)
    try:
        remove_feed(db, feed_id)
        typer.echo(f"Feed {feed_id} successfully deleted.")
    except Exception as e:
        typer.echo(f"Error deleting feed: {e}")


@category_cli.command("add")
def category_add(
    name: str = typer.Argument(..., help="The name of the category to create.")
):
    """
    Create a new feed category.
    """
    db = config.get_db()
    init_db(db)
    try:
        cat_id = get_or_create_category(db, name)
        typer.echo(f"Category '{name}' created/retrieved (ID: {cat_id}).")
    except Exception as e:
        typer.echo(f"Error creating category: {e}")


@category_cli.command("list")
def category_list():
    """
    List all feed categories in the database.
    """
    db = config.get_db()
    init_db(db)
    try:
        cats = list(db["rss_categories"].rows)
        if not cats:
            typer.echo("No categories found.")
            return
        for c in cats:
            typer.echo(f"ID: {c['id']} | Name: {c['name']}")
    except Exception as e:
        typer.echo(f"Error listing categories: {e}")


@kb_rss_cli.command("import-json")
def import_json(path: str = typer.Argument(..., help="Path to feed json file.")):
    """
    Seed feeds and categories into the database from an external JSON file.
    """
    json_path = Path(path)
    if not json_path.exists():
        typer.echo(f"Error: Target JSON file {path} not found.")
        raise typer.Exit(code=1)

    try:
        with json_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        typer.echo(f"Error reading JSON file: {e}")
        raise typer.Exit(code=1)

    db = config.get_db()
    init_db(db)

    imported_feeds = 0
    for cat_name, sources in data.items():
        typer.echo(f"Processing category '{cat_name}'...")
        for src in sources:
            url = src.get("url")
            if not url:
                continue
            try:
                # Add feed
                add_feed_by_url(db, url, cat_name)
                typer.echo(f"  + Added: {src.get('title', url)}")
                imported_feeds += 1
            except Exception as e:
                typer.echo(f"  x Failed adding {url}: {e}")

    typer.echo(f"Successfully seeded {imported_feeds} feed sources.")


@kb_rss_cli.command("fetch-full")
def fetch_full(
    entry_id: int = typer.Argument(
        ..., help="The database ID of the RSS entry to scrape."
    )
):
    """
    Fetch the web page for the entry, scrape its full text and images, and cache it.
    """
    from .db import scrape_full_article_content

    db = config.get_db()
    init_db(db)

    table = db["rss_feed_entries"]
    existing = list(table.rows_where("id = ?", [entry_id]))
    if not existing:
        typer.echo(f"Error: RSS entry with ID {entry_id} not found.")
        raise typer.Exit(code=1)

    entry = existing[0]
    link = entry.get("link")
    if not link:
        typer.echo("Error: Entry has no link URL.")
        raise typer.Exit(code=1)

    typer.echo(f"Fetching and scraping: {link}...")
    try:
        full_html, image_url = scrape_full_article_content(link, entry.get("title"))
        updates = {"full_content": full_html}

        # If entry has no image_url, save the extracted image
        if not entry.get("image_url") and image_url:
            updates["image_url"] = image_url
            typer.echo(f"Saved extracted preview image: {image_url}")

        table.update(entry_id, updates)
        typer.echo("Full content scraped and cached successfully.")
    except Exception as e:
        typer.echo(f"Failed to scrape: {e}")
        raise typer.Exit(code=1)


@kb_rss_cli.command("import-to-web")
def import_to_web(
    entry_id: int = typer.Argument(
        ..., help="The database ID of the RSS entry to upload/import to kb-web."
    )
):
    """
    Scrape (if needed) and upload/import an RSS feed entry to the configured kb-web instance.
    """
    db = config.get_db()
    init_db(db)

    typer.echo(f"Importing entry {entry_id} to kb-web...")
    try:
        upload_entry_to_kb_web(db, entry_id)
        typer.echo("Successfully imported entry to kb-web.")
    except Exception as e:
        typer.echo(f"Failed to import: {e}")
        raise typer.Exit(code=1)


def main():
    kb_rss_cli()


if __name__ == "__main__":
    main()
