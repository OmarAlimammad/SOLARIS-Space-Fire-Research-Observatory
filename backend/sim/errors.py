"""Structured, field-level simulation errors returned by the v5 API."""
from __future__ import annotations


class SimError(Exception):
    """Validation or capability failure with recovery guidance."""

    def __init__(self, code: str, message: str, *, field: str | None = None,
                 expected: str | None = None, recovery: str | None = None, status: int = 422):
        super().__init__(message)
        self.code, self.message, self.field = code, message, field
        self.expected, self.recovery, self.status = expected, recovery, status

    def as_dict(self) -> dict:
        return {'code': self.code, 'message': self.message, 'field': self.field,
                'expected': self.expected, 'recovery': self.recovery}
