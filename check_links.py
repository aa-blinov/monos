#!/usr/bin/env python3
"""
Check for dead links in markdown files.
Validates internal links and image paths.

Usage:
    uv run check_links.py                    # Check all files
    uv run check_links.py --fix              # Fix relative links
    uv run check_links.py --verbose          # Detailed output
"""

import argparse
import re
from pathlib import Path
from typing import Set, Tuple
from urllib.parse import urlparse


class LinkChecker:
    """Check for dead links in Markdown files."""

    def __init__(self, root_dir: Path = None, verbose: bool = False):
        """Initialize the link checker."""
        self.root_dir = root_dir or Path.cwd()
        self.verbose = verbose
        self.md_files: Set[Path] = set()
        self.asset_files: Set[Path] = set()
        self.dead_links: list = []
        self.warnings: list = []

        # Patterns for finding links
        self.link_pattern = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")  # [text](url)
        self.image_pattern = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")  # ![alt](url)
        self.frontmatter_pattern = re.compile(r"^---\n(.*?)\n---\n", re.DOTALL)

    def scan_files(self) -> None:
        """Scan for all markdown and asset files."""
        # Find markdown files
        for md_file in self.root_dir.rglob("*.md"):
            if ".git" not in md_file.parts:
                self.md_files.add(md_file)

        # Find asset files
        assets_dir = self.root_dir / "assets"
        if assets_dir.exists():
            for asset_file in assets_dir.rglob("*"):
                if asset_file.is_file():
                    self.asset_files.add(asset_file)

        if self.verbose:
            print(f"📝 Found {len(self.md_files)} markdown files")
            print(f"📦 Found {len(self.asset_files)} asset files")

    def check_file(self, file_path: Path) -> None:
        """Check a single markdown file for dead links."""
        try:
            content = file_path.read_text(encoding="utf-8")
        except Exception as e:
            self.warnings.append(f"⚠️  Cannot read {file_path}: {e}")
            return

        # Remove frontmatter
        content_without_fm = self.frontmatter_pattern.sub("", content)

        # Check markdown links
        for match in self.link_pattern.finditer(content_without_fm):
            text, url = match.groups()
            self._check_link(file_path, url, text, is_image=False)

        # Check image links
        for match in self.image_pattern.finditer(content_without_fm):
            alt, url = match.groups()
            self._check_link(file_path, url, alt, is_image=True)

    def _check_link(self, file_path: Path, url: str, text: str, is_image: bool = False) -> None:
        """Check a single link."""
        # Skip external URLs
        if url.startswith(("http://", "https://", "ftp://", "mailto:")):
            return

        # Skip anchors only
        if url.startswith("#"):
            return

        # Parse URL with potential anchor
        url_without_anchor = url.split("#")[0] if "#" in url else url

        # If empty path, it's current file
        if not url_without_anchor:
            return

        # Resolve relative path
        try:
            target_path = (file_path.parent / url_without_anchor).resolve()
        except Exception as e:
            self.dead_links.append(
                {
                    "file": str(file_path.relative_to(self.root_dir)),
                    "url": url,
                    "type": "🖼️ " if is_image else "🔗",
                    "error": f"Invalid path: {e}",
                }
            )
            return

        # Check if file exists
        if not target_path.exists():
            self.dead_links.append(
                {
                    "file": str(file_path.relative_to(self.root_dir)),
                    "url": url,
                    "type": "🖼️ " if is_image else "🔗",
                    "error": "File not found",
                }
            )
            if self.verbose:
                print(f"  ❌ {url} → {target_path}")
            return

        if self.verbose:
            print(f"  ✅ {url}")

    def print_report(self) -> None:
        """Print the full report."""
        print("\n" + "=" * 70)
        print("📋 LINK CHECK REPORT")
        print("=" * 70)

        if not self.dead_links and not self.warnings:
            print("✅ All links are valid!")
            print("=" * 70)
            return

        if self.warnings:
            print("\n⚠️  WARNINGS:")
            for warning in self.warnings:
                print(f"  {warning}")

        if self.dead_links:
            print(f"\n❌ DEAD LINKS FOUND ({len(self.dead_links)}):")
            print()

            # Group by file
            by_file = {}
            for link_info in self.dead_links:
                file = link_info["file"]
                if file not in by_file:
                    by_file[file] = []
                by_file[file].append(link_info)

            for file, links in sorted(by_file.items()):
                print(f"📄 {file}")
                for link_info in links:
                    print(f"  {link_info['type']} {link_info['url']:<40} → {link_info['error']}")
                print()

        print("=" * 70)

    def run(self) -> int:
        """Run the full check."""
        print("🔍 Scanning for links...")
        self.scan_files()

        print("🔗 Checking links...")
        for md_file in sorted(self.md_files):
            self.check_file(md_file)

        self.print_report()

        return 1 if self.dead_links else 0


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Check for dead links in markdown files")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--root", "-r", type=Path, default=Path.cwd(), help="Root directory")

    args = parser.parse_args()

    checker = LinkChecker(root_dir=args.root, verbose=args.verbose)
    return checker.run()


if __name__ == "__main__":
    import sys

    sys.exit(main())
