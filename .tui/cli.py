#!/usr/bin/env python3
"""
CLI для Zed Notes TUI
"""

import argparse
import sys
from pathlib import Path

try:
    from .app import NotesApp
    from .models import NotesManager
except ImportError:
    from app import NotesApp
    from models import NotesManager


def main():
    """Главная функция CLI"""
    parser = argparse.ArgumentParser(
        description="Zed Notes TUI — управление заметками через терминал",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Примеры:
  notes-tui                    # Запустить полный TUI
  notes-tui --new              # Создать новую заметку
  notes-tui --search react     # Поиск по тексту
  notes-tui --recent           # Показать недавние заметки
  notes-tui --format           # Форматировать все заметки
  notes-tui --sync             # Синхронизировать с Git
        """,
    )

    parser.add_argument("--version", action="version", version="%(prog)s 0.1.0")

    parser.add_argument("-n", "--new", action="store_true", help="Создать новую заметку")

    parser.add_argument("-s", "--search", type=str, metavar="QUERY", help="Поиск по заметкам")

    parser.add_argument("-r", "--recent", action="store_true", help="Показать недавние заметки")

    parser.add_argument("-f", "--format", action="store_true", help="Форматировать все заметки")

    parser.add_argument("--sync", action="store_true", help="Синхронизировать с Git (commit + push)")

    parser.add_argument("--stats", action="store_true", help="Показать статистику по заметкам")

    args = parser.parse_args()

    # Если нет опций — запускаем полный TUI
    if not any([args.new, args.search, args.recent, args.format, args.sync, args.stats]):
        app = NotesApp()
        app.run()
    else:
        # Обработка опций

        manager = NotesManager()

        if args.new:
            # Интерактивное создание заметки
            print("Создание новой заметки:")
            title = input("Название: ").strip()
            if not title:
                print("Ошибка: название не может быть пусто")
                sys.exit(1)

            category = input("Категория (по умолчанию Образование): ").strip() or "Образование"
            tags_str = input("Теги (через запятую, опционально): ").strip()
            tags = [t.strip() for t in tags_str.split(",")] if tags_str else []

            try:
                path = manager.create_note(title, category, tags)
                print(f"✓ Заметка создана: {path}")
            except Exception as e:
                print(f"✗ Ошибка: {e}")
                sys.exit(1)

        elif args.search:
            results = manager.search(args.search)
            if results:
                print(f"Найдено {len(results)} заметок:")
                for i, path in enumerate(results, 1):
                    rel_path = path.relative_to(manager.notes_dir)
                    size = manager.get_note_size(path)
                    print(f"  {i}. {rel_path} ({size})")
            else:
                print("Ничего не найдено")

        elif args.recent:
            recent = manager.get_recent_notes(10)
            print(f"Недавние заметки ({len(recent)}):")
            for i, path in enumerate(recent, 1):
                rel_path = path.relative_to(manager.notes_dir)
                size = manager.get_note_size(path)
                print(f"  {i}. {rel_path} ({size})")

        elif args.format:
            print("Форматирование заметок...")
            if manager.format_notes():
                print("✓ Форматирование завершено")
            else:
                print("✗ Ошибка форматирования")
                sys.exit(1)

        elif args.sync:
            print("Синхронизация с Git...")
            if manager.sync_git():
                print("✓ Синхронизация успешна")
            else:
                print("✗ Ошибка синхронизации")
                sys.exit(1)

        elif args.stats:
            stats = manager.get_stats()
            print("\nСтатистика по заметкам:")
            print(f"  Всего заметок: {stats['total_notes']}")
            print(f"  Общий размер: {stats['total_size_mb']:.2f} MB")
            print(f"  Категорий: {len(stats['categories'])}")
            print(f"  Всего тегов: {stats['tags']}")
            print(f"\nПо категориям:")
            for cat, count in sorted(stats["categories"].items()):
                print(f"  {cat}: {count}")


if __name__ == "__main__":
    main()
