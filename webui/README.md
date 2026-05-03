# Monos WebUI

Современный веб-интерфейс для управления вашей базой знаний.

## Технологический стек

- **Backend:** FastAPI (Python 3.11+)
- **Frontend:** Svelte + Vite + TailwindCSS
- **API:** REST с JSON
- **Styling:** TailwindCSS с темной темой

## Возможности

✅ Браузер файлов с иерархической структурой
✅ Markdown редактор с live preview
✅ Поиск по названиям и содержимому
✅ Создание новых заметок с YAML фронтматтером
✅ Редактирование и сохранение файлов
✅ Переименование и удаление файлов
✅ Git синхронизация (add, commit, push)
✅ Форматирование всех заметок (mdformat)
✅ Темная/светлая тема
✅ Отличная мобильная адаптация

## Быстрый старт

### Способ 1: Локальный запуск (для разработки)

#### Backend

```bash
cd webui/backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Откроется на `http://localhost:8000`

#### Frontend

В отдельном терминале:

```bash
cd webui/frontend
npm install
npm run dev
```

Откроется на `http://localhost:5173`

### Способ 2: Docker Compose (production)

```bash
cd webui
docker-compose up --build
```

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5173`
- API Docs: `http://localhost:8000/docs`

## Структура проекта

```
webui/
├── backend/
│   ├── main.py           # FastAPI приложение
│   ├── schemas.py        # Pydantic модели
│   ├── services.py       # Business logic
│   ├── requirements.txt   # Python зависимости
│   ├── Dockerfile        # Docker образ для backend
│   └── __init__.py
│
├── frontend/
│   ├── src/
│   │   ├── App.svelte           # Главный компонент
│   │   ├── main.js              # Точка входа
│   │   ├── app.css              # Глобальные стили
│   │   └── components/
│   │       ├── Header.svelte     # Верхняя панель
│   │       ├── Sidebar.svelte    # Боковая панель
│   │       ├── Browser.svelte    # Браузер файлов
│   │       ├── Editor.svelte     # Markdown редактор
│   │       ├── FileTree.svelte   # Дерево файлов
│   │       └── FileInfo.svelte   # Информация о файле
│   ├── index.html        # HTML шаблон
│   ├── package.json      # NPM зависимости
│   ├── vite.config.js    # Конфигурация Vite
│   ├── tailwind.config.js # Конфигурация Tailwind
│   ├── postcss.config.js # Конфигурация PostCSS
│   ├── Dockerfile        # Docker образ для frontend
│   └── .gitignore
│
├── docker-compose.yml    # Docker Compose конфигурация
└── README.md            # Этот файл
```

## API Endpoints

### Основные операции

**GET** `/api/tree` - Получить дерево директорий
**GET** `/api/file/{path}` - Информация о файле
**GET** `/api/file/{path}/content` - Содержимое файла
**POST** `/api/file/{path}/content` - Обновить содержимое
**POST** `/api/notes/create` - Создать новую заметку
**POST** `/api/file/{path}/rename` - Переименовать файл
**DELETE** `/api/file/{path}` - Удалить файл

### Утилиты

**POST** `/api/search` - Поиск заметок
**GET** `/api/stats` - Статистика
**POST** `/api/git/sync` - Синхронизация с Git
**POST** `/api/format` - Форматирование заметок
**GET** `/health` - Проверка здоровья

## Развертывание

### На Vercel (Frontend)

```bash
# Подготовить build
cd frontend
npm run build

# Развернуть на Vercel
npm i -g vercel
vercel --prod
```

### На Render (Backend)

1. Создать новый Web Service на render.com
2. Подключить GitHub репозиторий
3. Указать команду запуска: `uvicorn main:app --port $PORT`
4. Установить переменные окружения

## Особенности

### Темная тема

- Автоматическое определение по системным настройкам
- Переключение через кнопку в Header
- Сохранение выбора в localStorage

### Markdown preview

- Live preview при редактировании
- Поддержка базового синтаксиса Markdown
- Подсветка кода в блоках

### Поиск

- Поиск по названиям файлов
- Поиск по содержимому файлов (grep)
- Фильтрация результатов в реальном времени

### Git интеграция

- Автоматический `git add`
- Создание коммита
- Push на удаленный репозиторий

## Разработка

### Добавить новый API endpoint

1. В `backend/schemas.py` добавьте Pydantic модель
2. В `backend/services.py` добавьте метод
3. В `backend/main.py` добавьте route

### Добавить новый компонент

1. Создайте `.svelte` файл в `frontend/src/components/`
2. Используйте TailwindCSS для стилей
3. Импортируйте в нужный компонент

### Дебаг

**Backend:**
```bash
# Swagger UI документация
http://localhost:8000/docs
```

**Frontend:**
```bash
# Вышибить кэш и перезагрузить
Ctrl+Shift+R или Cmd+Shift+R
```

## Требования

- Python 3.11+
- Node.js 20+
- Git (для синхронизации)
- Docker (опционально, для контейнеризации)

## Лицензия

MIT
