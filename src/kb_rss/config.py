"""
Configuration management for `kb-rss`.
Handles database loading and Ollama/Gotify integration settings.
"""

import json
import os
from pathlib import Path
from typing import Dict, Any, Optional

from kb_core.config import Config as CoreConfig
from kb_core.notifier import Gotify


class Config(CoreConfig):
    """
    Extends the core kb-core Config to support RSS-specific settings
    loaded from ~/.kb/configs/kb-rss.json.
    """
    settings_file: Path = CoreConfig.configs_dir / "kb-rss.json"

    def __init__(self) -> None:
        # Ensure root directory exists
        self.root.mkdir(parents=True, exist_ok=True)
        self.configs_dir.mkdir(parents=True, exist_ok=True)
        self._settings: Dict[str, Any] = self._load_settings()

    def _load_settings(self) -> Dict[str, Any]:
        defaults = {
            "ollama_host": os.environ.get("OLLAMA_HOST", "192.168.0.25:11434"),
            "ollama_model": os.environ.get("OLLAMA_MODEL", "gemma4"),
            "gotify_url": os.environ.get("GOTIFY_URL", ""),
            "gotify_token": os.environ.get("GOTIFY_TOKEN", ""),
        }
        if self.settings_file.exists():
            try:
                with self.settings_file.open("r", encoding="utf-8") as f:
                    file_data = json.load(f)
                    return {**defaults, **file_data}
            except Exception as e:
                print(f"Warning: Failed to load settings file {self.settings_file}: {e}")
        return defaults

    def save_settings(self, settings: Dict[str, Any]) -> None:
        """
        Persist settings to ~/.kb/configs/kb-rss.json
        """
        self._settings.update(settings)
        try:
            with self.settings_file.open("w", encoding="utf-8") as f:
                json.dump(self._settings, f, indent=2)
        except Exception as e:
            print(f"Error: Failed to save settings file {self.settings_file}: {e}")
            raise e

    @property
    def ollama_host(self) -> str:
        """
        Get the configured host address for Ollama, formatted with protocol.
        """
        host = self._settings.get("ollama_host", "192.168.0.25:11434")
        if not host.startswith(("http://", "https://")):
            return f"http://{host}"
        return host

    @property
    def ollama_model(self) -> str:
        """
        Get the configured model name for Ollama.
        """
        return self._settings.get("ollama_model", "gemma4")

    def get_notifier(self) -> Gotify:
        """
        Get a configured Gotify notifier instance.
        """
        # Read from settings or env
        url = self._settings.get("gotify_url") or os.environ.get("GOTIFY_URL")
        token = self._settings.get("gotify_token") or os.environ.get("GOTIFY_TOKEN")
        return Gotify(token=token, url=url)
