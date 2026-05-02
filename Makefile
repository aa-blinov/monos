.PHONY: help format-notes new-note check-links add-frontmatter install notes-ui notes-ui-dev

help:
	@echo "🚀 Zed Notes - Управление скриптами"
	@echo ""
	@echo "TUI ПРИЛОЖЕНИЕ (Главное):"
	@echo "  make notes-ui          - Запустить полный TUI интерфейс"
	@echo "  make notes-ui-dev      - Запустить TUI в режиме разработки"
	@echo ""
	@echo "Классические скрипты:"
	@echo "  make format-notes      - Форматировать все .md файлы"
	@echo "  make new-note          - Создать новую заметку"
	@echo "  make check-links       - Проверить мертвые ссылки"
	@echo "  make add-frontmatter   - Добавить фронтматтер ко всем файлам"
	@echo "  make install           - Установить зависимости"
	@echo ""

install:
	@echo "📦 Установка зависимостей..."
	uv sync

uv-tui:
	@echo "📦 Установка зависимостей TUI..."
	uv sync --group tui

notes-ui: uv-tui
	@echo "🎨 Запуск Zed Notes TUI..."
	uv run --group tui .tui/cli.py

notes-ui-dev:
	@echo "🔧 Запуск TUI в режиме разработки..."
	uv run python3 -m textual run --dev .tui.cli

format-notes:
	@echo "📝 Форматирование Markdown файлов..."
	python3 .scripts/format_notes.py

new-note:
	@echo "✨ Создание новой заметки..."
	python3 .scripts/new_note.py

check-links:
	@echo "🔗 Проверка ссылок..."
	python3 .scripts/check_links.py

add-frontmatter:
	@echo "📋 Добавление фронтматтера..."
	python3 .scripts/add_frontmatter.py
