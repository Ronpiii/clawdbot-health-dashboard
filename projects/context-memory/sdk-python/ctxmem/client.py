"""Context Memory SDK client."""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import httpx

from .exceptions import (
    AuthenticationError,
    ContextMemoryError,
    LimitExceededError,
    NotFoundError,
    RateLimitError,
    ValidationError,
)


@dataclass
class Entry:
    """A memory entry."""
    
    id: str
    key: str
    value: Any
    namespace: str
    tags: list[str] | None = None
    metadata: dict | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    similarity: float | None = None  # populated on search results

    @classmethod
    def from_dict(cls, data: dict) -> Entry:
        return cls(
            id=data["id"],
            key=data["key"],
            value=data["value"],
            namespace=data.get("namespace", ""),
            tags=data.get("tags"),
            metadata=data.get("metadata"),
            created_at=datetime.fromisoformat(data["created_at"].replace("Z", "+00:00")) if data.get("created_at") else None,
            updated_at=datetime.fromisoformat(data["updated_at"].replace("Z", "+00:00")) if data.get("updated_at") else None,
            similarity=data.get("similarity"),
        )


@dataclass
class Namespace:
    """A namespace for organizing entries."""
    
    id: str
    slug: str
    name: str | None = None
    description: str | None = None
    entry_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def from_dict(cls, data: dict) -> Namespace:
        return cls(
            id=data["id"],
            slug=data["slug"],
            name=data.get("name"),
            description=data.get("description"),
            entry_count=int(data.get("entry_count", 0)),
            created_at=datetime.fromisoformat(data["created_at"].replace("Z", "+00:00")) if data.get("created_at") else None,
            updated_at=datetime.fromisoformat(data["updated_at"].replace("Z", "+00:00")) if data.get("updated_at") else None,
        )


@dataclass
class SearchResult:
    """Semantic search result."""
    
    results: list[Entry]
    query: str
    count: int

    @classmethod
    def from_dict(cls, data: dict) -> SearchResult:
        return cls(
            results=[Entry.from_dict(r) for r in data["results"]],
            query=data["query"],
            count=data["count"],
        )


