"""
FastAPI backend for Zed Notes WebUI
"""

import logging
from pathlib import Path
from typing import List

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from schemas import (
    CreateNoteRequest,
    DirectoryNode,
    FileInfo,
    FormatNotesResponse,
    GitSyncRequest,
    GitSyncResponse,
    RenameFileRequest,
    SearchRequest,
    SearchResult,
    UpdateNoteRequest,
)
from services import NotesService

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

# Initialize FastAPI app
app = FastAPI(
    title="Zed Notes WebUI",
    description="Web interface for managing notes",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize service
service = NotesService()


# ============ Routes ============


@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Zed Notes WebUI API", "version": "1.0.0"}


@app.get("/api/tree", response_model=DirectoryNode)
async def get_directory_tree():
    """Получить дерево директорий"""
    try:
        tree = service.get_directory_tree()
        return tree
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/file-info")
async def get_file_info(path: str = Query(...)):
    """Получить информацию о файле"""
    try:
        file_info = service.get_file_info(path)
        return file_info
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/file")
async def get_file_content(path: str = Query(...)):
    """Получить содержимое файла"""
    try:
        # Check if path is a directory
        from pathlib import Path as PathlibPath

        file_path = PathlibPath(service.root_path) / path
        if file_path.is_dir():
            raise HTTPException(status_code=400, detail="Path is a directory, not a file")

        content = service.read_file(path)
        return {"content": content}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/file")
async def update_file_content(path: str = Query(...), request: UpdateNoteRequest = None):
    """Обновить содержимое файла"""
    try:
        service.write_file(path, request.content)
        return {"message": "File updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/notes/create")
async def create_note(request: CreateNoteRequest):
    """Создать новую заметку"""
    try:
        file_path = service.create_note(
            title=request.title,
            category=request.category,
            tags=request.tags,
            content=request.content,
        )
        return {"path": file_path, "message": "Note created successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/file/rename")
async def rename_file(path: str = Query(...), request: RenameFileRequest = None):
    """Переименовать файл"""
    try:
        new_path = service.rename_file(path, request.new_name)
        return {"path": new_path, "message": "File renamed successfully"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/file")
async def delete_file(path: str = Query(...)):
    """Удалить файл"""
    try:
        service.delete_file(path)
        return {"message": "File deleted successfully"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/search", response_model=List[SearchResult])
async def search_notes(request: SearchRequest):
    """Поиск заметок"""
    try:
        results = service.search(query=request.query, search_content=request.search_content)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stats")
async def get_stats():
    """Получить статистику"""
    try:
        stats = service.get_stats()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/git/sync", response_model=GitSyncResponse)
async def sync_git(request: GitSyncRequest):
    """Синхронизировать с Git"""
    try:
        result = service.sync_git(message=request.message)
        return GitSyncResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/format", response_model=FormatNotesResponse)
async def format_notes():
    """Форматировать заметки"""
    try:
        result = service.format_notes()
        return FormatNotesResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
