# Zed Notes WebUI — Быстрый старт

## 🚀 За 5 минут до запуска

### Шаг 1: Установка зависимостей

```bash
cd webui
make install
```

Или вручную:

```bash
# Backend
cd backend
pip install -r requirements.txt

# Frontend (в новом терминале)
cd frontend
npm install
```

### Шаг 2: Запуск приложения

**Вариант 1: Оба сервиса одновременно**

```bash
cd webui
make dev
```

Откроется:
- 🌐 Frontend: http://localhost:5173
- 🔗 Backend API: http://localhost:8000
- 📚 API Документация: http://localhost:8000/docs

**Вариант 2: Отдельные сервисы**

Terminal 1 (Backend):
```bash
cd webui/backend
python -m uvicorn main:app --reload --port 8000
```

Terminal 2 (Frontend):
```bash
cd webui/frontend
npm run dev
```

**Вариант 3: Docker**

```bash
cd webui
make docker-up
```

## 📖 Что дальше?

### Использование WebUI

1. Откройте http://localhost:5173
2. Выберите файл из левой боковой панели
3. Редактируйте содержимое в центре
4. Сохраняйте автоматически или нажимайте "Сохранить"
5. Синхронизируйте с Git через кнопку в header

### Основные функции

| Функция | Как использовать |
|---------|------------------|
| **Просмотр файлов** | Кликните на файл в боковой панели |
| **Редактирование** | Пишите в левом окне редактора |
| **Live Preview** | Смотрите результат в правом окне |
| **Поиск** | Используйте поле поиска в sidebar |
| **Создать заметку** | Кнопка "Создать" в браузере файлов |
| **Переименовать** | Правая кнопка мыши или кнопка в editor |
| **Удалить** | Кнопка "Удалить" в editor |
| **Git Sync** | Кнопка "Синхронизировать" в header |
| **Форматировать** | Кнопка "Форматировать" в header |
| **Темная тема** | Кнопка луны в header |

## 🔧 Команды Make

```bash
make help            # Показать все команды

# Разработка
make dev             # Запустить оба сервиса
make backend-dev     # Только backend
make frontend-dev    # Только frontend

# Установка
make install         # Установить все зависимости
make install-backend # Только Python
make install-frontend # Только Node

# Сборка
make build           # Собрать для production
make build-frontend  # Собрать frontend

# Docker
make docker-up       # Запустить контейнеры
make docker-down     # Остановить контейнеры
make docker-build    # Пересобрать образы

# Очистка
make clean           # Удалить dist и node_modules
make clean-all       # Полная очистка
```

## 🐛 Решение проблем

### Backend не запускается

```bash
# Проверить порт
lsof -i :8000

# Убить процесс
kill -9 <PID>

# Запустить с другим портом
python -m uvicorn main:app --port 8001
```

### Frontend не подключается к backend

Проверить в `vite.config.js`:
```javascript
proxy: {
  '/api': {
    target: 'http://localhost:8000',  // Должен совпадать с портом backend
    changeOrigin: true,
  }
}
```

### Ошибка "git not found"

Git нужен для синхронизации. Убедитесь, что Git установлен:
```bash
git --version
```

### Ошибка "grep not found"

`grep` используется для поиска содержимого файлов:
- На Linux/Mac: уже установлен
- На Windows: используйте WSL или MinGW

## 📚 Документация

- **API Docs:** http://localhost:8000/docs (Swagger UI)
- **Backend:** `webui/backend/README.md` (в разработке)
- **Frontend:** `webui/frontend/` (основные файлы)
- **Полная документация:** `webui/README.md`

## 🎯 Следующие шаги

### Для разработки

1. **Добавить новый endpoint:**
   - Добавить схему в `schemas.py`
   - Добавить метод в `services.py`
   - Добавить route в `main.py`

2. **Добавить новый компонент:**
   - Создать `.svelte` файл в `components/`
   - Использовать TailwindCSS для стилей
   - Импортировать в App или другие компоненты

3. **Кастомизировать стили:**
   - Редактировать `tailwind.config.js` для расширений
   - Редактировать `app.css` для глобальных стилей
   - Компоненты используют `class="..."` для TailwindCSS

### Для production

1. **Собрать frontend:**
   ```bash
   make build-frontend
   # или
   cd frontend && npm run build
   ```

2. **Развернуть backend:**
   - На Render: https://render.com
   - На Railway: https://railway.app
   - На Replit: https://replit.com

3. **Развернуть frontend:**
   - На Vercel: https://vercel.com
   - На Netlify: https://netlify.com
   - На GitHub Pages: (требует доп. настройки)

## 💡 Советы

- Используйте `make dev` для быстрого старта в разработке
- Проверьте API Docs на http://localhost:8000/docs для тестирования endpoints
- Темная тема сохраняется в localStorage
- Все операции с Git выполняются автоматически
- Markdown поддерживает базовый синтаксис (заголовки, списки, код и т.д.)

## 📞 Помощь

Если что-то не работает:
1. Проверьте логи в console (F12 в браузере)
2. Проверьте терминал backend для Python ошибок
3. Убедитесь, что порты 8000 и 5173 свободны
4. Очистите кэш браузера (Ctrl+Shift+R)

Готово! 🎉 Вы можете начать использовать Zed Notes WebUI.