class ContextMemory:
    """
    Context Memory API client.
    
    Usage:
        from ctxmem import ContextMemory
        
        ctx = ContextMemory(api_key="your-key")
        
        # store something
        ctx.set("myproject", "decision", "use postgres")
        
        # retrieve it
        value = ctx.get("myproject", "decision")
        
        # semantic search
        results = ctx.search("what database should i use")
    """
    
    DEFAULT_BASE_URL = "https://api.ctxmem.dev"
    
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float = 30.0,
    ):
        """
        Initialize the client.
        
        Args:
            api_key: API key (or set CTXMEM_API_KEY env var)
            base_url: API base URL (default: https://api.ctxmem.dev)
            timeout: Request timeout in seconds
        """
        self.api_key = api_key or os.environ.get("CTXMEM_API_KEY")
        if not self.api_key:
            raise AuthenticationError(
                "API key required. Pass api_key or set CTXMEM_API_KEY env var."
            )
        
        self.base_url = (base_url or os.environ.get("CTXMEM_BASE_URL") or self.DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout
        self._client = httpx.Client(
            base_url=self.base_url,
            headers={"x-api-key": self.api_key},
            timeout=timeout,
        )

    def _request(self, method: str, path: str, **kwargs) -> dict:
        """Make an API request."""
        try:
            response = self._client.request(method, path, **kwargs)
        except httpx.RequestError as e:
            raise ContextMemoryError(f"Request failed: {e}")
        
        # Handle errors
        if response.status_code == 401:
            raise AuthenticationError("Invalid API key", status_code=401)
        elif response.status_code == 403:
            data = response.json()
            if "limit" in data:
                raise LimitExceededError(
                    data.get("error", "Limit exceeded"),
                    status_code=403,
                    response=data,
                )
            raise ContextMemoryError(data.get("error", "Forbidden"), status_code=403)
        elif response.status_code == 404:
            raise NotFoundError("Resource not found", status_code=404)
        elif response.status_code == 422:
            data = response.json()
            raise ValidationError(data.get("error", "Validation failed"), status_code=422)
        elif response.status_code == 429:
            retry_after = response.headers.get("retry-after")
            raise RateLimitError(
                "Rate limit exceeded",
                retry_after=int(retry_after) if retry_after else None,
                status_code=429,
            )
        elif response.status_code >= 400:
            try:
                data = response.json()
                message = data.get("error", f"Request failed with status {response.status_code}")
            except Exception:
                message = f"Request failed with status {response.status_code}"
            raise ContextMemoryError(message, status_code=response.status_code)
        
        return response.json()

    # === High-level convenience API ===
    
    def set(
        self,
        namespace: str,
        key: str,
        value: Any,
        *,
        tags: list[str] | None = None,
        ttl_seconds: int | None = None,
        importance: float | None = None,
    ) -> str:
        """
        Store a memory entry.
        
        Args:
            namespace: Namespace slug (created if doesn't exist)
            key: Entry key
            value: Entry value (string, dict, or any JSON-serializable)
            tags: Optional tags for filtering
            ttl_seconds: Auto-expire after N seconds
            importance: Importance score (0-1)
        
        Returns:
            Entry ID
        """
        # Ensure namespace exists
        try:
            self.get_namespace(namespace)
        except NotFoundError:
            self.create_namespace(namespace)
        
        data = {"key": key, "value": value}
        if tags:
            data["tags"] = tags
        if ttl_seconds:
            data["ttl_seconds"] = ttl_seconds
        if importance is not None:
            data["importance"] = importance
        
        result = self._request("POST", f"/v1/namespaces/{namespace}/entries", json=data)
        return result["id"]

    def get(self, namespace: str, key: str) -> Any:
        """
        Get a memory entry by key.
        
        Args:
            namespace: Namespace slug
            key: Entry key
        
        Returns:
            Entry value (or None if not found)
        """
        results = self._request(
            "POST",
            "/v1/search/text",
            json={"query": key, "namespace": namespace, "limit": 1},
        )
        
        for r in results.get("results", []):
            if r["key"] == key:
                return r["value"]
        return None

    def search(
        self,
        query: str,
        *,
        namespace: str | None = None,
        limit: int = 10,
        threshold: float = 0.7,
        tags: list[str] | None = None,
    ) -> SearchResult:
        """
        Semantic search across memories.
        
        Args:
            query: Natural language query
            namespace: Limit to specific namespace
            limit: Max results (1-100)
            threshold: Minimum similarity (0-1)
            tags: Filter by tags
        
        Returns:
            SearchResult with matching entries
        """
        data: dict[str, Any] = {"query": query, "limit": limit, "threshold": threshold}
        if namespace:
            data["namespace"] = namespace
        if tags:
            data["tags"] = tags
        
        result = self._request("POST", "/v1/search", json=data)
        return SearchResult.from_dict(result)

    def delete(self, namespace: str, key: str) -> bool:
        """
        Delete an entry by key.
        
        Args:
            namespace: Namespace slug
            key: Entry key
        
        Returns:
            True if deleted, False if not found
        """
        # Find entry by key first
        results = self._request(
            "POST",
            "/v1/search/text",
            json={"query": key, "namespace": namespace, "limit": 1},
        )
        
        for r in results.get("results", []):
            if r["key"] == key:
                self._request("DELETE", f"/v1/namespaces/{namespace}/entries/{r['id']}")
                return True
        return False

    # === Namespace management ===
    
    def list_namespaces(self) -> list[Namespace]:
        """List all namespaces."""
        result = self._request("GET", "/v1/namespaces")
        return [Namespace.from_dict(n) for n in result["namespaces"]]

    def create_namespace(
        self,
        slug: str,
        *,
        name: str | None = None,
        description: str | None = None,
    ) -> Namespace:
        """Create a namespace."""
        data = {"slug": slug}
        if name:
            data["name"] = name
        if description:
            data["description"] = description
        
        result = self._request("POST", "/v1/namespaces", json=data)
        return Namespace.from_dict(result)

    def get_namespace(self, slug: str) -> Namespace:
        """Get namespace details."""
        result = self._request("GET", f"/v1/namespaces/{slug}")
        return Namespace.from_dict(result)

    def delete_namespace(self, slug: str) -> bool:
        """Delete a namespace and all its entries."""
        self._request("DELETE", f"/v1/namespaces/{slug}")
        return True

    # === Account ===
    
    def account(self) -> dict:
        """Get account info and usage."""
        return self._request("GET", "/v1/account")

    # === Cleanup ===
    
    def close(self):
        """Close the HTTP client."""
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
