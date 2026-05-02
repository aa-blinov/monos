.PHONY: help format-notes new-note check-links add-frontmatter install

help:
	@echo "🚀 Zed Notes - Управление скриптами"
	@echo ""
	@echo "Доступные команды:"
	@echo "  make format-notes       - Форматировать все .md файлы"
	@echo "  make new-note           - Создать новую заметку с фронтматтером"
	@echo "  make check-links       - Проверить мертвые ссылки"
	@echo "  make add-frontmatter   - Добавить фронтматтер ко всем файлам"
	@echo "  make install           - Установить зависимости (uv sync)"
	@echo ""

install:
	@echo "📦 Установка зависимостей..."
	uv sync

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
