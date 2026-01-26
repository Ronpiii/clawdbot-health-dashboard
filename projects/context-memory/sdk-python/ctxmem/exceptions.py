"""Context Memory SDK exceptions."""


class ContextMemoryError(Exception):
    """Base exception for Context Memory SDK."""
    
    def __init__(self, message: str, status_code: int | None = None, response: dict | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.response = response


class AuthenticationError(ContextMemoryError):
    """Invalid or missing API key."""
    pass


class RateLimitError(ContextMemoryError):
    """Rate limit exceeded."""
    
    def __init__(self, message: str, retry_after: int | None = None, **kwargs):
        super().__init__(message, **kwargs)
        self.retry_after = retry_after


class NotFoundError(ContextMemoryError):
    """Resource not found."""
    pass


class ValidationError(ContextMemoryError):
    """Invalid request parameters."""
    pass


class LimitExceededError(ContextMemoryError):
    """Account limit exceeded (upgrade required)."""
    pass
