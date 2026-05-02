"""
Pydantic schemas for API requests and responses
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class FileMetadata(BaseModel):
    """YAML фронтматтер заметки"""

    title: Optional[str] = None
    date: Optional[str] = None
    category: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    status: Optional[str] = None


class FileInfo(BaseModel):
    """Информация о файле"""

    path: str
    name: str
    is_dir: bool
    size: int
    size_human: str
    modified: datetime
    created: datetime
    metadata: Optional[FileMetadata] = None


class DirectoryNode(BaseModel):
    """Узел дерева директорий"""

    path: str
    name: str
    is_dir: bool
    size: int
    size_human: str
    children: List["DirectoryNode"] = Field(default_factory=list)
    metadata: Optional[FileMetadata] = None


DirectoryNode.model_rebuild()


class CreateNoteRequest(BaseModel):
    """Запрос на создание новой заметки"""

    title: str
    category: str
    tags: List[str] = Field(default_factory=list)
    content: str = ""


class UpdateNoteRequest(BaseModel):
    """Запрос на обновление заметки"""

    content: str


class RenameFileRequest(BaseModel):
    """Запрос на переименование файла"""

    new_name: str


class SearchRequest(BaseModel):
    """Запрос на поиск"""

    query: str
    search_content: bool = True


class SearchResult(BaseModel):
    """Результат поиска"""

    path: str
    name: str
    excerpt: Optional[str] = None


class GitSyncRequest(BaseModel):
    """Запрос на синхронизацию с Git"""

    message: str = "Auto-sync from WebUI"


class GitSyncResponse(BaseModel):
    """Ответ синхронизации"""

    success: bool
    message: str


class FormatNotesResponse(BaseModel):
    """Ответ на форматирование"""

    success: bool
    message: str
    files_count: int = 0
