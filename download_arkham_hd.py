#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path
from typing import List, Dict, Any, Optional

import requests
from bs4 import BeautifulSoup, Tag

try:
    import gdown
except Exception:
    gdown = None

PAGE_URL = "https://ahlcgoctgn.wordpress.com/image-packs/"
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
GOOGLE_DRIVE_RE = re.compile(r"/file/d/([A-Za-z0-9_-]+)")


def slugify(text: str) -> str:
    text = re.sub(r"[\\/:*?\"<>|]+", "-", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = text.rstrip(".")
    return text or "unnamed"


def extract_drive_file_id(url: str) -> Optional[str]:
    m = GOOGLE_DRIVE_RE.search(url)
    if m:
        return m.group(1)
    m = re.search(r"[?&]id=([A-Za-z0-9_-]+)", url)
    if m:
        return m.group(1)
    return None


def fetch_pack_index(page_url: str) -> List[Dict[str, str]]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
        )
    }
    resp = requests.get(page_url, headers=headers, timeout=30)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    content_root = soup.find("main") or soup.find("article") or soup.body
    if content_root is None:
        raise RuntimeError("Could not find page content.")

    current_section = "Uncategorized"
    packs: List[Dict[str, str]] = []
    seen_urls = set()

    for node in content_root.descendants:
        if not isinstance(node, Tag):
            continue

        if node.name in {"h1", "h2", "h3"}:
            heading = node.get_text(" ", strip=True)
            if heading:
                current_section = heading
            continue

        if node.name != "a":
            continue

        href = (node.get("href") or "").strip()
        title = node.get_text(" ", strip=True)
        if not href or not title:
            continue
        if "drive.google.com" not in href:
            continue
        if href in seen_urls:
            continue

        file_id = extract_drive_file_id(href)
        if not file_id:
            continue

        seen_urls.add(href)
        packs.append(
            {
                "section": current_section,
                "title": title,
                "url": href,
                "file_id": file_id,
            }
        )

    return packs


def file_looks_like_html(path: Path) -> bool:
    try:
        head = path.read_bytes()[:4096].lstrip()
    except Exception:
        return False
    low = head.lower()
    return low.startswith(b"<!doctype html") or low.startswith(b"<html") or b"<title>" in low


def save_html_debug_copy(path: Path) -> Optional[Path]:
    if not file_looks_like_html(path):
        return None
    debug_path = path.with_suffix(path.suffix + ".html")
    shutil.copy2(path, debug_path)
    return debug_path


def download_pack(file_id: str, output_path: Path) -> tuple[bool, str]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists() and output_path.stat().st_size > 0:
        return True, "download_exists"

    if gdown is None:
        return False, "missing_gdown"

    try:
        result = gdown.download(id=file_id, output=str(output_path), quiet=False)
    except Exception as e:
        return False, f"gdown_error:{e!r}"

    if result is None or (not output_path.exists()):
        return False, "gdown_returned_none"

    if file_looks_like_html(output_path):
        debug_path = save_html_debug_copy(output_path)
        return False, f"downloaded_html_instead_of_binary:{debug_path}"

    return True, "ok"


def extract_o8c(o8c_path: Path, extract_dir: Path) -> int:
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(o8c_path, "r") as zf:
        zf.extractall(extract_dir)
    return sum(1 for _ in extract_dir.rglob("*"))


def copy_card_images(extract_dir: Path, images_dir: Path) -> int:
    images_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for path in extract_dir.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in IMAGE_EXTS:
            continue
        if "cards" not in {part.lower() for part in path.parts}:
            continue

        target = images_dir / path.name
        if target.exists():
            rel = path.relative_to(extract_dir)
            stem = target.stem
            suffix = target.suffix
            rel_slug = slugify(str(rel.parent).replace("/", "__").replace("\\", "__"))
            target = images_dir / f"{stem}__{rel_slug}{suffix}"

        shutil.copy2(path, target)
        count += 1
    return count


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Download Arkham Horror LCG HD image packs and extract raw card images."
    )
    parser.add_argument("--page-url", default=PAGE_URL)
    parser.add_argument("--out-dir", default="arkham_hd_downloads")
    parser.add_argument("--match", help="Regex filter for pack title, e.g. 'Core Set|Dunwich|Carcosa'")
    parser.add_argument("--max", type=int, default=None, help="Only process the first N matching packs")
    parser.add_argument("--skip-image-copy", action="store_true")
    args = parser.parse_args()

    if gdown is None:
        print("Please install gdown first: pip install gdown")
        return 2

    root = Path(args.out_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)

    print(f"Fetching index: {args.page_url}")
    packs = fetch_pack_index(args.page_url)
    print(f"Found {len(packs)} Google Drive packs on the page.")

    if args.match:
        rx = re.compile(args.match, re.IGNORECASE)
        packs = [p for p in packs if rx.search(p["title"])]
        print(f"After --match filter: {len(packs)} packs")

    if args.max is not None:
        packs = packs[: args.max]
        print(f"After --max limit: {len(packs)} packs")

    if not packs:
        print("No packs matched.")
        return 1

    manifest: List[Dict[str, Any]] = []

    for idx, pack in enumerate(packs, 1):
        section_dir = root / slugify(pack["section"])
        pack_dir = section_dir / slugify(pack["title"])
        pack_dir.mkdir(parents=True, exist_ok=True)

        o8c_path = pack_dir / f"{slugify(pack['title'])}.o8c"
        extract_dir = pack_dir / "extracted"
        images_dir = pack_dir / "card_images"

        entry: Dict[str, Any] = {
            "index": idx,
            "section": pack["section"],
            "title": pack["title"],
            "url": pack["url"],
            "file_id": pack["file_id"],
            "pack_dir": str(pack_dir),
            "o8c_path": str(o8c_path),
            "extract_dir": str(extract_dir),
            "images_dir": str(images_dir),
            "status": "pending",
        }

        print(f"\n[{idx}/{len(packs)}] {pack['section']} / {pack['title']}")

        try:
            ok, detail = download_pack(pack["file_id"], o8c_path)
            entry["download_detail"] = detail
            if not ok:
                entry["status"] = "download_failed"
                manifest.append(entry)
                print(f"  ! Download failed: {detail}")
                continue

            if file_looks_like_html(o8c_path):
                entry["status"] = "downloaded_html"
                manifest.append(entry)
                print("  ! Downloaded HTML page instead of .o8c")
                continue

            if not zipfile.is_zipfile(o8c_path):
                entry["status"] = "not_a_zip_like_o8c"
                manifest.append(entry)
                print("  ! Downloaded file is not recognized as a zip-compatible .o8c")
                continue

            file_count = extract_o8c(o8c_path, extract_dir)
            entry["extracted_file_count"] = file_count
            print(f"  - Extracted files: {file_count}")

            if args.skip_image_copy:
                entry["card_image_count"] = None
                entry["status"] = "ok_extracted_only"
            else:
                image_count = copy_card_images(extract_dir, images_dir)
                entry["card_image_count"] = image_count
                entry["status"] = "ok"
                print(f"  - Copied raw card images: {image_count}")

        except KeyboardInterrupt:
            print("\nInterrupted by user.")
            break
        except Exception as e:
            entry["status"] = "error"
            entry["error"] = repr(e)
            print(f"  ! Error: {e}")

        manifest.append(entry)
        (root / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    (root / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\nDone. Manifest written to: {root / 'manifest.json'}")
    print("Tip: start with --match 'Core Set|Dunwich' so you don't accidentally download everything.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
