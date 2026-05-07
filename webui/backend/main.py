"""
FastAPI backend for Monos WebUI
"""

import asyncio
import logging
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, HTTPException, Query, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from schemas import (
    CreateNoteRequest,
    DirectoryNode,
    FileInfo,
    FileMetadata,
    FormatNotesResponse,
    GitSetupRequest,
    GitSyncRequest,
    GitSyncResponse,
    GitStatusResponse,
    RenameFileRequest,
    SearchRequest,
    SearchResult,
    UpdateNoteRequest,
    UpdateMetadataRequest,
    Settings,
    SetIconRequest,
)
from services import NotesService

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Monos WebUI",
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


# ============ Background Tasks ============

async def auto_sync_loop():
    """Фоновая задача для автосинхронизации"""
    while True:
        try:
            settings = service.get_settings()
            interval = settings.auto_sync_interval
            
            if interval > 0:
                logger.info(f"Starting scheduled auto-sync (interval: {interval} min)")
                result = service.sync_git()
                if not result["success"]:
                    logger.error(f"Auto-sync failed: {result['message']}")
                else:
                    logger.info("Auto-sync completed successfully")
                
                # Ждем интервал (переводим минуты в секунды)
                await asyncio.sleep(interval * 60)
            else:
                # Если автосинхронизация выключена, проверяем настройки раз в минуту
                await asyncio.sleep(60)
        except Exception as e:
            logger.error(f"Error in auto-sync loop: {e}")
            await asyncio.sleep(60)

@app.on_event("startup")
async def startup_event():
    """Действия при запуске приложения"""
    # Запускаем цикл автосинхронизации в фоне
    asyncio.create_task(auto_sync_loop())


# ============ Routes ============


@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Monos WebUI API", "version": "1.0.0"}


@app.get("/api/settings", response_model=Settings)
async def get_settings():
    """Получить настройки"""
    return service.get_settings()


@app.post("/api/settings", response_model=Settings)
async def update_settings(settings: Settings):
    """Обновить настройки"""
    return service.update_settings(settings)


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
        service.touch_last_opened(path)
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


@app.put("/api/file/metadata", response_model=FileMetadata)
async def update_file_metadata(path: str = Query(...), request: UpdateMetadataRequest = None):
    """Обновить метаданные заметки (title, category, tags)"""
    try:
        return service.update_metadata(
            file_path=path,
            title=request.title,
            category=request.category,
            tags=request.tags,
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found in index")
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
        if request is None:
            logger.error("Rename request body is missing")
            raise HTTPException(status_code=400, detail="Request body is missing")
        
        logger.info(f"Renaming {path} to {request.new_name}")
        new_path = service.rename_file(path, request.new_name)
        return {"path": new_path, "message": "File renamed successfully"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        logger.exception(f"Error renaming file {path}")
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


@app.get("/api/directories", response_model=List[str])
async def get_directories():
    """Получить плоский список всех директорий"""
    try:
        return service.get_flat_directories()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/file/move")
async def move_file(source: str = Query(...), target: str = Query(...)):
    """Переместить файл или директорию"""
    try:
        service.move_item(source, target)
        return {"message": "Item moved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/directory/create")
async def create_directory(path: str = Query(...)):
    """Создать новую директорию"""
    try:
        service.create_directory(path)
        return {"message": "Directory created successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/notes/recent", response_model=List[SearchResult])
async def get_recent_notes(limit: int = Query(10)):
    """Получить список недавних файлов"""
    try:
        return service.get_recent_notes(limit)
    except Exception as e:
        logger.exception("Error getting recent notes")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/directory/icon")
async def set_directory_icon(path: str = Query(...), request: SetIconRequest = None):
    """Установить иконку и цвет для элемента"""
    try:
        service.set_folder_icon(path, request.icon if request else None, request.color if request else None)
        return {"message": "Icon updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/notes/backlinks", response_model=List[SearchResult])
async def get_backlinks(path: str = Query(...)):
    """Получить обратные ссылки для заметки"""
    try:
        return service.get_backlinks(path)
    except Exception as e:
        logger.exception("Error getting backlinks")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/notes/resolve-link", response_model=Optional[SearchResult])
async def resolve_link(name: str = Query(...)):
    """Разрешить wiki-link в путь к файлу"""
    try:
        return service.resolve_link(name)
    except Exception as e:
        logger.exception("Error resolving link")
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


@app.get("/api/git/status", response_model=GitStatusResponse)
async def git_status():
    try:
        return service.git_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/git/setup")
async def git_setup(request: GitSetupRequest):
    try:
        s = service.get_settings()
        s.git_token = request.token
        s.git_owner = request.owner
        s.git_repo = request.repo
        s.git_branch = request.branch or "main"
        if request.device_name:
            s.device_name = request.device_name
        service.update_settings(s)
        result = service.git_init_remote()
        if not result["success"]:
            raise HTTPException(status_code=400, detail=result["message"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/git/sync", response_model=GitSyncResponse)
async def git_sync(request: GitSyncRequest = None):
    try:
        msg = request.message if request else None
        result = service.sync_git(message=msg)
        return GitSyncResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/git/repos")
async def git_repos(token: str = Query(...)):
    try:
        return service.get_github_repos(token)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/git/branches")
async def git_branches(token: str = Query(...), owner: str = Query(...), repo: str = Query(...)):
    try:
        branches = service.get_github_branches(token, owner, repo)
        return {"branches": branches}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/git/user")
async def git_user(token: str = Query(...)):
    try:
        login = service.get_github_user(token)
        return {"login": login}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/git/conflicts")
async def git_conflicts():
    try:
        conflict_dir = service.notes_dir / "_conflicts"
        if not conflict_dir.exists():
            return {"conflicts": []}
        files = []
        for f in conflict_dir.rglob("*.md"):
            files.append({
                "path": str(f.relative_to(conflict_dir)),
                "name": f.name,
                "content": f.read_text(encoding="utf-8"),
            })
        return {"conflicts": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/git/conflicts/resolve")
async def git_resolve_conflicts():
    try:
        conflict_dir = service.notes_dir / "_conflicts"
        if conflict_dir.exists():
            import shutil
            shutil.rmtree(conflict_dir)
        return {"message": "Conflicts resolved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/git/log")
async def git_log(count: int = Query(20)):
    try:
        result = service._git("log", f"--max-count={count}", "--format=%H|%ai|%s")
        entries = []
        for line in result.stdout.strip().split("\n"):
            if not line.strip():
                continue
            parts = line.split("|", 2)
            if len(parts) == 3:
                entries.append({"hash": parts[0], "date": parts[1], "message": parts[2]})
        return {"entries": entries}
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
