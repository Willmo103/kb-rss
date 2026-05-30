"""
Data models for `kb-rss` database entities and config definitions.
Uses Pydantic for schema definitions and serialization.
"""

from typing import List, Optional
import urllib.parse
from pydantic import BaseModel, Field


class RssSource(BaseModel):
    """
    Represents an RSS feed source parsed from JSON or dynamic UI config.
    """

    title: str
    url: str
    description: Optional[str] = ""

    @property
    def safe_title(self) -> str:
        """
        URL-encoded title for safe pathing or identifiers.
        """
        return urllib.parse.quote(self.title)


class RssCategory(BaseModel):
    """
    Represents a category containing multiple RSS sources.
    """

    name: str
    rss_sources: List[RssSource] = Field(default_factory=list)


class RssFeed(BaseModel):
    """
    Represents the metadata of a parsed RSS Feed in the database.
    """

    title: str
    subtitle: Optional[str] = None
    link: str
    updated: Optional[str] = None
    image_href: Optional[str] = None
    image_title: Optional[str] = None
    image_link: Optional[str] = None


class FeedItemEntry(BaseModel):
    """
    Represents an individual post/entry from an RSS feed.
    """

    feed_id: int
    title: str
    summary: str
    published: str
    link: str
    author: Optional[str] = None
    image_url: Optional[str] = None
