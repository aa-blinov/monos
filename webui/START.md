# 🚀 Monos WebUI — Как запустить

## Самый быстрый способ (за 2 минуты)

### Terminal 1: Backend

```bash
cd zed-notes/webui/backend
python3 -m uvicorn main:app --reload --port 8000
```

Вы должны увидеть:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

### Terminal 2: Frontend

```bash
cd zed-notes/webui/frontend
npm install
npm run dev
```

Вы увидите:
```
VITE v5.0.8  ready in 234 ms

➜  Local:   http://localhost:5173/
```

## 🌐 Откройте в браузере

**Frontend:** http://localhost:5173

Готово! 🎉

---

## Дополнительные ссылки

- **API Документация:** http://localhost:8000/docs (Swagger UI)
- **API JSON Schema:** http://localhost:8000/openapi.json
- **Health Check:** http://localhost:8000/health

---

## Если используете Docker

```bash
cd zed-notes/webui
docker-compose up --build
```

- Backend: http://localhost:8000
- Frontend: http://localhost:5173

---

## Основные команды

### Docker (рекомендуется)
```bash
cd webui
docker-compose up -d --build
```

### Разработка (локально)
```bash
# Бэкенд
cd webui/backend
python3 -m uvicorn main:app --reload --port 8000

# Фронтенд
cd webui/frontend
npm run dev
```

---

## Основные функции

| Функция | Как пользоваться |
|---------|------------------|
| **Просмотр файлов** | Клик на файл в левой панели |
| **Редактирование** | Пишите в левой части editor |
| **Live Preview** | Смотрите в правой части (markdown) |
| **Поиск** | Введите текст в поиск (левая панель) |
| **Новая заметка** | Кнопка "Создать" в браузере файлов |
| **Git Sync** | Кнопка "Синхронизировать" в header |
| **Форматировать** | Кнопка "Форматировать" в header |
| **Темная тема** | Кнопка луны в header |

---

## Решение проблем

### "Cannot GET /api/..."

Backend не запущен. Убедитесь, что вы запустили:
```bash
cd webui/backend
python3 -m uvicorn main:app --reload --port 8000
```

### "npm: command not found"

Node.js не установлен. Скачайте с https://nodejs.org

### Порт 8000 занят

```bash
# Используйте другой порт
python3 -m uvicorn main:app --reload --port 8001
# И обновите vite.config.js proxy target на 8001
```

### Темная тема не работает

Очистите кэш браузера:
```
Ctrl+Shift+R (или Cmd+Shift+R на Mac)
```

---

## Полная документация

- **README.md** — Полное описание проекта
- **QUICKSTART.md** — Подробный гайд

---

Готово! Наслаждайтесь 🚀
