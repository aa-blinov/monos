#!/bin/bash
# setup.sh - Инициализация среды разработки для zed-notes

set -e  # Выход при первой ошибке

echo "🔧 Инициализация zed-notes..."
echo ""

# Проверка наличия необходимых инструментов
if ! command -v uv &> /dev/null; then
    echo "❌ uv не установлен. Установите его с https://docs.astral.sh/uv/getting-started/"
    exit 1
fi

if ! command -v git &> /dev/null; then
    echo "❌ git не установлен."
    exit 1
fi

echo "✅ Зависимости найдены (uv, git)"
echo ""

# Синхронизация зависимостей через uv
echo "📦 Установка зависимостей через uv..."
uv sync

echo ""

# Установка pre-commit hooks
echo "🪝 Настройка pre-commit hooks..."
if ! command -v pre-commit &> /dev/null; then
    echo "   Установка pre-commit..."
    uv run pip install pre-commit
fi

uv run pre-commit install

echo ""
echo "✅ Setup завершен!"
echo ""
echo "📝 Готово к работе! Используйте команды:"
echo "   uv run .scripts/new_note.py       — создание новой заметки"
echo "   uv run .scripts/format_notes.py    — форматирование всех заметок"
echo "   python3 .scripts/check_links.py    — проверка мёртвых ссылок"
echo "   pre-commit run --all-files         — проверка всех файлов"
echo ""
echo "📚 Документация: см. docs/ папку"
echo ""
