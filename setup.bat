@echo off
REM setup.bat - Initialization script for zed-notes on Windows

setlocal enabledelayedexpansion

echo.
echo 🔧 Initializing zed-notes environment
echo ============================================================
echo.

REM Check for uv
where uv >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ uv is not installed.
    echo Install it from https://docs.astral.sh/uv/getting-started/
    exit /b 1
)
echo ✅ uv found

REM Check for git
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ git is not installed
    exit /b 1
)
echo ✅ git found

REM Install dependencies
echo.
echo 🔧 Installing dependencies
echo ============================================================
uv sync
if %errorlevel% neq 0 (
    echo ❌ Failed to install dependencies
    exit /b 1
)
echo ✅ Dependencies installed

REM Setup pre-commit
echo.
echo 🔧 Setting up pre-commit hooks
echo ============================================================

where pre-commit >nul 2>nul
if %errorlevel% neq 0 (
    echo    Installing pre-commit...
    uv run pip install pre-commit
    if %errorlevel% neq 0 (
        echo ❌ Failed to install pre-commit
        exit /b 1
    )
)

uv run pre-commit install
if %errorlevel% neq 0 (
    echo ❌ Failed to initialize pre-commit hooks
    exit /b 1
)
echo ✅ Pre-commit hooks installed

REM Final message
echo.
echo 🔧 Setup complete!
echo ============================================================
echo.
echo 📝 Ready to work! Available commands:
echo    uv run .scripts/new_note.py       — create a new note
echo    uv run .scripts/format_notes.py    — format all notes
echo    python .scripts/check_links.py     — check for dead links
echo    pre-commit run --all-files         — check all files manually
echo.
echo 💡 Next steps:
echo    1. Try creating a note: uv run .scripts/new_note.py
echo    2. Or format existing notes: uv run .scripts/format_notes.py
echo    3. Check links: python .scripts/check_links.py
echo.
echo 📚 Documentation: see docs/ folder
echo.

exit /b 0
