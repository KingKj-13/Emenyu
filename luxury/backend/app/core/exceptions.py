"""Custom exception classes and FastAPI exception handlers.

Every exception carries a machine-readable ``code`` field for client-side
error handling and a human-readable ``detail`` message.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Base exception for all application errors."""

    def __init__(self, detail: str, code: str = "APP_ERROR", status_code: int = 500) -> None:
        self.detail = detail
        self.code = code
        self.status_code = status_code
        super().__init__(detail)


class NotFoundError(AppError):
    def __init__(self, detail: str = "Resource not found", code: str = "NOT_FOUND") -> None:
        super().__init__(detail=detail, code=code, status_code=404)


class AuthenticationError(AppError):
    def __init__(self, detail: str = "Authentication required", code: str = "AUTH_REQUIRED") -> None:
        super().__init__(detail=detail, code=code, status_code=401)


class AuthorizationError(AppError):
    def __init__(self, detail: str = "Insufficient permissions", code: str = "FORBIDDEN") -> None:
        super().__init__(detail=detail, code=code, status_code=403)


class ValidationError(AppError):
    def __init__(self, detail: str = "Validation failed", code: str = "VALIDATION_ERROR") -> None:
        super().__init__(detail=detail, code=code, status_code=422)


class ConflictError(AppError):
    def __init__(self, detail: str = "Resource conflict", code: str = "CONFLICT") -> None:
        super().__init__(detail=detail, code=code, status_code=409)


class TokenExpiredError(AuthenticationError):
    def __init__(self) -> None:
        super().__init__(detail="Token has expired", code="TOKEN_EXPIRED")


class TokenInvalidError(AuthenticationError):
    def __init__(self) -> None:
        super().__init__(detail="Invalid token", code="TOKEN_INVALID")


class DeviceRevokedError(AuthenticationError):
    def __init__(self) -> None:
        super().__init__(detail="Device has been revoked", code="DEVICE_REVOKED")


def register_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers on the FastAPI app."""

    @app.exception_handler(AppError)
    async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.code, "detail": exc.detail},
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(_request: Request, exc: Exception) -> JSONResponse:
        # In production, don't leak internal error details
        import structlog

        logger = structlog.get_logger()
        logger.error("unhandled_exception", error=str(exc), type=type(exc).__name__)
        return JSONResponse(
            status_code=500,
            content={"error": "INTERNAL_ERROR", "detail": "An unexpected error occurred"},
        )
