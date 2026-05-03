"""
Service layer for file and notes operations
"""

import json
import logging
import os
import shutil
import subprocess
import hashlib
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import re
import yaml
import mdformat
from sqlalchemy import create_engine, desc
from sqlalchemy.orm import sessionmaker
from database import Base, NoteIndex, NoteLink, get_engine, get_session
from schemas import (
    DirectoryNode,
    FileInfo,
    FileMetadata,
    SearchResult,
    Settings,
)

logger = logging.getLogger(__name__)


class NotesService:
    """Сервис для работы с заметками (с гибридным хранилищем: Файлы + SQLite)"""

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

        # Database initialization
        db_dir = root_path / "data"
        db_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = db_dir / "notes_index.db"
        self.engine = get_engine(str(self.db_path))
        
        # Начальная индексация
        self.index_all_files()

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

    def index_all_files(self):
        """Просканировать все файлы и обновить индекс в БД"""
        logger.info("Starting background indexing...")
        session = get_session(self.engine)
        
        try:
            # 1. Получаем список всех файлов на диске
            files_on_disk = {}
            for item in self.notes_dir.rglob("*"):
                if item.name.startswith(".") or item.name == "README.md":
                    continue
                
                rel_path = str(item.relative_to(self.root_path))
                mtime = datetime.fromtimestamp(item.stat().st_mtime)
                files_on_disk[rel_path] = (item, mtime)

            # 2. Получаем текущий индекс из БД
            db_entries = session.query(NoteIndex).all()
            db_map = {entry.path: entry for entry in db_entries}

            # 3. Синхронизируем
            # Удаляем из БД то, чего нет на диске
            for path in db_map:
                if path not in files_on_disk:
                    session.delete(db_map[path])
            
            # Добавляем или обновляем
            for path, (item, mtime) in files_on_disk.items():
                is_dir = item.is_dir()
                
                if path not in db_map:
                    # Новый элемент
                    metadata = self._get_metadata(item) if not is_dir else None
                    title = metadata.title if metadata and metadata.title else item.name.replace(".md", "")
                    content = self.read_file(path) if not is_dir and item.suffix == ".md" else ""
                    
                    new_entry = NoteIndex(
                        path=path,
                        name=item.name,
                        title=title,
                        is_dir=is_dir,
                        parent_path=str(item.parent.relative_to(self.root_path)),
                        content=content,
                        tags=json.dumps(metadata.tags if metadata else []),
                        last_modified=mtime,
                        hash=self._get_file_hash(item) if not is_dir else ""
                    )
                    session.add(new_entry)
                    
                    # Извлекаем ссылки
                    if not is_dir and item.suffix == ".md":
                        self._update_links(session, path, content)
                else:
                    # Проверяем на изменения
                    entry = db_map[path]
                    if entry.last_modified != mtime:
                        metadata = self._get_metadata(item) if not is_dir else None
                        entry.title = metadata.title if metadata and metadata.title else item.name.replace(".md", "")
                        content = self.read_file(path) if not is_dir and item.suffix == ".md" else ""
                        entry.content = content
                        entry.tags = json.dumps(metadata.tags if metadata else [])
                        entry.last_modified = mtime
                        entry.hash = self._get_file_hash(item) if not is_dir else ""
                        
                        # Обновляем ссылки
                        if not is_dir and item.suffix == ".md":
                            self._update_links(session, path, content)

            session.commit()
        finally:
            session.close()
        logger.info("Indexing completed")

    def _update_links(self, session, source_path: str, content: str):
        """Извлечь ссылки [[...]] и обновить таблицу note_links"""
        # Удаляем старые ссылки
        session.query(NoteLink).filter(NoteLink.source_path == source_path).delete()
        
        # Находим новые ссылки
        links = re.findall(r"\[\[(.*?)\]\]", content)
        for link in links:
            # Обработка [[Note Name|Display Name]]
            target = link.split("|")[0].strip()
            if target:
                new_link = NoteLink(source_path=source_path, target_name=target)
                session.add(new_link)

    def _get_file_hash(self, path: Path) -> str:
        """Получить хеш файла для быстрой проверки изменений"""
        if path.is_dir(): return ""
        try:
            return hashlib.md5(path.read_bytes()).hexdigest()
        except:
            return ""

    def get_directory_tree(self, path: Optional[Path] = None) -> DirectoryNode:
        """Получить дерево директорий (Теперь из БД - мгновенно)"""
        if path is None:
            path = self.notes_dir
        
        rel_path = str(path.relative_to(self.root_path))
        
        session = get_session(self.engine)
        try:
            is_notes_root = rel_path == "notes"
            
            # Получаем всех детей из БД
            children_entries = session.query(NoteIndex).filter(NoteIndex.parent_path == rel_path).all()
            
            node = DirectoryNode(
                path=rel_path,
                name=path.name if not is_notes_root else "notes",
                is_dir=True,
                size=0,
                size_human="",
                metadata=None,
            )
            
            # Сортировка детей: папки вперед
            sorted_children = sorted(children_entries, key=lambda e: (not e.is_dir, e.name.lower()))
            
            for entry in sorted_children:
                if entry.is_dir:
                    child_node = self.get_directory_tree(self.root_path / entry.path)
                    node.children.append(child_node)
                else:
                    node.children.append(DirectoryNode(
                        path=entry.path,
                        name=entry.name,
                        is_dir=False,
                        size=0,
                        size_human="",
                        metadata=None
                    ))
            
            return node
        finally:
            session.close()

    def create_directory(self, dir_path: str) -> None:
        """Создать новую директорию в разделе notes/"""
        # Гарантируем, что путь начинается с notes/
        path = Path(dir_path)
        if not str(path).startswith("notes"):
            path = Path("notes") / path
            
        full_path = self.root_path / path
        full_path.mkdir(parents=True, exist_ok=True)
        logger.info(f"Created directory: {full_path}")
        self.index_all_files() # Переиндексируем

    def get_flat_directories(self) -> List[str]:
        """Получить список всех директорий (для выпадающих списков)"""
        dirs = [""] # Корень (notes/)
        for item in self.notes_dir.rglob("*"):
            if item.is_dir() and not item.name.startswith("."):
                dirs.append(str(item.relative_to(self.notes_dir)))
        return sorted(dirs)

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
        self.index_all_files() # Переиндексируем

    def create_note(
        self,
        title: str,
        category: str,
        tags: List[str],
        content: str = "",
    ) -> str:
        """Создать новую заметку"""
        filename = title.lower().replace(" ", "_") + ".md"

        if category:
            dir_path = self.root_path / category
        else:
            dir_path = self.root_path

        dir_path.mkdir(parents=True, exist_ok=True)
        file_path = dir_path / filename

        counter = 1
        while file_path.exists():
            base = title.lower().replace(" ", "_")
            filename = f"{base}_{counter}.md"
            file_path = dir_path / filename
            counter += 1

        frontmatter = {
            "title": title,
            "date": datetime.now().isoformat(),
            "category": category,
            "tags": tags,
            "status": "draft",
        }

        with open(file_path, "w", encoding="utf-8") as f:
            f.write("---\n")
            f.write(yaml.dump(frontmatter, allow_unicode=True, default_flow_style=False))
            f.write("---\n\n")
            if content:
                f.write(content)
            else:
                f.write(f"# {title}\n\n")

        self.index_all_files()
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
        self.index_all_files()

    def rename_file(self, file_path: str, new_name: str) -> str:
        """Переименовать файл или директорию"""
        path = self.root_path / file_path
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")

        if path.is_file() and path.suffix == ".md" and not new_name.lower().endswith(".md"):
            new_name += ".md"

        new_path = path.parent / new_name
        path.rename(new_path)

        self.index_all_files()
        return str(new_path.relative_to(self.root_path))

    def move_item(self, source_path: str, target_dir: str) -> None:
        """Переместить файл или директорию"""
        source = self.root_path / source_path
        target = self.root_path / target_dir / source.name

        if not source.exists():
            raise FileNotFoundError(f"Source not found: {source}")
        
        if str(target).startswith(str(source)):
            raise ValueError("Cannot move an item into itself")

        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(target))
        self.index_all_files()

    def search(self, query: str, search_content: bool = True) -> List[SearchResult]:
        """Поиск по индексу БД (Молниеносно)"""
        session = get_session(self.engine)
        try:
            query_str = f"%{query.lower()}%"
            
            # Поиск по названию или содержимому
            search_query = session.query(NoteIndex).filter(NoteIndex.is_dir == False)
            if search_content:
                search_query = search_query.filter(
                    (NoteIndex.name.ilike(query_str)) | 
                    (NoteIndex.content.ilike(query_str)) |
                    (NoteIndex.title.ilike(query_str))
                )
            else:
                search_query = search_query.filter(
                    (NoteIndex.name.ilike(query_str)) | 
                    (NoteIndex.title.ilike(query_str))
                )
            
            entries = search_query.all()
            results = []
            
            for entry in entries:
                # Генерируем простой сниппет
                excerpt = ""
                if search_content and query.lower() in entry.content.lower():
                    idx = entry.content.lower().find(query.lower())
                    start = max(0, idx - 40)
                    end = min(len(entry.content), idx + 60)
                    excerpt = entry.content[start:end].replace("\n", " ")
                    if start > 0: excerpt = "..." + excerpt
                    if end < len(entry.content): excerpt = excerpt + "..."
                else:
                    excerpt = "Совпадение в названии"
                
                results.append(SearchResult(
                    path=entry.path,
                    name=entry.name.replace(".md", ""),
                    excerpt=excerpt
                ))
            
            return sorted(results, key=lambda r: r.name)
        finally:
            session.close()

    def get_recent_notes(self, limit: int = 10) -> List[SearchResult]:
        """Получить список недавних файлов"""
        session = get_session(self.engine)
        try:
            entries = session.query(NoteIndex).filter(NoteIndex.is_dir == False).order_by(desc(NoteIndex.last_opened)).limit(limit).all()
            return [
                SearchResult(
                    path=e.path,
                    name=e.name.replace(".md", ""),
                    excerpt=f"Last opened: {e.last_opened.strftime('%Y-%m-%d %H:%M')}"
                ) for e in entries
            ]
        finally:
            session.close()

    def set_folder_icon(self, path: str, icon: str) -> None:
        """Установить иконку для папки"""
        session = get_session(self.engine)
        try:
            cfg = session.query(FolderConfig).filter(FolderConfig.path == path).first()
            if cfg:
                cfg.icon = icon
            else:
                cfg = FolderConfig(path=path, icon=icon)
                session.add(cfg)
            session.commit()
        finally:
            session.close()

    def sync_git(self, message: Optional[str] = None) -> dict:
        """Git Sync"""
        if message is None:
            message = self._settings.git_commit_message

        try:
            status_proc = subprocess.run(["git", "status", "--porcelain"], cwd=self.root_path, capture_output=True, text=True, check=True)
            if status_proc.stdout.strip():
                subprocess.run(["git", "add", "-A"], cwd=self.root_path, check=True)
                subprocess.run(["git", "commit", "-m", message], cwd=self.root_path, check=True)

            subprocess.run(["git", "fetch", "origin"], cwd=self.root_path, check=True)
            
            branch_proc = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=self.root_path, capture_output=True, text=True, check=True)
            branch = branch_proc.stdout.strip()

            subprocess.run(["git", "pull", "--rebase", "origin", branch], cwd=self.root_path, check=True)
            subprocess.run(["git", "push", "origin", branch], cwd=self.root_path, check=True)
            
            self.index_all_files() # После пулла нужно переиндексировать
            return {"success": True, "message": "Синхронизация успешна"}
        except Exception as e:
            logger.error(f"Git error: {e}")
            return {"success": False, "message": f"Ошибка: {str(e)}"}

    def format_notes(self) -> dict:
        """Форматировать все заметки с помощью mdformat"""
        try:
            formatted_count = 0
            # Исключаем README.md и Agents.md как в оригинальном скрипте
            exclude_files = {"README.md", "AGENTS.md", "README.md"}
            
            for item in self.notes_dir.rglob("*.md"):
                if item.name in exclude_files:
                    continue
                
                try:
                    original_content = item.read_text(encoding="utf-8")
                    
                    # Форматируем
                    formatted_content = mdformat.text(
                        original_content,
                        options={"wrap": "no"},
                        extensions={"gfm", "frontmatter"}
                    )
                    
                    if original_content != formatted_content:
                        item.write_text(formatted_content, encoding="utf-8")
                        formatted_count += 1
                except Exception as e:
                    logger.error(f"Failed to format {item}: {e}")

            if formatted_count > 0:
                self.index_all_files()
                
            return {"success": True, "message": f"Форматирование завершено. Обновлено файлов: {formatted_count}"}
        except Exception as e:
            logger.exception("Error formatting notes")
            return {"success": False, "message": str(e)}

    def get_backlinks(self, file_path: str) -> List[SearchResult]:
        """Получить список заметок, которые ссылаются на данную"""
        session = get_session(self.engine)
        try:
            # Сначала находим имя и заголовок текущей заметки
            note = session.query(NoteIndex).filter(NoteIndex.path == file_path).first()
            if not note:
                return []
            
            # Ищем ссылки, где target_name совпадает с title или именем файла
            backlinks_query = session.query(NoteIndex).join(
                NoteLink, NoteLink.source_path == NoteIndex.path
            ).filter(
                (NoteLink.target_name == note.title) | 
                (NoteLink.target_name == note.name.replace(".md", ""))
            ).distinct()
            
            entries = backlinks_query.all()
            return [
                SearchResult(
                    path=e.path,
                    name=e.name.replace(".md", ""),
                    excerpt=f"Linked to this note"
                ) for e in entries
            ]
        finally:
            session.close()

    def resolve_link(self, target_name: str) -> Optional[SearchResult]:
        """Найти путь к заметке по её имени или заголовку"""
        session = get_session(self.engine)
        try:
            # Ищем точное совпадение по заголовку или имени файла
            note = session.query(NoteIndex).filter(
                (NoteIndex.is_dir == False) & 
                ((NoteIndex.title == target_name) | (NoteIndex.name == target_name) | (NoteIndex.name == target_name + ".md"))
            ).first()
            
            if note:
                return SearchResult(path=note.path, name=note.name.replace(".md", ""))
            return None
        finally:
            session.close()

    def get_stats(self) -> dict:
        """Статистика из БД"""
        session = get_session(self.engine)
        try:
            count = session.query(NoteIndex).filter(NoteIndex.is_dir == False).count()
            return {
                "total_notes": count,
                "total_size": 0, # Можно добавить при желании
                "total_size_mb": 0,
            }
        finally:
            session.close()

    # ===== Private Methods =====

    @staticmethod
    def _humanize_size(size: int) -> str:
        if size < 1024: return f"{size}B"
        elif size < 1024 * 1024: return f"{size / 1024:.1f}KB"
        else: return f"{size / (1024 * 1024):.1f}MB"

    @staticmethod
    def _get_metadata(path: Path) -> Optional[FileMetadata]:
        if not path.is_file() or path.suffix != ".md": return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            if content.startswith("---"):
                parts = content.split("---", 2)
                if len(parts) >= 2:
                    metadata = yaml.safe_load(parts[1])
                    if isinstance(metadata, dict):
                        return FileMetadata(**metadata)
        except: pass
        return None
