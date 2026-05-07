import json
import logging
import os
import shutil
import subprocess
import hashlib
import urllib.request
import urllib.error
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
    GitStatusResponse,
    Settings,
    SearchResult,
)

logger = logging.getLogger(__name__)

CONFLICT_DIR = "_conflicts"


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

        self._configure_git()
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

    def save_settings(self):
        with open(self.settings_path, "w", encoding="utf-8") as f:
            json.dump(self._settings.model_dump(), f, indent=2, ensure_ascii=False)

    def get_settings(self) -> Settings:
        return self._settings

    def update_settings(self, settings: Settings) -> Settings:
        self._settings = settings
        self.save_settings()
        self._configure_git()
        return self._settings

    # ===== Git Operations =====

    def _configure_git(self):
        try:
            subprocess.run(["git", "config", "--global", "user.name", "Monos WebUI"], capture_output=True)
            subprocess.run(["git", "config", "--global", "user.email", "monos@webui.local"], capture_output=True)
            subprocess.run(["git", "config", "--global", "pull.rebase", "false"], capture_output=True)
            subprocess.run(["git", "config", "--global", "core.autocrlf", "input"], capture_output=True)
        except Exception as e:
            logger.warning(f"Failed to configure git global: {e}")

    def _git(self, *args: str, check: bool = True) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["git"] + list(args),
            cwd=self.notes_dir,
            capture_output=True,
            text=True,
            check=check,
        )

    def git_is_initialized(self) -> bool:
        return (self.notes_dir / ".git").exists()

    def git_init_remote(self) -> dict:
        s = self._settings
        if not s.git_token or not s.git_owner or not s.git_repo:
            return {"success": False, "message": "Missing git settings: token, owner, repo"}

        if not self.git_is_initialized():
            self._git("init")
            logger.info("Git repo initialized")
            # Create .gitignore excluding _conflicts/
            gitignore = self.notes_dir / ".gitignore"
            if not gitignore.exists():
                gitignore.write_text(f"{CONFLICT_DIR}/\n", encoding="utf-8")
                self._git("add", ".gitignore")
                self._git("commit", "-m", "Initial commit", check=False)

        remote_url = f"https://{s.git_token}@github.com/{s.git_owner}/{s.git_repo}.git"
        existing = self._git("remote", "get-url", "origin", check=False).stdout.strip()
        if existing:
            if existing != remote_url:
                self._git("remote", "set-url", "origin", remote_url)
                logger.info(f"Updated remote URL")
        else:
            self._git("remote", "add", "origin", remote_url)
            logger.info(f"Remote origin added")

        branch = s.git_branch or "main"
        try:
            self._git("fetch", "origin", check=False)
            self._git("checkout", "-b", branch, check=False)
            self._git("branch", "--set-upstream-to", f"origin/{branch}", branch, check=False)
        except Exception:
            pass

        return {"success": True, "message": "Git initialized and remote configured"}

    def git_status(self) -> GitStatusResponse:
        if not self.git_is_initialized():
            return GitStatusResponse(initialized=False, has_remote=False, status="no_repo")

        result = GitStatusResponse(initialized=True, has_remote=False)

        has_remote = self._git("remote", check=False).stdout.strip()
        result.has_remote = bool(has_remote)
        if has_remote:
            result.remote_url = self._git("remote", "get-url", "origin", check=False).stdout.strip()

        branch = self._git("rev-parse", "--abbrev-ref", "HEAD", check=False).stdout.strip()
        result.current_branch = branch if branch and branch != "HEAD" else None

        try:
            status_out = self._git("status", "--porcelain", check=False).stdout
            lines = [l for l in status_out.split("\n") if l.strip()]
            result.staged = sum(1 for l in lines if l[0] != " " and l[0] != "?")
            result.unstaged = sum(1 for l in lines if l[1] != " " and l[0] != "?")
            result.untracked = sum(1 for l in lines if l.startswith("??"))
            result.status = "clean" if not lines else "dirty"
        except Exception:
            pass

        try:
            with open(self.notes_dir / ".git" / "MONOS_LAST_SYNC", "r") as f:
                result.last_sync = f.read().strip()
        except Exception:
            pass

        if has_remote:
            try:
                self._git("fetch", "origin", check=False)
                rev = self._git("rev-list", "--left-right", "--count", f"{branch}...origin/{branch}", check=False).stdout.strip()
                parts = rev.split("\t")
                if len(parts) == 2:
                    result.behind = int(parts[0])
                    result.ahead = int(parts[1])
                if result.behind > 0:
                    result.status = "behind"
                elif result.ahead > 0:
                    result.status = "ahead" if result.status == "clean" else result.status
            except Exception:
                pass

            try:
                conflict_files = self._git("diff", "--name-only", "--diff-filter=U", check=False).stdout.strip()
                if conflict_files:
                    result.conflicts = [f.strip() for f in conflict_files.split("\n") if f.strip()]
                    result.status = "conflict"
            except Exception:
                pass

        return result

    def sync_git(self, message: Optional[str] = None) -> dict:
        if not self.git_is_initialized():
            init = self.git_init_remote()
            if not init["success"]:
                return init

        s = self._settings
        device = s.device_name or "Monos"
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        commit_msg = f"Commit from {device} on {timestamp}"

        conflicts = []
        try:
            # Stage all
            self._git("add", "-A")

            # Check if there's something to commit
            status = self._git("status", "--porcelain", check=False).stdout.strip()
            if status:
                self._git("commit", "-m", commit_msg)
                logger.info(f"Committed changes: {commit_msg}")

            # Fetch remote
            fetch_result = self._git("fetch", "origin", check=False)
            if fetch_result.returncode != 0:
                return {"success": False, "message": f"Failed to fetch: {fetch_result.stderr}", "conflicts": []}

            branch = s.git_branch or "main"

            # Try to pull (merge)
            pull_result = self._git("pull", "origin", branch, check=False)

            if pull_result.returncode != 0:
                if "conflict" in pull_result.stderr.lower() or "merge conflict" in pull_result.stdout.lower():
                    # Save conflict files
                    conflict_files = self._git("diff", "--name-only", "--diff-filter=U", check=False).stdout.strip()
                    if conflict_files:
                        cfs = [f.strip() for f in conflict_files.split("\n") if f.strip()]
                        conflict_dir = self.notes_dir / CONFLICT_DIR
                        for cf in cfs:
                            dst = conflict_dir / cf
                            dst.parent.mkdir(parents=True, exist_ok=True)
                            # Save remote version (theirs — stage 3)
                            theirs = subprocess.run(
                                ["git", "show", f":3:{cf}"],
                                cwd=self.notes_dir, capture_output=True, text=True
                            )
                            if theirs.returncode == 0:
                                dst.write_text(theirs.stdout, encoding="utf-8")
                            conflicts.append(cf)
                            logger.info(f"Conflict saved: {cf} -> {dst}")

                    # Abort merge, use ours (local) for conflicted files
                    self._git("merge", "--abort", check=False)
                    self._git("add", "-A")
                    self._git("commit", "-m", f"{commit_msg} (with conflict resolution)", check=False)
                    logger.info("Conflicts aborted, local changes committed")

            # Push
            push_result = self._git("push", "origin", branch, check=False)
            if push_result.returncode != 0:
                return {"success": False, "message": f"Push failed: {push_result.stderr}", "conflicts": conflicts}

            # Save last sync time
            with open(self.notes_dir / ".git" / "MONOS_LAST_SYNC", "w") as f:
                f.write(timestamp)

            self.index_all_files()
            msg = "Sync successful"
            if conflicts:
                msg += f". {len(conflicts)} conflict(s) saved to {CONFLICT_DIR}/"
            return {"success": True, "message": msg, "conflicts": conflicts}

        except Exception as e:
            logger.error(f"Git sync error: {e}")
            return {"success": False, "message": f"Error: {str(e)}", "conflicts": conflicts}

    # ===== GitHub API =====

    def github_request(self, token: str, path: str) -> dict:
        url = f"https://api.github.com{path}"
        req = urllib.request.Request(url)
        req.add_header("Authorization", f"Bearer {token}")
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("User-Agent", "Monos-WebUI/1.0")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            logger.error(f"GitHub API error {e.code}: {body}")
            raise Exception(f"GitHub API error {e.code}: {body}")
        except Exception as e:
            logger.error(f"GitHub request failed: {e}")
            raise

    def get_github_repos(self, token: str) -> List[dict]:
        repos = []
        page = 1
        while True:
            data = self.github_request(token, f"/user/repos?per_page=100&page={page}&sort=updated")
            if not data:
                break
            repos.extend(data)
            page += 1
            if page > 10:
                break
        return [
            {
                "name": r["name"],
                "full_name": r["full_name"],
                "private": r["private"],
                "default_branch": r["default_branch"],
            }
            for r in repos
        ]

    def get_github_branches(self, token: str, owner: str, repo: str) -> List[str]:
        data = self.github_request(token, f"/repos/{owner}/{repo}/branches?per_page=100")
        return [b["name"] for b in data]

    def get_github_user(self, token: str) -> str:
        data = self.github_request(token, "/user")
        return data.get("login", "")

    # ===== Indexing =====

    def index_all_files(self):
        logger.info("Starting background indexing...")
        session = get_session(self.engine)
        try:
            files_on_disk = {}
            for item in self.notes_dir.rglob("*"):
                if item.name.startswith(".") or item.name == "README.md":
                    continue
                if CONFLICT_DIR in item.parts:
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
                        path=path, name=item.name, title=title,
                        is_dir=is_dir,
                        parent_path=str(item.parent.relative_to(self.root_path)),
                        content=content, tags=json.dumps(tags),
                        category=category, date_created=date_created,
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
                path=rel_path, name=path.name if not is_notes_root else "notes",
                is_dir=True, size=0, size_human="", metadata=None,
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

    def touch_last_opened(self, file_path: str) -> None:
        session = get_session(self.engine)
        try:
            entry = session.query(NoteIndex).filter(NoteIndex.path == file_path).first()
            if entry:
                entry.last_opened = datetime.now()
                session.commit()
        finally:
            session.close()

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
                date_created=datetime.now(),
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
            session.commit()
            current_tags = json.loads(entry.tags) if entry.tags else []
            return FileMetadata(
                title=entry.title,
                date=entry.date_created.isoformat() if entry.date_created else None,
                category=entry.category,
                tags=current_tags,
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
