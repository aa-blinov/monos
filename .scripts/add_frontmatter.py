#!/usr/bin/env python3
"""
Скрипт для добавления YAML frontmatter ко всем Markdown файлам без него.

Использование:
    uv run .scripts/add_frontmatter.py

Автоматически:
1. Сканирует все .md файлы в проекте
2. Проверяет наличие фронтматтера (начинается с ---)
3. Для файлов без фронтматтера генерирует его на основе:
   - Названия файла (title)
   - Пути в структуре (category)
   - Текущей даты (date)
4. Добавляет минимальный набор тегов (пусто по умолчанию)
5. Сохраняет файлы с новым фронтматтером
"""

import os
import re
import sys
from datetime import datetime
from pathlib import Path


def get_title_from_filename(filename: str) -> str:
    """Генерирует title из имени файла."""
    # Убираем расширение .md
    name = filename.replace(".md", "")
    # Убираем дату в начале (YYYY-MM-DD format)
    name = re.sub(r"^\d{2}-\d{2}-\d{4}\s*", "", name)
    name = re.sub(r"^\d{4}-\d{2}-\d{2}\s*", "", name)
    return name.strip()


def get_category_from_path(filepath: str, project_root: str) -> str:
    """Генерирует category из пути файла."""
    # Получаем относительный путь от корня проекта
    rel_path = Path(filepath).relative_to(project_root)
    # Убираем имя файла, оставляем только директории
    category_parts = rel_path.parent.parts
    # Исключаем скрытые директории и корень
    category_parts = [p for p in category_parts if not p.startswith(".")]
    if category_parts:
        return "/".join(category_parts)
    return "Прочее"


def has_frontmatter(content: str) -> bool:
    """Проверяет, есть ли фронтматтер в начале файла."""
    lines = content.split("\n")
    if not lines or not lines[0].strip().startswith("---"):
        return False
    return True


def generate_frontmatter(filepath: str, project_root: str) -> str:
    """Генерирует YAML фронтматтер для файла."""
    filename = Path(filepath).name
    title = get_title_from_filename(filename)
    category = get_category_from_path(filepath, project_root)
    date = datetime.now().isoformat(timespec="seconds") + "+00:00"

    frontmatter = f"""---
title: {title}
date: {date}
category: {category}
tags: []
status: draft
---
"""
    return frontmatter


def add_frontmatter_to_file(filepath: str, project_root: str) -> bool:
    """Добавляет фронтматтер к файлу. Возвращает True если было изменено."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        # Пропускаем файлы с фронтматтером
        if has_frontmatter(content):
            return False

        # Пропускаем файлы в docs/ (они могут быть документацией)
        if "docs/" in filepath:
            return False

        # Генерируем и добавляем фронтматтер
        frontmatter = generate_frontmatter(filepath, project_root)
        new_content = frontmatter + content

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_content)

        return True

    except Exception as e:
        print(f"❌ Ошибка при обработке {filepath}: {e}", file=sys.stderr)
        return False


def main():
    """Основная функция."""
    # Получаем корень проекта
    script_dir = Path(__file__).parent
    project_root = script_dir.parent

    print(f"📍 Корень проекта: {project_root}")
    print(f"🔍 Сканирование .md файлов...\n")

    # Находим все .md файлы
    md_files = list(project_root.glob("**/*.md"))
    print(f"📊 Найдено файлов: {len(md_files)}\n")

    # Обрабатываем файлы
    updated = 0
    skipped = 0
    errors = 0

    for filepath in sorted(md_files):
        rel_path = filepath.relative_to(project_root)

        if add_frontmatter_to_file(str(filepath), str(project_root)):
            print(f"✅ {rel_path}")
            updated += 1
        else:
            # Проверяем, почему пропустили
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()

            if has_frontmatter(content):
                print(f"⏭️  {rel_path} (уже имеет фронтматтер)")
            elif "docs/" in str(filepath):
                print(f"📚 {rel_path} (документация, пропущено)")
            else:
                print(f"⏭️  {rel_path} (пропущено)")

            skipped += 1

    # Итоги
    print(f"\n{'=' * 60}")
    print(f"📈 Результаты:")
    print(f"   ✅ Обновлено: {updated}")
    print(f"   ⏭️  Пропущено: {skipped}")
    print(f"   ❌ Ошибок: {errors}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
