import json
import logging
import os
import shutil
import subprocess
import hashlib
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

import re
import yaml
import mdformat
from sqlalchemy import create_engine, desc
from database import Base, NoteIndex, NoteLink, FolderConfig, get_engine, get_session
from schemas import (
    DirectoryNode,
    FileInfo,
    FileMetadata,
    SearchResult,
    Settings,
)

logger = logging.getLogger(__name__)


class NotesService:

    def __init__(self, root_path: Optional[Path] = None):
        if root_path is None:
            if Path("/app/notes").exists():
                root_path = Path("/app")
                logger.info(f"Using Docker mounted root: {root_path}")
            else:
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
        self.notes_dir = root_path / "notes"
        self.settings_path = root_path / ".zed_settings.json"
        self._settings = self._load_settings()

        db_dir = root_path / "data"
        db_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = db_dir / "notes_index.db"
        self.engine = get_engine(str(self.db_path))

        self.index_all_files()

    def _load_settings(self) -> Settings:
        if self.settings_path.exists():
            try:
                with open(self.settings_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return Settings(**data)
            except Exception as e:
                logger.error(f"Failed to load settings: {e}")
        return Settings()

    def get_settings(self) -> Settings:
        return self._settings

    def update_settings(self, settings: Settings) -> Settings:
        self._settings = settings
        try:
            with open(self.settings_path, "w", encoding="utf-8") as f:
                json.dump(settings.model_dump(), f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Failed to save settings: {e}")
        return self._settings

    def index_all_files(self):
        logger.info("Starting background indexing...")
        session = get_session(self.engine)
        try:
            files_on_disk = {}
            for item in self.notes_dir.rglob("*"):
                if item.name.startswith(".") or item.name == "README.md":
                    continue
                rel_path = item.relative_to(self.root_path).as_posix()
                mtime = datetime.fromtimestamp(item.stat().st_mtime)
                files_on_disk[rel_path] = (item, mtime)

            db_entries = session.query(NoteIndex).all()
            db_map = {entry.path: entry for entry in db_entries}

            for path in list(db_map):
                if path not in files_on_disk:
                    session.delete(db_map[path])

            for path, (item, mtime) in files_on_disk.items():
                is_dir = item.is_dir()

                if path not in db_map:
                    content = ""
                    metadata_dict = None
                    title = item.name.replace(".md", "")
                    tags = []
                    category = None
                    status = None
                    date_created = None

                    if not is_dir and item.suffix == ".md":
                        raw = item.read_text(encoding="utf-8")
                        parsed = self._parse_frontmatter(raw)
                        if parsed:
                            metadata_dict, body = parsed
                            content = body
                            title = metadata_dict.get("title", title)
                            tags = metadata_dict.get("tags", [])
                            category = metadata_dict.get("category")
                            status = metadata_dict.get("status")
                            date_str = metadata_dict.get("date")
                            if date_str:
                                try:
                                    date_created = datetime.fromisoformat(date_str)
                                except Exception:
                                    pass
                            item.write_text(body, encoding="utf-8")
                            logger.info(f"Migrated frontmatter from {rel_path}")
                        else:
                            content = raw

                    new_entry = NoteIndex(
                        path=path,
                        name=item.name,
                        title=title,
                        is_dir=is_dir,
                        parent_path=str(item.parent.relative_to(self.root_path)),
                        content=content,
                        tags=json.dumps(tags),
                        category=category,
                        status=status,
                        date_created=date_created,
                        last_modified=mtime,
                        hash=self._get_file_hash(item) if not is_dir else ""
                    )
                    session.add(new_entry)

                    if not is_dir and item.suffix == ".md":
                        self._update_links(session, path, content)
                else:
                    entry = db_map[path]
                    if entry.last_modified != mtime:
                        content = ""
                        metadata_dict = None
                        title = item.name.replace(".md", "")
                        tags = json.loads(entry.tags) if entry.tags else []
                        category = entry.category
                        status = entry.status
                        date_created = entry.date_created

                        if not is_dir and item.suffix == ".md":
                            raw = item.read_text(encoding="utf-8")
                            parsed = self._parse_frontmatter(raw)
                            if parsed:
                                metadata_dict, body = parsed
                                content = body
                                title = metadata_dict.get("title", title)
                                tags = metadata_dict.get("tags", tags)
                                category = metadata_dict.get("category", category)
                                status = metadata_dict.get("status", status)
                                date_str = metadata_dict.get("date")
                                if date_str:
                                    try:
                                        date_created = datetime.fromisoformat(date_str)
                                    except Exception:
                                        pass
                                item.write_text(body, encoding="utf-8")
                                logger.info(f"Migrated frontmatter from {rel_path}")
                            else:
                                content = raw

                        entry.title = title
                        entry.content = content
                        entry.tags = json.dumps(tags)
                        entry.category = category
                        entry.status = status
                        entry.date_created = date_created
                        entry.last_modified = mtime
                        entry.hash = self._get_file_hash(item) if not is_dir else ""

                        if not is_dir and item.suffix == ".md":
                            self._update_links(session, path, content)

            session.commit()
        finally:
            session.close()
        logger.info("Indexing completed")

    @staticmethod
    def _parse_frontmatter(content: str) -> Optional[Tuple[dict, str]]:
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                try:
                    metadata = yaml.safe_load(parts[1])
                    if isinstance(metadata, dict):
                        body = parts[2].strip()
                        return metadata, body
                except Exception:
                    pass
        return None

    def _update_links(self, session, source_path: str, content: str):
        session.query(NoteLink).filter(NoteLink.source_path == source_path).delete()
        links = re.findall(r"\[\[(.*?)\]\]", content)
        for link in links:
            target = link.split("|")[0].strip()
            if target:
                session.add(NoteLink(source_path=source_path, target_name=target))

    def _get_file_hash(self, path: Path) -> str:
        if path.is_dir():
            return ""
        try:
            return hashlib.md5(path.read_bytes()).hexdigest()
        except Exception:
            return ""

    def get_directory_tree(self, path: Optional[Path] = None) -> DirectoryNode:
        if path is None:
            path = self.notes_dir
        rel_path = str(path.relative_to(self.root_path))
        session = get_session(self.engine)
        try:
            is_notes_root = rel_path == "notes"
            children = session.query(NoteIndex).filter(NoteIndex.parent_path == rel_path).all()
            node = DirectoryNode(
                path=rel_path,
                name=path.name if not is_notes_root else "notes",
                is_dir=True,
                size=0, size_human="", metadata=None,
            )
            for entry in sorted(children, key=lambda e: (not e.is_dir, e.name.lower())):
                if entry.is_dir:
                    node.children.append(self.get_directory_tree(self.root_path / entry.path))
                else:
                    node.children.append(DirectoryNode(
                        path=entry.path, name=entry.name, is_dir=False,
                        size=0, size_human="", metadata=None
                    ))
            return node
        finally:
            session.close()

    def create_directory(self, dir_path: str) -> None:
        path = Path(dir_path)
        if not str(path).startswith("notes"):
            path = Path("notes") / path
        full_path = self.root_path / path
        full_path.mkdir(parents=True, exist_ok=True)
        self.index_all_files()

    def get_flat_directories(self) -> List[str]:
        dirs = [""]
        for item in self.notes_dir.rglob("*"):
            if item.is_dir() and not item.name.startswith("."):
                dirs.append(str(item.relative_to(self.notes_dir)))
        return sorted(dirs)

    def get_file_info(self, file_path: str) -> FileInfo:
        path = self.root_path / file_path
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")
        stat = path.stat()
        metadata = self._get_metadata_from_db(file_path) if path.is_file() else None
        return FileInfo(
            path=str(path.relative_to(self.root_path)),
            name=path.name, is_dir=path.is_dir(),
            size=stat.st_size, size_human=self._humanize_size(stat.st_size),
            modified=datetime.fromtimestamp(stat.st_mtime),
            created=datetime.fromtimestamp(stat.st_ctime),
            metadata=metadata,
        )

    def _get_metadata_from_db(self, rel_path: str) -> Optional[FileMetadata]:
        session = get_session(self.engine)
        try:
            entry = session.query(NoteIndex).filter(NoteIndex.path == rel_path).first()
            if entry:
                tags = json.loads(entry.tags) if entry.tags else []
                return FileMetadata(
                    title=entry.title,
                    date=entry.date_created.isoformat() if entry.date_created else None,
                    category=entry.category,
                    tags=tags,
                    status=entry.status,
                )
        finally:
            session.close()
        return None

    def read_file(self, file_path: str) -> str:
        path = self.root_path / file_path
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")
        content = path.read_text(encoding="utf-8")
        parsed = self._parse_frontmatter(content)
        if parsed:
            _, body = parsed
            return body
        return content

    def write_file(self, file_path: str, content: str) -> None:
        path = self.root_path / file_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        self.index_all_files()

    def create_note(
        self, title: str, category: str, tags: List[str], content: str = ""
    ) -> str:
        filename = title.lower().replace(" ", "_") + ".md"
        dir_path = self.root_path / category if category else self.notes_dir
        dir_path.mkdir(parents=True, exist_ok=True)
        file_path = dir_path / filename

        counter = 1
        while file_path.exists():
            filename = f"{title.lower().replace(' ', '_')}_{counter}.md"
            file_path = dir_path / filename
            counter += 1

        body = content if content else f"# {title}\n\n"
        file_path.write_text(body, encoding="utf-8")
        rel_path = str(file_path.relative_to(self.root_path))

        session = get_session(self.engine)
        try:
            session.add(NoteIndex(
                path=rel_path, name=file_path.name, title=title,
                is_dir=False,
                parent_path=str(file_path.parent.relative_to(self.root_path)),
                content=body, tags=json.dumps(tags),
                category=category if category else None,
                status="draft", date_created=datetime.now(),
                last_modified=datetime.now(),
                hash=self._get_file_hash(file_path),
            ))
            session.commit()
        finally:
            session.close()

        self.index_all_files()
        return rel_path

    def update_metadata(
        self, file_path: str,
        title: Optional[str] = None,
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        status: Optional[str] = None,
    ) -> FileMetadata:
        session = get_session(self.engine)
        try:
            entry = session.query(NoteIndex).filter(NoteIndex.path == file_path).first()
            if not entry:
                raise FileNotFoundError(f"Note not found in index: {file_path}")
            if title is not None:
                entry.title = title
            if category is not None:
                entry.category = category if category else None
            if tags is not None:
                entry.tags = json.dumps(tags)
            if status is not None:
                entry.status = status if status else None
            session.commit()
            current_tags = json.loads(entry.tags) if entry.tags else []
            return FileMetadata(
                title=entry.title,
                date=entry.date_created.isoformat() if entry.date_created else None,
                category=entry.category,
                tags=current_tags,
                status=entry.status,
            )
        finally:
            session.close()

    def delete_file(self, file_path: str) -> None:
        path = self.root_path / file_path
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")
        if path.is_file():
            path.unlink()
        else:
            shutil.rmtree(path)
        self.index_all_files()

    def rename_file(self, file_path: str, new_name: str) -> str:
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
        session = get_session(self.engine)
        try:
            q = f"%{query.lower()}%"
            qs = session.query(NoteIndex).filter(NoteIndex.is_dir == False)
            if search_content:
                qs = qs.filter((NoteIndex.name.ilike(q)) | (NoteIndex.content.ilike(q)) | (NoteIndex.title.ilike(q)))
            else:
                qs = qs.filter((NoteIndex.name.ilike(q)) | (NoteIndex.title.ilike(q)))
            results = []
            for entry in qs.all():
                excerpt = ""
                if search_content and query.lower() in entry.content.lower():
                    idx = entry.content.lower().find(query.lower())
                    start = max(0, idx - 40)
                    end = min(len(entry.content), idx + 60)
                    excerpt = entry.content[start:end].replace("\n", " ")
                    if start > 0: excerpt = "..." + excerpt
                    if end < len(entry.content): excerpt = excerpt + "..."
                else:
                    excerpt = "Match in title"
                results.append(SearchResult(path=entry.path, name=entry.name.replace(".md", ""), excerpt=excerpt))
            return sorted(results, key=lambda r: r.name)
        finally:
            session.close()

    def get_recent_notes(self, limit: int = 10) -> List[SearchResult]:
        session = get_session(self.engine)
        try:
            entries = session.query(NoteIndex).filter(NoteIndex.is_dir == False).order_by(desc(NoteIndex.last_opened)).limit(limit).all()
            return [SearchResult(path=e.path, name=e.name.replace(".md", ""), excerpt=f"Last opened: {e.last_opened.strftime('%Y-%m-%d %H:%M')}") for e in entries]
        finally:
            session.close()

    def set_folder_icon(self, path: str, icon: str) -> None:
        session = get_session(self.engine)
        try:
            cfg = session.query(FolderConfig).filter(FolderConfig.path == path).first()
            if cfg:
                cfg.icon = icon
            else:
                session.add(FolderConfig(path=path, icon=icon))
            session.commit()
        finally:
            session.close()

    def sync_git(self, message: Optional[str] = None) -> dict:
        if message is None:
            message = self._settings.git_commit_message
        try:
            proc = subprocess.run(["git", "status", "--porcelain"], cwd=self.root_path, capture_output=True, text=True, check=True)
            if proc.stdout.strip():
                subprocess.run(["git", "add", "-A"], cwd=self.root_path, check=True)
                subprocess.run(["git", "commit", "-m", message], cwd=self.root_path, check=True)
            subprocess.run(["git", "fetch", "origin"], cwd=self.root_path, check=True)
            branch = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=self.root_path, capture_output=True, text=True, check=True).stdout.strip()
            subprocess.run(["git", "pull", "--rebase", "origin", branch], cwd=self.root_path, check=True)
            subprocess.run(["git", "push", "origin", branch], cwd=self.root_path, check=True)
            self.index_all_files()
            return {"success": True, "message": "Sync successful"}
        except Exception as e:
            logger.error(f"Git error: {e}")
            return {"success": False, "message": f"Error: {str(e)}"}

    def format_notes(self) -> dict:
        try:
            formatted_count = 0
            exclude = {"README.md", "AGENTS.md"}
            for item in self.notes_dir.rglob("*.md"):
                if item.name in exclude:
                    continue
                try:
                    original = item.read_text(encoding="utf-8")
                    parsed = self._parse_frontmatter(original)
                    if parsed:
                        _, original = parsed
                    formatted = mdformat.text(original, options={"wrap": "no"}, extensions={"gfm"})
                    if original != formatted:
                        item.write_text(formatted, encoding="utf-8")
                        formatted_count += 1
                except Exception as e:
                    logger.error(f"Failed to format {item}: {e}")
            if formatted_count > 0:
                self.index_all_files()
            return {"success": True, "message": f"Formatted. Updated: {formatted_count}"}
        except Exception as e:
            logger.exception("Error formatting notes")
            return {"success": False, "message": str(e)}

    def get_backlinks(self, file_path: str) -> List[SearchResult]:
        session = get_session(self.engine)
        try:
            note = session.query(NoteIndex).filter(NoteIndex.path == file_path).first()
            if not note:
                return []
            entries = session.query(NoteIndex).join(NoteLink, NoteLink.source_path == NoteIndex.path).filter(
                (NoteLink.target_name == note.title) | (NoteLink.target_name == note.name.replace(".md", ""))
            ).distinct().all()
            return [SearchResult(path=e.path, name=e.name.replace(".md", ""), excerpt="Linked to this note") for e in entries]
        finally:
            session.close()

    def resolve_link(self, target_name: str) -> Optional[SearchResult]:
        session = get_session(self.engine)
        try:
            note = session.query(NoteIndex).filter(
                (NoteIndex.is_dir == False) & ((NoteIndex.title == target_name) | (NoteIndex.name == target_name) | (NoteIndex.name == target_name + ".md"))
            ).first()
            return SearchResult(path=note.path, name=note.name.replace(".md", "")) if note else None
        finally:
            session.close()

    def get_stats(self) -> dict:
        session = get_session(self.engine)
        try:
            count = session.query(NoteIndex).filter(NoteIndex.is_dir == False).count()
            return {"total_notes": count, "total_size": 0, "total_size_mb": 0}
        finally:
            session.close()

    @staticmethod
    def _humanize_size(size: int) -> str:
        if size < 1024: return f"{size}B"
        elif size < 1024 * 1024: return f"{size / 1024:.1f}KB"
        else: return f"{size / (1024 * 1024):.1f}MB"
