#!/usr/bin/env python3
"""
Zed Notes TUI — управление системой заметок через терминал
"""

import os
import subprocess
from pathlib import Path
from typing import Optional

from textual.app import ComposeResult, on
from textual.containers import Container, Horizontal, Vertical
from textual.screen import Screen
from textual.widgets import Button, Footer, Header, Input, Label, Static

try:
    from .models import NotesManager
    from .widgets import NotesBrowser, SearchWidget, StatusBar
except ImportError:
    from models import NotesManager
    from widgets import NotesBrowser, SearchWidget, StatusBar


class MainScreen(Screen):
    """Главный экран приложения"""

    BINDINGS = [
        ("q", "quit", "Выход"),
        ("n", "new_note", "Новая (Ctrl+N)"),
        ("slash", "search", "Поиск (/)"),
        ("ctrl+r", "recent", "Недавние (Ctrl+R)"),
        ("ctrl+s", "sync", "Синх. (Ctrl+S)"),
        ("ctrl+f", "format", "Форматировать"),
        ("question_mark", "help", "Помощь"),
    ]

    def __init__(self):
        super().__init__()
        self.notes_manager = NotesManager()
        self.current_path: Optional[Path] = None

    def compose(self) -> ComposeResult:
        """Компоновка экрана"""
        yield Header(show_clock=True)

        with Horizontal(id="main-container"):
            # Левая панель — браузер заметок
            self.browser = NotesBrowser(self.notes_manager)
            yield self.browser

            # Правая панель — информация о файле
            with Vertical(id="info-panel"):
                yield Label("Информация о заметке", id="info-title")
                yield Static("", id="file-info")

        # Статус бар
        self.status = StatusBar()
        yield self.status

        yield Footer()

    def on_mount(self) -> None:
        """При загрузке приложения"""
        self.title = "Zed Notes — управление заметками"
        self.sub_title = "Горячие клавиши: ? для помощи"
        self.load_notes()

    def load_notes(self) -> None:
        """Загрузить список заметок"""
        self.browser.load_notes()
        self.update_status("Готово")

    def on_notes_browser_file_selected(self, event) -> None:
        """При выборе файла в браузере"""
        self.current_path = event.path
        self.update_file_info(event.path)

    def update_file_info(self, path: Path) -> None:
        """Обновить информацию о файле"""
        if not path.exists():
            return

        info_widget = self.query_one("#file-info", Static)

        if path.is_file():
            size = path.stat().st_size
            size_kb = size / 1024

            # Читаем первые 5 строк для превью
            try:
                with open(path, "r", encoding="utf-8") as f:
                    lines = [f.readline() for _ in range(5)]
                preview = "".join(lines)[:200]
            except:
                preview = "(Не удалось прочитать файл)"

            info = f"""
📄 {path.name}
━━━━━━━━━━━━━━━━━━━━━━━━━
Размер: {size_kb:.1f} KB
Путь: {path.relative_to(Path.cwd().parent)}

Превью:
{preview}...

(Enter) Открыть | (e) Редактировать
            """
        else:
            # Папка
            files = list(path.glob("*"))
            info = f"""
📁 {path.name}
━━━━━━━━━━━━━━━━━━━━━━━━━
Файлов: {len([f for f in files if f.is_file()])}
Папок: {len([f for f in files if f.is_dir()])}

(Enter) Открыть | (n) Новая заметка
            """

        info_widget.update(info)

    def action_new_note(self) -> None:
        """Создать новую заметку"""
        self.app.push_screen(NewNoteScreen(self.notes_manager))

    def action_search(self) -> None:
        """Открыть поиск"""
        self.app.push_screen(SearchScreen(self.notes_manager))

    def action_recent(self) -> None:
        """Показать недавние заметки"""
        recent = self.notes_manager.get_recent_notes(10)
        self.browser.show_notes(recent)
        self.update_status(f"Недавние {len(recent)} заметок")

    def action_sync(self) -> None:
        """Синхронизировать с git"""
        self.update_status("Синхронизация...")
        try:
            os.chdir(self.notes_manager.root_path)
            subprocess.run(["git", "add", "-A"], check=True, capture_output=True)
            subprocess.run(["git", "commit", "-m", "Auto-sync from TUI"], capture_output=True)
            subprocess.run(["git", "push"], check=True, capture_output=True)
            self.update_status("✓ Синхронизация успешна")
        except subprocess.CalledProcessError as e:
            self.update_status(f"✗ Ошибка синхронизации: {e}")

    def action_format(self) -> None:
        """Форматировать заметки"""
        self.update_status("Форматирование...")
        try:
            script_path = self.notes_manager.root_path / ".scripts" / "format_notes.py"
            subprocess.run(["python3", str(script_path)], check=True)
            self.update_status("✓ Форматирование завершено")
            self.load_notes()
        except subprocess.CalledProcessError as e:
            self.update_status(f"✗ Ошибка форматирования")

    def action_help(self) -> None:
        """Показать справку"""
        self.app.push_screen(HelpScreen())

    def update_status(self, message: str) -> None:
        """Обновить статус"""
        self.status.update(message)


