"""Context Memory Python SDK — persistent memory for AI workflows."""

from .client import ContextMemory, Entry, Namespace, SearchResult
from .exceptions import ContextMemoryError, AuthenticationError, RateLimitError, NotFoundError

__version__ = "0.1.0"
__all__ = [
    "ContextMemory",
    "Entry", 
    "Namespace",
    "SearchResult",
    "ContextMemoryError",
    "AuthenticationError", 
    "RateLimitError",
    "NotFoundError",
]
