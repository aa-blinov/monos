from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class FileMetadata(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    category: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class UpdateMetadataRequest(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None


class FileInfo(BaseModel):
    path: str
    name: str
    is_dir: bool
    size: int
    size_human: str
    modified: datetime
    created: datetime
    metadata: Optional[FileMetadata] = None


class DirectoryNode(BaseModel):
    path: str
    name: str
    is_dir: bool
    icon: Optional[str] = None
    size: int
    size_human: str
    children: List["DirectoryNode"] = Field(default_factory=list)
    metadata: Optional[FileMetadata] = None


DirectoryNode.model_rebuild()


class CreateNoteRequest(BaseModel):
    title: str
    category: str
    tags: List[str] = Field(default_factory=list)
    content: str = ""


class UpdateNoteRequest(BaseModel):
    content: str


class RenameFileRequest(BaseModel):
    new_name: str


class SetIconRequest(BaseModel):
    icon: str


class SearchRequest(BaseModel):
    query: str
    search_content: bool = True


class SearchResult(BaseModel):
    path: str
    name: str
    excerpt: Optional[str] = None


class GitSyncRequest(BaseModel):
    message: str = "Auto-sync from WebUI"


class GitSyncResponse(BaseModel):
    success: bool
    message: str
    conflicts: List[str] = Field(default_factory=list)


class GitSetupRequest(BaseModel):
    token: str
    owner: str
    repo: str
    branch: str = "main"
    device_name: str = ""


class GitStatusResponse(BaseModel):
    initialized: bool
    has_remote: bool
    remote_url: str = ""
    current_branch: Optional[str] = None
    status: str = "unknown"
    ahead: int = 0
    behind: int = 0
    staged: int = 0
    unstaged: int = 0
    untracked: int = 0
    conflicts: List[str] = Field(default_factory=list)
    last_sync: Optional[str] = None
    error: str = ""


class GitRepoInfo(BaseModel):
    name: str
    full_name: str
    private: bool
    default_branch: str


class FormatNotesResponse(BaseModel):
    success: bool
    message: str
    files_count: int = 0


class Settings(BaseModel):
    auto_sync_interval: int = Field(default=0, description="Интервал автосинхронизации в минутах (0 - выключено)")
    auto_format_on_save: bool = Field(default=False, description="Форматировать после каждого сохранения")
    git_commit_message: str = Field(default="Sync from Monos WebUI", description="Сообщение коммита по умолчанию")
    git_token: str = Field(default="", description="GitHub Personal Access Token")
    git_owner: str = Field(default="", description="GitHub owner/username")
    git_repo: str = Field(default="", description="GitHub repository name")
    git_branch: str = Field(default="main", description="Git branch")
    device_name: str = Field(default="", description="Device name for commit messages")
