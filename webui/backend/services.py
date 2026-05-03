"""
Service layer for file and notes operations
"""

import json
import logging
import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import yaml
from schemas import (
    DirectoryNode,
    FileInfo,
    FileMetadata,
    SearchResult,
    Settings,
)

logger = logging.getLogger(__name__)


class NotesService:
    """Сервис для работы с заметками"""

    def __init__(self, root_path: Optional[Path] = None):
        if root_path is None:
            # Check Docker volume mount first
            if Path("/app/notes").exists():
                root_path = Path("/app")
                logger.info(f"Using Docker mounted root: {root_path}")
            else:
                # Search for .git folder
                current = Path.cwd()
                while current != current.parent:
                    if (current / ".git").exists():
                        root_path = current
                        logger.info(f"Found .git at: {root_path}")
                        break
                    current = current.parent
                else:
                    root_path = Path.cwd()
                    logger.warning(f"No .git found, using cwd: {root_path}")

        self.root_path = root_path
        logger.info(f"Root path: {self.root_path}")

        # Use notes directory for browsing all categories
        self.notes_dir = root_path / "notes"
        logger.info(f"Notes dir: {self.notes_dir}")

        # Settings path
        self.settings_path = root_path / ".zed_settings.json"
        self._settings = self._load_settings()

        # List available directories
        if self.notes_dir.exists():
            available_dirs = [d.name for d in self.notes_dir.iterdir() if d.is_dir() and not d.name.startswith(".")]
            logger.info(f"Available directories: {available_dirs}")

    def _load_settings(self) -> Settings:
        """Загрузить настройки из файла"""
        if self.settings_path.exists():
            try:
                with open(self.settings_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return Settings(**data)
            except Exception as e:
                logger.error(f"Failed to load settings: {e}")
        return Settings()

    def get_settings(self) -> Settings:
        """Получить текущие настройки"""
        return self._settings

    def update_settings(self, settings: Settings) -> Settings:
        """Обновить настройки"""
        self._settings = settings
        try:
            with open(self.settings_path, "w", encoding="utf-8") as f:
                json.dump(settings.model_dump(), f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Failed to save settings: {e}")
        return self._settings

    def get_directory_tree(self, path: Optional[Path] = None) -> DirectoryNode:
        """Получить дерево директорий (Оптимизировано)"""
        if path is None:
            path = self.notes_dir

        if not path.exists():
            raise ValueError(f"Path does not exist: {path}")

        is_dir = path.is_dir()
        
        # ОПТИМИЗАЦИЯ: Не считаем размер всей папки рекурсивно, только для файлов
        size = path.stat().st_size if not is_dir else 0

        node = DirectoryNode(
            path=str(path.relative_to(self.root_path)),
            name=path.name,
            is_dir=is_dir,
            size=size,
            size_human=self._humanize_size(size) if not is_dir else "",
            metadata=self._get_metadata(path) if not is_dir else None,
        )

        if is_dir:
            try:
                # Используем scandir для более быстрого обхода
                with os.scandir(path) as it:
                    entries = []
                    for entry in it:
                        if entry.name.startswith(".") or entry.name == "README.md":
                            continue
                        entries.append(entry)
                    
                    # Сортировка: сначала папки, потом файлы
                    entries.sort(key=lambda e: (not e.is_dir(), e.name.lower()))
                    
                    for entry in entries:
                        entry_path = Path(entry.path)
                        if entry.is_dir():
                            # ОПТИМИЗАЦИЯ: Убрали rglob. 
                            # Просто добавляем все папки в notes/
                            child = self.get_directory_tree(entry_path)
                            node.children.append(child)
                        elif entry.name.endswith(".md"):
                            child = self.get_directory_tree(entry_path)
                            node.children.append(child)
            except PermissionError as e:
                logger.warning(f"Permission denied accessing {path}: {e}")

        return node

    def create_directory(self, dir_path: str) -> None:
        """Создать новую директорию в разделе notes/"""
        # Гарантируем, что путь начинается с notes/
        path = Path(dir_path)
        if not str(path).startswith("notes"):
            path = Path("notes") / path
            
        full_path = self.root_path / path
        full_path.mkdir(parents=True, exist_ok=True)
        logger.info(f"Created directory: {full_path}")

    def get_file_info(self, file_path: str) -> FileInfo:
        """Получить информацию о файле"""
        path = self.root_path / file_path
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")

        stat = path.stat()
        return FileInfo(
            path=str(path.relative_to(self.root_path)),
            name=path.name,
            is_dir=path.is_dir(),
            size=stat.st_size,
            size_human=self._humanize_size(stat.st_size),
            modified=datetime.fromtimestamp(stat.st_mtime),
            created=datetime.fromtimestamp(stat.st_ctime),
            metadata=self._get_metadata(path) if path.is_file() else None,
        )

    def read_file(self, file_path: str) -> str:
        """Прочитать содержимое файла"""
        path = self.root_path / file_path
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")

        with open(path, "r", encoding="utf-8") as f:
            return f.read()

    def write_file(self, file_path: str, content: str) -> None:
        """Написать содержимое файла"""
        path = self.root_path / file_path
        path.parent.mkdir(parents=True, exist_ok=True)

        with open(path, "w", encoding="utf-8") as f:
            f.write(content)

    def create_note(
        self,
        title: str,
        category: str,
        tags: List[str],
        content: str = "",
    ) -> str:
        """Создать новую заметку"""
        # Генерируем имя файла
        filename = title.lower().replace(" ", "_") + ".md"

        # Определяем путь
        if category:
            dir_path = self.root_path / category
        else:
            dir_path = self.root_path

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

        return str(file_path.relative_to(self.root_path))

    def delete_file(self, file_path: str) -> None:
        """Удалить файл или директорию"""
        path = self.root_path / file_path
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")

        if path.is_file():
            path.unlink()
        else:
            shutil.rmtree(path)

    def rename_file(self, file_path: str, new_name: str) -> str:
        """Переименовать файл"""
        path = self.root_path / file_path
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")

        new_path = path.parent / new_name
        path.rename(new_path)

        return str(new_path.relative_to(self.root_path))

    def search(self, query: str, search_content: bool = True) -> List[SearchResult]:
        """Поиск по файлам"""
        query_lower = query.lower()
        results = []

        # Поиск по названиям
        for note in self.root_path.rglob("*.md"):
            if note.name == "README.md":
                continue

            if query_lower in note.name.lower():
                results.append(
                    SearchResult(
                        path=str(note.relative_to(self.root_path)),
                        name=note.name,
                    )
                )

        # Поиск по содержимому
        if search_content:
            try:
                result = subprocess.run(
                    ["grep", "-r", "-i", "-l", query, str(self.root_path)],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )

                if result.stdout:
                    for line in result.stdout.strip().split("\n"):
                        path = Path(line)
                        if path.suffix == ".md" and path.name != "README.md":
                            rel_path = str(path.relative_to(self.root_path))
                            # Проверяем, уже ли есть в results
                            if not any(r.path == rel_path for r in results):
                                results.append(SearchResult(path=rel_path, name=path.name))
            except (subprocess.TimeoutExpired, FileNotFoundError):
                pass

        return sorted(results, key=lambda r: r.name)

    def sync_git(self, message: Optional[str] = None) -> dict:
        """Профессиональная синхронизация с Git (Rebase strategy)"""
        if message is None:
            message = self._settings.git_commit_message

        try:
            # 1. Проверяем наличие изменений
            status_proc = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=self.root_path,
                capture_output=True,
                text=True,
                check=True
            )
            has_changes = bool(status_proc.stdout.strip())

            # 2. Коммитим локальные изменения
            if has_changes:
                subprocess.run(["git", "add", "-A"], cwd=self.root_path, check=True, capture_output=True)
                subprocess.run(["git", "commit", "-m", message], cwd=self.root_path, check=True, capture_output=True)
                logger.info(f"Committed changes with message: {message}")

            # 3. Fetch
            subprocess.run(["git", "fetch", "origin"], cwd=self.root_path, check=True, capture_output=True)

            # 4. Pull --rebase
            # Определяем текущую ветку
            branch_proc = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=self.root_path,
                capture_output=True,
                text=True,
                check=True
            )
            branch = branch_proc.stdout.strip()

            pull_proc = subprocess.run(
                ["git", "pull", "--rebase", "origin", branch],
                cwd=self.root_path,
                capture_output=True,
                text=True
            )

            if pull_proc.returncode != 0:
                # КОНФЛИКТ!
                logger.error(f"Sync conflict during rebase: {pull_proc.stderr}")
                subprocess.run(["git", "rebase", "--abort"], cwd=self.root_path, capture_output=True)
                return {
                    "success": False,
                    "message": "Конфликт при синхронизации. Пожалуйста, разрешите конфликты вручную в репозитории."
                }

            # 5. Push
            subprocess.run(["git", "push", "origin", branch], cwd=self.root_path, check=True, capture_output=True)
            
            logger.info("Git sync completed successfully")
            return {"success": True, "message": "Синхронизация успешна"}

        except subprocess.CalledProcessError as e:
            error_msg = e.stderr.decode() if isinstance(e.stderr, bytes) else str(e.stderr)
            logger.error(f"Git error during sync: {error_msg}")
            return {"success": False, "message": f"Ошибка Git: {error_msg}"}
        except Exception as e:
            logger.error(f"Unexpected error during sync: {e}")
            return {"success": False, "message": f"Ошибка: {str(e)}"}

    def format_notes(self) -> dict:
        """Форматировать заметки"""
        try:
            script_path = self.root_path / ".scripts" / "format_notes.py"
            if script_path.exists():
                result = subprocess.run(
                    ["python3", str(script_path)],
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
                if result.returncode == 0:
                    return {"success": True, "message": "Форматирование завершено"}
                else:
                    return {
                        "success": False,
                        "message": f"Ошибка форматирования: {result.stderr}",
                    }
            else:
                return {"success": False, "message": "Скрипт форматирования не найден"}
        except subprocess.TimeoutExpired:
            return {"success": False, "message": "Форматирование заняло слишком много времени"}
        except Exception as e:
            return {"success": False, "message": f"Ошибка: {str(e)}"}

    def get_stats(self) -> dict:
        """Получить статистику"""
        notes = []
        for note in self.root_path.rglob("*.md"):
            if note.name != "README.md":
                notes.append(note)

        total_size = sum(n.stat().st_size for n in notes)

        return {
            "total_notes": len(notes),
            "total_size": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
        }

    # ===== Private Methods =====

    @staticmethod
    def _get_size(path: Path) -> int:
        """Получить размер файла/папки"""
        if path.is_file():
            return path.stat().st_size
        else:
            total = 0
            try:
                for entry in path.rglob("*"):
                    if entry.is_file():
                        total += entry.stat().st_size
            except PermissionError:
                pass
            return total

    @staticmethod
    def _humanize_size(size: int) -> str:
        """Преобразовать размер в читаемый формат"""
        if size < 1024:
            return f"{size}B"
        elif size < 1024 * 1024:
            return f"{size / 1024:.1f}KB"
        else:
            return f"{size / (1024 * 1024):.1f}MB"

    @staticmethod
    def _get_metadata(path: Path) -> Optional[FileMetadata]:
        """Получить YAML фронтматтер из файла"""
        if not path.is_file() or path.suffix != ".md":
            return None

        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()

            if content.startswith("---"):
                parts = content.split("---", 2)
                if len(parts) >= 2:
                    metadata = yaml.safe_load(parts[1])
                    if isinstance(metadata, dict):
                        return FileMetadata(**metadata)
        except Exception:
            pass

        return None
