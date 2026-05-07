# Инструкции для AI-агентов (Monos)

Этот файл содержит правила и контекст для AI-агентов, работающих с данной базой знаний.

## Стек

- **Backend:** Node.js + Express + better-sqlite3 (`webui/backend/`)
- **Frontend:** Svelte 4 + Vite + Tailwind + TipTap (`webui/frontend/`)
- **БД:** SQLite (файл `webui/.data/notes.db`)
- **Заметки:** `notes/` — Markdown с wiki-links `[[...]]`

## Запуск

```bash
# Backend
cd webui/backend && npm install && node index.js

# Frontend (dev)
cd webui/frontend && npm install && npm run dev
```

Бэкенд на порту 8000, фронтенд на 5173.

## Проверка кода (обязательно)

Перед коммитом:

```bash
# Frontend
cd webui/frontend && npm run check

# Backend
cd webui/backend && node --check index.js database.js
```

## Структура

```
webui/
  backend/          # Node.js Express API
    index.js        # Все роуты и бизнес-логика
    database.js     # SQLite (better-sqlite3)
  frontend/         # Svelte SPA
    src/
      components/   # Svelte компоненты
      lib/          # Общие модули (icons.js)
      stores.js     # Svelte stores (editMode, syncScroll)
      app.css       # Gruvbox тема
  .data/            # SQLite БД, настройки Git
notes/              # Markdown заметки
```

## API эндпоинты

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/tree` | Дерево директорий |
| GET | `/api/file?path=` | Читать файл |
| POST | `/api/file?path=` | Сохранить файл |
| DELETE | `/api/file?path=` | Удалить |
| POST | `/api/file/rename?path=` | Переименовать |
| POST | `/api/file/move?source=&target=` | Переместить |
| GET | `/api/file-info?path=` | Инфо о файле |
| PUT | `/api/file/metadata?path=` | Обновить метаданные |
| POST | `/api/notes/create` | Создать заметку |
| GET | `/api/notes/recent` | Последние открытые |
| POST | `/api/search` | Поиск |
| GET | `/api/notes/backlinks?path=` | Обратные ссылки |
| GET | `/api/notes/resolve-link?name=` | Найти заметку по названию |
| GET | `/api/directories` | Список папок |
| POST | `/api/directory/create?path=` | Создать папку |
| POST | `/api/directory/icon?path=` | Иконка и цвет |
| POST | `/api/format` | Форматировать все заметки |
| GET | `/api/git/status` | Git статус |
| POST | `/api/git/setup` | Настроить Git |
| POST | `/api/git/sync` | Синхронизация |
| GET | `/api/git/log` | История коммитов |
| GET | `/api/git/repos?token=` | Список репозиториев |
| GET | `/api/git/branches?token=&repo=` | Ветки |
| GET | `/api/git/user?token=` | Пользователь GitHub |
| GET | `/api/git/conflicts` | Конфликты |
| POST | `/api/git/conflicts/resolve` | Разрешить конфликты |

## Git и версионирование

1. Перед синхронизацией — нажать **Format** (иконка волшебной палочки в редакторе)
2. **Sync** в футере сайдбара — pull + commit + push
3. Pre-commit хуки в репозитории: mdformat, ruff, pre-commit-hooks
