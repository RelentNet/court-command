"""Image upload service. Stores files on disk with content-hashed filenames.

Files live at `{UPLOAD_DIR}/<sha256>.<ext>` and are served via the `/uploads`
static mount in main.py. Returned URLs are RELATIVE (e.g. `/uploads/abc.png`)
so the frontend can prefix them with its configured API base, keeping the
whole system domain-agnostic.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
from pathlib import Path
from typing import Tuple

from fastapi import HTTPException, UploadFile

logger = logging.getLogger("UploadService")

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB

# mime -> canonical extension
ALLOWED_MIME_TO_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
}

# SVG sanitization: strip dangerous elements/attributes.
# Operators are TDs/refs, not random internet users, but defense-in-depth is free.
_SCRIPT_TAG_RE = re.compile(rb"<script\b[^>]*>.*?</script\s*>", re.IGNORECASE | re.DOTALL)
_FOREIGN_OBJECT_RE = re.compile(rb"<foreignObject\b[^>]*>.*?</foreignObject\s*>", re.IGNORECASE | re.DOTALL)
_EVENT_HANDLER_RE = re.compile(rb"\s+on[a-z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", re.IGNORECASE)
_JAVASCRIPT_HREF_RE = re.compile(
    rb"(href|xlink:href)\s*=\s*(\"\s*javascript:[^\"]*\"|'\s*javascript:[^']*'|javascript:[^\s>]+)",
    re.IGNORECASE,
)


def _sanitize_svg(data: bytes) -> bytes:
    """Remove <script>, <foreignObject>, inline event handlers, and javascript: URLs."""
    cleaned = _SCRIPT_TAG_RE.sub(b"", data)
    cleaned = _FOREIGN_OBJECT_RE.sub(b"", cleaned)
    cleaned = _EVENT_HANDLER_RE.sub(b"", cleaned)
    cleaned = _JAVASCRIPT_HREF_RE.sub(b"", cleaned)
    return cleaned


def ensure_upload_dir() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


async def save_upload(file: UploadFile) -> Tuple[str, str, int, str]:
    """Validate + persist an upload. Returns (relative_url, filename, size, content_type).

    Raises HTTPException on validation failure.
    """
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_MIME_TO_EXT:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type '{content_type}'. Allowed: png, jpeg, webp, gif, svg.",
        )

    # Read with a hard cap so a huge upload can't exhaust memory.
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Image exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.")
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")

    if content_type == "image/svg+xml":
        data = _sanitize_svg(data)

    ensure_upload_dir()

    ext = ALLOWED_MIME_TO_EXT[content_type]
    digest = hashlib.sha256(data).hexdigest()
    filename = f"{digest}.{ext}"
    path = UPLOAD_DIR / filename

    # Content-hashed filenames dedupe automatically — skip rewrite if identical.
    if not path.exists():
        try:
            path.write_bytes(data)
        except OSError as exc:
            logger.error("Failed to write upload %s: %s", path, exc)
            raise HTTPException(status_code=500, detail="Failed to save upload.") from exc

    return f"/uploads/{filename}", filename, len(data), content_type
