#!/usr/bin/env python3
"""Prepare oversized TMFD issue PDFs for GitHub Pages publishing."""

from __future__ import annotations

import io
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

try:
    import fitz
except ImportError:
    import pymupdf as fitz

from PIL import Image


GITHUB_LIMIT = 100 * 1024 * 1024
COMPRESSION_THRESHOLD = 90 * 1024 * 1024
MAX_IMAGE_EDGE = 2300
JPEG_QUALITY = 82


def compress_pdf(source: Path, destination: Path) -> int:
    document = fitz.open(source)
    processed: set[int] = set()
    replaced = 0

    try:
        for page in document:
            for image_info in page.get_images(full=True):
                xref = image_info[0]
                if xref in processed:
                    continue
                processed.add(xref)

                pixmap = fitz.Pixmap(document, xref)
                if max(pixmap.width, pixmap.height) < 1500:
                    continue
                if pixmap.alpha or pixmap.colorspace is None or pixmap.colorspace.n != 3:
                    pixmap = fitz.Pixmap(fitz.csRGB, pixmap)

                image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
                image.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE), Image.Resampling.LANCZOS)
                stream = io.BytesIO()
                image.save(stream, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
                page.replace_image(xref, stream=stream.getvalue())
                replaced += 1

        document.save(
            destination,
            garbage=4,
            deflate=True,
            deflate_images=True,
            deflate_fonts=True,
        )
    finally:
        document.close()

    return replaced


def main() -> int:
    repository = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
    issue_files = sorted(
        pdf
        for language in ("en", "zh")
        for pdf in (repository / "issues" / language).glob("*.pdf")
    )

    oversized = [pdf for pdf in issue_files if pdf.stat().st_size >= COMPRESSION_THRESHOLD]
    if not oversized:
        print("No oversized TMFD PDFs found. GitHub Desktop is ready.")
        return 0

    timestamp = datetime.now().strftime("%Y-%m-%d %H%M%S")
    backups = Path.home() / "Documents" / "TMFD Original PDFs" / timestamp
    backups.mkdir(parents=True, exist_ok=False)
    failures: list[str] = []

    for source in oversized:
        original_size = source.stat().st_size
        backup = backups / source.name
        temporary = source.with_name(f".{source.name}.preparing")

        shutil.copy2(source, backup)
        print(f"Preparing {source.name} ...")
        try:
            replaced = compress_pdf(source, temporary)
            compressed_size = temporary.stat().st_size
            if compressed_size >= GITHUB_LIMIT:
                raise RuntimeError("the prepared file is still above GitHub's 100 MB limit")
            os.replace(temporary, source)
            print(
                f"  Ready: {original_size / 1024 / 1024:.1f} MB -> "
                f"{compressed_size / 1024 / 1024:.1f} MB ({replaced} images optimised)"
            )
        except Exception as error:
            if temporary.exists():
                temporary.unlink()
            failures.append(f"{source.name}: {error}")

    if failures:
        print("\nSome PDFs were left unchanged:")
        print("\n".join(f"- {failure}" for failure in failures))
        print(f"Original files are backed up in: {backups}")
        return 1

    print(f"\nOriginal high-resolution PDFs are backed up in: {backups}")
    print("Open GitHub Desktop, commit the prepared PDFs, then click Push origin.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
