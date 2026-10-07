"""Shared exception type for the analysis modules."""


class AnalysisError(Exception):
    """A handled, reportable failure.

    `code` is a short machine-readable name that Node.js reads from the JSON reply.
    The one code with special meaning is "InsufficientData" (Node maps it to HTTP
    422). Every other code becomes an HTTP 500.
    """

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message
