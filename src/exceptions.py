"""
Custom exceptions for Talk to Krishna application.
"""


class TalkToKrishnaException(Exception):
    """Base exception for all application errors."""
    pass


class DataFileNotFoundError(TalkToKrishnaException):
    """Raised when a required data file is not found."""
    pass


class ModelNotFoundError(TalkToKrishnaException):
    """Raised when a required model file is not found."""
    pass


class InvalidInputError(TalkToKrishnaException):
    """Raised when user input is invalid."""
    pass


class EmbeddingGenerationError(TalkToKrishnaException):
    """Raised when embedding generation fails."""
    pass


class SearchError(TalkToKrishnaException):
    """Raised when search operation fails."""
    pass
