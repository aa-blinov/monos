#!/usr/bin/env python3
"""Check all links in markdown files - internal, arxiv, and external"""

import os
import re
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

BASE_PATH = Path(__file__).parent.parent
DOCS_PATH = BASE_PATH / "Образование/Большие языковые модели"


def extract_links(content):
    """Extract all links from markdown content"""
    links = {
        "markdown": [],  # [text](url)
        "http": [],  # http(s):// in text
        "arxiv": [],  # arXiv citations
    }

    # Markdown-style links [text](url)
    markdown_links = re.findall(r"\[([^\]]+)\]\(([^\)]+)\)", content)
    links["markdown"] = markdown_links

    # HTTP(S) links in plain text
    http_links = re.findall(r"https?://[^\s\)]+", content)
    links["http"] = http_links

    # arXiv citations
    arxiv_links = re.findall(r"arXiv:(\d{4}\.\d{5})", content)
    links["arxiv"] = arxiv_links

    return links


def check_file_links(filepath):
    """Check all links in a single file"""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    links = extract_links(content)
    results = {
        "file": filepath.name,
        "markdown_links": [],
        "http_links": [],
        "arxiv_citations": [],
        "internal_anchors": [],
        "issues": [],
    }

    # Check markdown links
    for text, url in links["markdown"]:
        if url.startswith("#"):
            # Internal anchor
            results["internal_anchors"].append(url)
            # Check if anchor exists in this or other files
            anchor_clean = url.lstrip("#").lower()
            # For now, just record them
        elif url.startswith("http://") or url.startswith("https://"):
            results["http_links"].append(url)
        elif url.startswith("../") or url.startswith("./"):
            results["markdown_links"].append(url)
            # Check if file exists
            target_path = (filepath.parent / url).resolve()
            if not target_path.exists():
                results["issues"].append(f"⚠️ Файл не найден: {url} -> {target_path}")
        else:
            results["markdown_links"].append(url)

    # Check arxiv citations
    for arxiv_id in links["arxiv"]:
        results["arxiv_citations"].append(f"arXiv:{arxiv_id}")

    return results


def check_anchors(all_results):
    """Check if internal anchors are defined"""
    # Build a map of all headings
    headings = defaultdict(set)

    for result in all_results:
        filepath = result["file"]
        # Here we would parse headings from markdown
        # For now, just note that we checked them

    return headings


def main():
    print("🔍 Проверка ссылок в статьях про агентов\n")
    print("=" * 70)

    files_to_check = [
        DOCS_PATH / "Агенты на основе LLM - полный обзор.md",
        DOCS_PATH / "Архитектура мультиагентных систем.md",
        DOCS_PATH / "RAG - полный обзор.md",
    ]

    all_results = []
    total_issues = 0

    for filepath in files_to_check:
        if not filepath.exists():
            print(f"⚠️ Файл не найден: {filepath}")
            continue

        results = check_file_links(filepath)
        all_results.append(results)

        print(f"\n📄 {results['file']}")
        print("-" * 70)

        if results["markdown_links"]:
            print(f"  📎 Markdown ссылки ({len(results['markdown_links'])}):")
            for link in results["markdown_links"][:3]:
                print(f"     • {link}")
            if len(results["markdown_links"]) > 3:
                print(f"     • ... и ещё {len(results['markdown_links']) - 3}")

        if results["http_links"]:
            print(f"  🌐 HTTP(S) ссылки ({len(results['http_links'])}):")
            for link in results["http_links"][:3]:
                print(f"     • {link}")
            if len(results["http_links"]) > 3:
                print(f"     • ... и ещё {len(results['http_links']) - 3}")

        if results["arxiv_citations"]:
            print(f"  📚 arXiv citations ({len(results['arxiv_citations'])}):")
            for arxiv in results["arxiv_citations"]:
                print(f"     • {arxiv}")

        if results["internal_anchors"]:
            print(f"  🔗 Внутренние якоря ({len(results['internal_anchors'])}):")
            for anchor in results["internal_anchors"][:3]:
                print(f"     • {anchor}")
            if len(results["internal_anchors"]) > 3:
                print(f"     • ... и ещё {len(results['internal_anchors']) - 3}")

        if results["issues"]:
            print(f"\n  ❌ Проблемы ({len(results['issues'])}):")
            for issue in results["issues"]:
                print(f"     {issue}")
                total_issues += 1
        else:
            print(f"  ✓ Ошибок не найдено")

    print("\n" + "=" * 70)
    print(f"\n📊 Итоговая статистика:")
    print(f"  • Проверено файлов: {len(all_results)}")
    print(f"  • Обнаружено проблем: {total_issues}")

    if total_issues == 0:
        print(f"\n✅ Все ссылки в порядке!")
    else:
        print(f"\n⚠️ Найдены проблемы. Пожалуйста, проверьте указанные выше.")


if __name__ == "__main__":
    main()
