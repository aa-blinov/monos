# Инструкции для AI-агентов (Monos)

Этот файл содержит правила и контекст для AI-агентов, работающих с данной базой знаний.

## Стек

- **Backend:** Node.js + Express + better-sqlite3 (`webui/backend/`)
- **Frontend:** Svelte 4 + Vite + Tailwind + TipTap (`webui/frontend/`)
- **БД:** SQLite (файл `webui/.data/notes.db`)
- **Заметки:** `notes/` — Markdown с wiki-links `[[...]]`

## Запуск

```bash
# Backend (сначала корень: бэкенд берёт зависимости из корневого node_modules)
npm install
cd webui/backend && npm install && node index.js

# Frontend (dev)
cd webui/frontend && npm install && npm run dev
```

Бэкенд на порту 8000, фронтенд на 5173.

## Проверка кода (обязательно)

Перед коммитом:

```bash
# Frontend
cd webui/frontend && npm test
cd webui/frontend && npm run check
cd webui/frontend && npm run build

# Backend
cd webui/backend && npm test
cd webui/backend && node --check index.js search.js database.js
npm run check:deps  # из корня: бэкенд тестируется на тех же версиях, что уезжают в сборку
```

## Структура

```
webui/
  backend/          # Node.js Express API
    index.js        # Express API и роуты
    database.js     # SQLite (better-sqlite3)
    search.js       # Логика поиска и ранжирования
    search.test.js  # Тесты поиска на node:test
  frontend/         # Svelte SPA
    src/
      components/   # Svelte компоненты
      lib/          # Общие модули (icons.js, search.js)
        search.js   # Подсветка и разбор поискового запроса
        search.test.js # Тесты клиентского поиска на node:test
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

## Интерфейс

1. **Никаких «·»** между частями строки — разделять скобками или пробелом
2. **Мета-строка шапки** — одна фраза через запятую: дата, синхронизация, статистика, задачи, стрелка структуры. Части идут текстовым потоком (`inline`), запятая через `::after`, а не `::before`: при `::before` перенесённая строка начиналась с запятой
3. **Шапка и текст — разные колонки.** Шапка держит 48rem, текст — ширину из настроек, обе по центру. Заголовок не встаёт по левому краю текста: это осознанно, `e2e/36-inside-a-note.spec.js` проверяет, что заголовок не двигается при смене ширины текста
4. **Настройки вида** (ширина контента, межстрочный интервал) живут в Настройках, а не в панели форматирования. Кнопка «…» в панели появляется только при переполнении
5. **Надпись сохранения называет причину**: сервер отдаёт статус, `editor.saveFailedReason(status)` превращает его в текст. Одна надпись на все отказы заставляла угадывать
6. **Запись файла отдельно от индекса.** Файл записан — значит текст на диске; упавший индекс не должен отвечать 500 на записанный файл
