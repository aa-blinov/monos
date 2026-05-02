#!/usr/bin/env python3
"""
Модель для управления заметками
"""

import subprocess
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import yaml


class NotesManager:
    """Менеджер для работы с заметками"""

    def __init__(self, root_path: Optional[Path] = None):
        """
        Инициализация менеджера

        Args:
            root_path: Путь к корню репозитория (по умолчанию текущая директория)
        """
        if root_path is None:
            # Ищем .git папку для определения корня
            current = Path.cwd()
            while current != current.parent:
                if (current / ".git").exists():
                    root_path = current
                    break
                current = current.parent
            else:
                root_path = Path.cwd()

        self.root_path = root_path
        self.notes_dir = root_path / "Образование"
        self.scripts_dir = root_path / ".scripts"

    def get_all_notes(self) -> List[Path]:
        """Получить все файлы заметок"""
        notes = []
        for md_file in self.notes_dir.rglob("*.md"):
            # Пропускаем README.md
            if md_file.name == "README.md":
                continue
            notes.append(md_file)
        return sorted(notes)

    def get_all_directories(self) -> List[Path]:
        """Получить все директории заметок"""
        dirs = []
        for d in self.notes_dir.rglob(""):
            if d.is_dir() and not d.name.startswith("."):
                dirs.append(d)
        return sorted(dirs)

    def search(self, query: str) -> List[Path]:
        """
        Поиск по названиям и содержимому заметок

        Args:
            query: Строка для поиска (case-insensitive)

        Returns:
            Список найденных файлов
        """
        query_lower = query.lower()
        results = []

        # Поиск по названиям файлов
        for note in self.get_all_notes():
            if query_lower in note.name.lower():
                results.append(note)

        # Поиск по содержимому (рекурсивный grep)
        try:
            result = subprocess.run(
                ["grep", "-r", "-i", "-l", query, str(self.notes_dir)], capture_output=True, text=True, timeout=5
            )

            if result.stdout:
                for line in result.stdout.strip().split("\n"):
                    path = Path(line)
                    if path.suffix == ".md" and path not in results:
                        results.append(path)
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass

        return sorted(list(set(results)))

    def get_recent_notes(self, limit: int = 10) -> List[Path]:
        """
        Получить недавно изменённые заметки

        Args:
            limit: Максимальное количество

        Returns:
            Список недавних файлов
        """
        notes = self.get_all_notes()
        # Сортируем по времени изменения (новые первыми)
        notes.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        return notes[:limit]

    def create_note(
        self, title: str, category: str = "Образование", tags: Optional[List[str]] = None, content: str = ""
    ) -> Path:
        """
        Создать новую заметку с YAML фронтматтером

        Args:
            title: Название заметки
            category: Категория/путь
            tags: Список тегов
            content: Содержимое (опционально)

        Returns:
            Путь к созданному файлу
        """
        if tags is None:
            tags = []

        # Генерируем имя файла из названия
        filename = title.lower().replace(" ", "_") + ".md"

        # Определяем путь
        if category:
            dir_path = self.notes_dir / category
        else:
            dir_path = self.notes_dir

        dir_path.mkdir(parents=True, exist_ok=True)
        file_path = dir_path / filename

        # Проверяем существование
        counter = 1
        while file_path.exists():
            base = title.lower().replace(" ", "_")
            filename = f"{base}_{counter}.md"
            file_path = dir_path / filename
            counter += 1

        # Создаём YAML фронтматтер
        frontmatter = {
            "title": title,
            "date": datetime.now().isoformat(),
            "category": category,
            "tags": tags,
            "status": "draft",
        }

        # Пишем файл
        with open(file_path, "w", encoding="utf-8") as f:
            f.write("---\n")
            f.write(yaml.dump(frontmatter, allow_unicode=True, default_flow_style=False))
            f.write("---\n\n")
            if content:
                f.write(content)
            else:
                f.write(f"# {title}\n\n")

        return file_path

    def get_note_metadata(self, note_path: Path) -> dict:
        """
        Получить YAML фронтматтер из заметки

        Args:
            note_path: Путь к заметке

        Returns:
            Словарь метаданных
        """
        try:
            with open(note_path, "r", encoding="utf-8") as f:
                content = f.read()

            # Находим YAML блок
            if content.startswith("---"):
                parts = content.split("---", 2)
                if len(parts) >= 2:
                    metadata = yaml.safe_load(parts[1])
                    return metadata or {}
        except Exception:
            pass

        return {}

    def get_note_size(self, note_path: Path) -> str:
        """
        Получить размер файла в читаемом формате

        Args:
            note_path: Путь к заметке

        Returns:
            Размер в KB или MB
        """
        size = note_path.stat().st_size

        if size < 1024:
            return f"{size}B"
        elif size < 1024 * 1024:
            return f"{size / 1024:.1f}KB"
        else:
            return f"{size / (1024 * 1024):.1f}MB"

    def format_notes(self) -> bool:
        """
        Запустить форматирование всех заметок

        Returns:
            True если успешно, False если ошибка
        """
        try:
            script = self.scripts_dir / "format_notes.py"
            if script.exists():
                subprocess.run(["python3", str(script)], check=True)
                return True
        except subprocess.CalledProcessError:
            return False

        return False

    def sync_git(self, message: str = "Auto-sync from TUI") -> bool:
        """
        Синхронизировать с Git

        Args:
            message: Сообщение коммита

        Returns:
            True если успешно
        """
        try:
            cwd = self.root_path

            # git add
            subprocess.run(["git", "add", "-A"], cwd=cwd, check=True, capture_output=True)

            # git commit (игнорируем ошибку если нечего коммитить)
            subprocess.run(["git", "commit", "-m", message], cwd=cwd, capture_output=True)

            # git push
            subprocess.run(["git", "push"], cwd=cwd, check=True, capture_output=True)

            return True
        except subprocess.CalledProcessError:
            return False

    def get_stats(self) -> dict:
        """
        Получить статистику по заметкам

        Returns:
            Словарь со статистикой
        """
        notes = self.get_all_notes()
        total_size = sum(n.stat().st_size for n in notes)

        # Группируем по категориям
        categories = defaultdict(int)
        for note in notes:
            rel_path = note.relative_to(self.notes_dir)
            category = str(rel_path.parts[0]) if rel_path.parts else "Другое"
            categories[category] += 1

        # Подсчитываем теги
        all_tags = set()
        for note in notes:
            metadata = self.get_note_metadata(note)
            tags = metadata.get("tags", [])
            if isinstance(tags, list):
                all_tags.update(tags)

        return {
            "total_notes": len(notes),
            "total_size": total_size,
            "total_size_mb": total_size / (1024 * 1024),
            "categories": dict(categories),
            "tags": len(all_tags),
            "recent": len(self.get_recent_notes(10)),
        }
