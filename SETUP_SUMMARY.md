# Setup Summary — Pre-commit Hooks Configuration

## ✅ Что было сделано

### 1. **Конфигурация зависимостей** (`pyproject.toml`)
- Python 3.12+ 
- Dev-зависимости:
  - `mdformat` — форматирование Markdown
  - `mdformat-gfm` — поддержка GitHub Flavored Markdown
  - `mdformat-frontmatter` — поддержка YAML фронтматтера
  - `ruff` — Python линтер и форматер
  - `pre-commit` — фреймворк для автоматических проверок

### 2. **Pre-commit hooks** (`.pre-commit-config.yaml`)
При каждом `git commit` автоматически выполняются:

| Hook | Описание | Действие |
|------|---------|---------|
| **mdformat** | Форматирование Markdown | Auto-fix: выравнивание, wrap на 120 символов |
| **ruff** | Линтинг Python | Auto-fix: форматирование, импорты |
| **ruff-format** | Форматирование Python | Auto-fix: PEP 8 стиль |
| **trailing-whitespace** | Пробелы в конце строк | Auto-fix: удаление |
| **end-of-file-fixer** | Окончание файлов | Auto-fix: добавление newline |
| **check-yaml** | Валидность YAML | Error: если YAML невалиден |
| **check-json** | Валидность JSON | Error: если JSON невалиден |
| **check-added-large-files** | Размер файлов | Error: если файл > 1MB |
| **check-merge-conflict** | Конфликты слияния | Error: если найдены маркеры конфликта |

### 3. **Скрипты инициализации** (кросс-платформенные)

| Файл | ОС | Использование |
|------|-----|------------|
| **setup.py** | Windows/macOS/Linux | `python setup.py` или `python3 setup.py` |
| **setup.sh** | macOS/Linux | `./setup.sh` (старый формат, оставлен для совместимости) |
| **setup.bat** | Windows | `setup.bat` (альтернатива для cmd.exe) |

Все скрипты:
- ✅ Проверяют наличие `uv` и `git`
- 📦 Запускают `uv sync` для установки зависимостей
- 🪝 Инициализируют `pre-commit` hooks в `.git/hooks`
- 📝 Выводят справку с доступными командами

### 4. **Документация**

| Файл | Назначение |
|------|-----------|
| **README.md** | Основная документация проекта, инструкции по первичной настройке |
| **CONTRIBUTING.md** | Подробная инструкция для разработчиков, Git workflow, troubleshooting |
| **Agents.md** | Инструкции для AI-агентов (уже существовал) |

## 🚀 Как это работает

### Первый запуск (на новой машине)

```bash
# Клонируем репо
git clone https://github.com/aa-blinov/zed-notes.git
cd zed-notes

# Инициализируем окружение
python3 setup.py  # или python setup.py на Windows
```

**Скрипт сделает:**
1. Установит все зависимости через `uv`
2. Установит `pre-commit` hooks в `.git/hooks`
3. Готово! Pre-commit hooks теперь будут срабатывать при каждом `git commit`

### Обычный workflow

```bash
# Создаём или редактируем файлы
uv run new_note.py
# ... редактируем файлы в IDE ...

# Коммитим (pre-commit hooks сработают автоматически)
git add .
git commit -m "feat: Add note about X"

# Если есть ошибки форматирования, скрипты их исправят и выведут ошибку
# Просто запустите коммит снова
git commit -m "feat: Add note about X"

# Готово! Пушим
git push origin master
```

### Ручная проверка (если нужно)

```bash
# Проверить все файлы
pre-commit run --all-files

# Проверить конкретный файл
pre-commit run --files my_note.md

# Пропустить проверки (не рекомендуется!)
git commit --no-verify
```

## 📋 Требования

- **uv 0.1.0+** — https://docs.astral.sh/uv/getting-started/
- **Python 3.12+**
- **git 2.0+**

## 🔧 Что находится где

```
zed-notes/
├── pyproject.toml              # Конфиг зависимостей и инструментов
├── .pre-commit-config.yaml     # Конфиг pre-commit hooks
├── setup.py                    # Кросс-платформенный скрипт инициализации
├── setup.sh                    # Unix shell скрипт (альтернатива)
├── setup.bat                   # Windows batch скрипт (альтернатива)
├── uv.lock                     # Lock файл для reproducible builds
├── README.md                   # Основная документация
├── CONTRIBUTING.md             # Инструкции для разработчиков
├── Agents.md                   # Инструкции для AI-агентов
└── .git/hooks/                 # Pre-commit hooks (создаются автоматически)
```

## ✨ Преимущества такой конфигурации

- ✅ **Автоматизация** — не нужно помнить про форматирование
- ✅ **Консистентность** — все файлы форматируются одинаково
- ✅ **Кросс-платформность** — работает на Windows, macOS, Linux
- ✅ **Простота** — один команда `python setup.py` и готово
- ✅ **Безопасность** — большие файлы и опасные паттерны не пройдут
- ✅ **Гибкость** — можно пропустить проверки если очень нужно (флаг `--no-verify`)

## 📝 Следующие шаги

- [ ] Проверить, что pre-commit hooks работают на других машинах
- [ ] Добавить GitHub Actions для CI/CD (проверка в облаке)
- [ ] Добавить проверку "мёртвых ссылок" между заметками
- [ ] Расширить шаблоны YAML фронтматтера для единообразия
- [ ] Настроить автоматическое форматирование при пуше на GitHub

## 🆘 Troubleshooting

**Q: Pre-commit hooks вызывают ошибки при коммите**
A: Обычно hooks исправляют ошибки сами. Просто запустите коммит снова. Если нужно увидеть подробнее:
```bash
pre-commit run --all-files --verbose
```

**Q: На Windows скрипты не запускаются**
A: Убедитесь, что PowerShell позволяет запускать скрипты:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Q: Нужно пропустить проверки для одного коммита**
A: Используйте флаг `--no-verify`:
```bash
git commit -m "WIP: temporary commit" --no-verify
```

---

**Версия:** 2024-05-02  
**Автор:** AI Assistant  
**Статус:** ✅ Ready for production