class NewNoteScreen(Screen):
    """Экран создания новой заметки"""

    BINDINGS = [
        ("escape", "cancel", "Отмена"),
        ("ctrl+s", "save", "Сохранить"),
    ]

    def __init__(self, notes_manager: NotesManager):
        super().__init__()
        self.notes_manager = notes_manager

    def compose(self) -> ComposeResult:
        yield Header()

        with Vertical(id="new-note-form"):
            yield Label("Создать новую заметку")

            yield Label("Категория:")
            self.category = Input(placeholder="Образование/Большие языковые модели")
            yield self.category

            yield Label("Название:")
            self.title = Input(placeholder="Мой запрос")
            yield self.title

            yield Label("Теги (через запятую):")
            self.tags = Input(placeholder="tag1, tag2, tag3")
            yield self.tags

            with Horizontal():
                yield Button("Создать", id="create-btn")
                yield Button("Отмена", id="cancel-btn")

        yield Footer()

    def on_mount(self) -> None:
        self.title = "Новая заметка"
        self.category.focus()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "create-btn":
            self.action_save()
        elif event.button.id == "cancel-btn":
            self.action_cancel()

    def action_save(self) -> None:
        """Сохранить новую заметку"""
        category = self.category.value.strip()
        title = self.title.value.strip()
        tags = [t.strip() for t in self.tags.value.split(",")]

        if not title:
            self.notify("Название не может быть пусто", severity="error")
            return

        try:
            path = self.notes_manager.create_note(title=title, category=category, tags=tags)
            self.notify(f"✓ Заметка создана: {path}", severity="information")
            self.app.pop_screen()
        except Exception as e:
            self.notify(f"✗ Ошибка: {e}", severity="error")

    def action_cancel(self) -> None:
        """Отмена"""
        self.app.pop_screen()


class SearchScreen(Screen):
    """Экран поиска"""

    BINDINGS = [
        ("escape", "cancel", "Отмена"),
    ]

    def __init__(self, notes_manager: NotesManager):
        super().__init__()
        self.notes_manager = notes_manager
        self.results = []

    def compose(self) -> ComposeResult:
        yield Header()

        with Vertical(id="search-form"):
            yield Label("Поиск заметок")
            self.search_input = Input(placeholder="Введите текст для поиска...")
            yield self.search_input

            yield Label("Результаты:", id="results-label")
            self.results_widget = Static("", id="search-results")
            yield self.results_widget

        yield Footer()

    def on_mount(self) -> None:
        self.title = "Поиск"
        self.search_input.focus()

    @on(Input.Changed)
    def on_search_input_changed(self, event: Input.Changed) -> None:
        """При изменении текста поиска"""
        query = event.value.strip()

        if not query or len(query) < 2:
            self.results_widget.update("")
            return

        self.results = self.notes_manager.search(query)
        self.display_results()

    def display_results(self) -> None:
        """Показать результаты поиска"""
        if not self.results:
            self.results_widget.update("Ничего не найдено")
            return

        results_text = ""
        for i, path in enumerate(self.results[:20], 1):
            rel_path = path.relative_to(self.notes_manager.root_path)
            results_text += f"{i}. {path.name}\n   {rel_path}\n\n"

        self.results_widget.update(results_text)

    def action_cancel(self) -> None:
        """Отмена"""
        self.app.pop_screen()


class HelpScreen(Screen):
    """Экран справки"""

    BINDINGS = [
        ("escape", "back", "Назад"),
        ("q", "back", "Назад"),
    ]

    def compose(self) -> ComposeResult:
        yield Header()

        help_text = """
╔════════════════════════════════════════════════════════════════════════╗
║                        ZED NOTES — СПРАВКА                            ║
╚════════════════════════════════════════════════════════════════════════╝

ОСНОВНЫЕ КОМАНДЫ:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  q               Выход из приложения
  n               Создать новую заметку (Ctrl+N)
  /               Поиск по заметкам
  Ctrl+R          Недавние заметки
  Ctrl+S          Синхронизировать с Git
  Ctrl+F          Форматировать все заметки
  ?               Эта справка

НАВИГАЦИЯ:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  j/k, ↑/↓        Движение вверх/вниз
  h/l, ←/→        Движение по папкам
  Enter           Открыть файл/папку
  e               Редактировать в $EDITOR
  Space           Выбрать/отметить

В БРАУЗЕРЕ:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  o               Открыть в редакторе (VS Code/Neovim)
  r               Переименовать файл
  d               Удалить файл/папку
  t               Показать теги файла
  i               Информация о файле

ПОИСК:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Начните вводить текст для поиска
  Enter           Открыть выбранный файл
  Esc             Закрыть поиск

СОЗДАНИЕ ЗАМЕТКИ:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Укажите категорию (автодополнение доступно)
  Введите название заметки
  Добавьте теги (опционально)
  Ctrl+S для создания

ОПЕРАЦИИ С GIT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Ctrl+S          Автоматический коммит и пуш
                  (если Git отслеживает репозиторий)

╔════════════════════════════════════════════════════════════════════════╗
║  Нажми Esc или q для выхода из справки                                ║
╚════════════════════════════════════════════════════════════════════════╝
        """

        yield Static(help_text, id="help-content")
        yield Footer()

    def on_mount(self) -> None:
        self.title = "Справка"

    def action_back(self) -> None:
        """Назад на главный экран"""
        self.app.pop_screen()


class NotesApp:
    """Главное приложение"""

    def run(self):
        """Запустить TUI"""
        from textual.app import App

        class ZedNotesApp(App):
            CSS = """
            Screen {
                background: $surface;
                color: $text;
            }

            #main-container {
                height: 1fr;
            }

            #info-panel {
                width: 40;
                border-left: solid $primary;
                padding: 1;
            }

            #file-info {
                height: 1fr;
                border: solid $accent;
                padding: 1;
            }

            #new-note-form {
                width: 80;
                height: auto;
                border: solid $primary;
                padding: 2;
            }

            #search-form {
                width: 100;
                height: 1fr;
                border: solid $primary;
                padding: 1;
            }

            #help-content {
                width: 100;
                height: 1fr;
                padding: 1;
            }
            """

            def on_mount(self) -> None:
                self.push_screen(MainScreen())

        app = ZedNotesApp()
        app.run()


if __name__ == "__main__":
    NotesApp().run()
