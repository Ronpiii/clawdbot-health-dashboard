"""Tests for Context Memory SDK client."""

import pytest
import respx
from httpx import Response

from ctxmem import ContextMemory, AuthenticationError, NotFoundError, RateLimitError


@pytest.fixture
def mock_api():
    """Mock API responses."""
    with respx.mock(base_url="https://api.ctxmem.dev") as respx_mock:
        yield respx_mock


@pytest.fixture
def client():
    """Create a test client."""
    return ContextMemory(api_key="test-key")


class TestContextMemory:
    def test_requires_api_key(self):
        """Should raise if no API key provided."""
        import os
        # Clear env var if set
        old = os.environ.pop("CTXMEM_API_KEY", None)
        try:
            with pytest.raises(AuthenticationError, match="API key required"):
                ContextMemory()
        finally:
            if old:
                os.environ["CTXMEM_API_KEY"] = old

    def test_search(self, mock_api, client):
        """Should search and return results."""
        mock_api.post("/v1/search").mock(
            return_value=Response(200, json={
                "results": [
                    {
                        "id": "123",
                        "key": "decision",
                        "value": "use postgres",
                        "namespace": "project",
                        "tags": ["db"],
                        "similarity": 0.95,
                        "created_at": "2024-01-01T00:00:00Z",
                        "updated_at": "2024-01-01T00:00:00Z",
                    }
                ],
                "query": "what database",
                "count": 1,
            })
        )
        
        result = client.search("what database")
        
        assert result.count == 1
        assert result.results[0].key == "decision"
        assert result.results[0].similarity == 0.95

    def test_set_creates_namespace(self, mock_api, client):
        """Should auto-create namespace if doesn't exist."""
        # First call: namespace not found
        mock_api.get("/v1/namespaces/newproject").mock(
            return_value=Response(404, json={"error": "Not found"})
        )
        # Create namespace
        mock_api.post("/v1/namespaces").mock(
            return_value=Response(201, json={
                "id": "ns-123",
                "slug": "newproject",
                "created_at": "2024-01-01T00:00:00Z",
            })
        )
        # Create entry
        mock_api.post("/v1/namespaces/newproject/entries").mock(
            return_value=Response(201, json={"id": "entry-456"})
        )
        
        entry_id = client.set("newproject", "key", "value")
        
        assert entry_id == "entry-456"

    def test_handles_auth_error(self, mock_api, client):
        """Should raise AuthenticationError on 401."""
        mock_api.post("/v1/search").mock(
            return_value=Response(401, json={"error": "Invalid key"})
        )
        
        with pytest.raises(AuthenticationError):
            client.search("test")

    def test_handles_rate_limit(self, mock_api, client):
        """Should raise RateLimitError with retry_after."""
        mock_api.post("/v1/search").mock(
            return_value=Response(
                429,
                json={"error": "Rate limited"},
                headers={"retry-after": "60"},
            )
        )
        
        with pytest.raises(RateLimitError) as exc:
            client.search("test")
        
        assert exc.value.retry_after == 60

    def test_list_namespaces(self, mock_api, client):
        """Should list namespaces."""
        mock_api.get("/v1/namespaces").mock(
            return_value=Response(200, json={
                "namespaces": [
                    {
                        "id": "ns-1",
                        "slug": "project-a",
                        "name": "Project A",
                        "entry_count": 10,
                        "created_at": "2024-01-01T00:00:00Z",
                        "updated_at": "2024-01-01T00:00:00Z",
                    }
                ]
            })
        )
        
        namespaces = client.list_namespaces()
        
        assert len(namespaces) == 1
        assert namespaces[0].slug == "project-a"
        assert namespaces[0].entry_count == 10
