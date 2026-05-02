#!/usr/bin/env python3
"""
Zed Notes TUI — управление системой заметок через терминал
"""

import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional

from textual.app import ComposeResult, on
from textual.containers import Horizontal, Vertical
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
        ("e", "edit_note", "Редактировать (e)"),
        ("o", "open_file", "Открыть (o)"),
        ("d", "delete_note", "Удалить (d)"),
        ("r", "rename_note", "Переименовать (r)"),
        ("t", "show_tags", "Теги (t)"),
        ("i", "show_info", "Информация (i)"),
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

            # Получаем метаданные (фронтматтер)
            metadata = self.notes_manager.get_note_metadata(path)
            title = metadata.get("title", path.name)
            tags = metadata.get("tags", [])
            category = metadata.get("category", "")
            status = metadata.get("status", "unknown")

            # Читаем первые несколько строк для превью
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                # Пропускаем фронтматтер
                if content.startswith("---"):
                    _, _, body = content.split("---", 2)
                    preview = body.strip()[:300]
                else:
                    preview = content[:300]
            except:
                preview = "(Не удалось прочитать файл)"

            tags_str = ", ".join(tags) if tags else "(нет тегов)"
            info = f"""
📄 {title}
━━━━━━━━━━━━━━━━━━━━━━━━━
Размер: {size_kb:.1f} KB
Статус: {status}
Категория: {category}

Теги: {tags_str}

Превью:
{preview}...

Экшены: (e) Редактировать | (o) Открыть
         (d) Удалить | (r) Переименовать
            """
        else:
            # Папка
            try:
                files = list(path.glob("*"))
                md_files = [f for f in files if f.suffix == ".md" and f.name != "README.md"]
                folders = [f for f in files if f.is_dir()]
            except:
                md_files = []
                folders = []

            info = f"""
📁 {path.name}
━━━━━━━━━━━━━━━━━━━━━━━━━
Заметок: {len(md_files)}
Подпапок: {len(folders)}

Экшены: (n) Новая заметка
         (e) Открыть в редакторе
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

    def action_edit_note(self) -> None:
        """Редактировать текущую заметку"""
        if not self.current_path or not self.current_path.is_file():
            self.update_status("✗ Выберите файл для редактирования")
            return

        try:
            editor = os.environ.get("EDITOR", "nano")
            subprocess.run([editor, str(self.current_path)], check=True)
            self.update_status(f"✓ Файл отредактирован")
            self.load_notes()
        except subprocess.CalledProcessError:
            self.update_status("✗ Ошибка при редактировании")

    def action_open_file(self) -> None:
        """Открыть файл в системном приложении"""
        if not self.current_path or not self.current_path.is_file():
            self.update_status("✗ Выберите файл для открытия")
            return

        try:
            subprocess.run(["open", str(self.current_path)], check=True)
            self.update_status(f"✓ Файл открыт")
        except subprocess.CalledProcessError:
            self.update_status("✗ Не удалось открыть файл")

    def action_delete_note(self) -> None:
        """Удалить заметку"""
        if not self.current_path:
            self.update_status("✗ Выберите файл для удаления")
            return

        self.app.push_screen(
            ConfirmScreen(
                title="Удаление файла",
                message=f"Вы уверены, что хотите удалить:\n{self.current_path.name}?",
                on_confirm=lambda: self._do_delete(self.current_path),
            )
        )

    def _do_delete(self, path: Path) -> None:
        """Выполнить удаление"""
        try:
            if path.is_file():
                path.unlink()
            else:
                shutil.rmtree(path)
            self.update_status(f"✓ Файл удалён")
            self.load_notes()
            self.current_path = None
        except Exception as e:
            self.update_status(f"✗ Ошибка удаления: {e}")

    def action_rename_note(self) -> None:
        """Переименовать заметку"""
        if not self.current_path:
            self.update_status("✗ Выберите файл для переименования")
            return

        self.app.push_screen(RenameScreen(self.current_path, self))

    def action_show_tags(self) -> None:
        """Показать теги файла"""
        if not self.current_path or not self.current_path.is_file():
            self.update_status("✗ Выберите файл")
            return

        metadata = self.notes_manager.get_note_metadata(self.current_path)
        tags = metadata.get("tags", [])
        tags_str = ", ".join(tags) if tags else "(нет тегов)"
        self.notify(f"Теги: {tags_str}", timeout=5)

    def action_show_info(self) -> None:
        """Показать детальную информацию"""
        if not self.current_path:
            self.update_status("✗ Выберите файл")
            return

        self.app.push_screen(InfoScreen(self.current_path, self.notes_manager))

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


class ConfirmScreen(Screen):
    """Экран подтверждения действия"""

    BINDINGS = [
        ("y", "confirm", "Да"),
        ("n", "cancel", "Нет"),
        ("escape", "cancel", "Отмена"),
    ]

    def __init__(self, title: str, message: str, on_confirm=None):
        super().__init__()
        self.title_text = title
        self.message_text = message
        self.on_confirm = on_confirm

    def compose(self) -> ComposeResult:
        yield Header()
        with Vertical(id="confirm-dialog"):
            yield Label(self.title_text)
            yield Label(self.message_text)
            with Horizontal():
                yield Button("Да", id="confirm-btn")
                yield Button("Нет", id="cancel-btn")
        yield Footer()

    def on_mount(self) -> None:
        self.title = self.title_text

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "confirm-btn":
            self.action_confirm()
        elif event.button.id == "cancel-btn":
            self.action_cancel()

    def action_confirm(self) -> None:
        if self.on_confirm:
            self.on_confirm()
        self.app.pop_screen()

    def action_cancel(self) -> None:
        self.app.pop_screen()


class RenameScreen(Screen):
    """Экран переименования файла"""

    BINDINGS = [
        ("escape", "cancel", "Отмена"),
        ("ctrl+s", "save", "Сохранить"),
    ]

    def __init__(self, path: Path, parent_screen):
        super().__init__()
        self.path = path
        self.parent_screen = parent_screen
        self.original_name = path.name

    def compose(self) -> ComposeResult:
        yield Header()
        with Vertical(id="rename-form"):
            yield Label(f"Переименовать: {self.original_name}")
            self.name_input = Input(value=self.original_name, placeholder="Новое имя")
            yield self.name_input
            with Horizontal():
                yield Button("Переименовать", id="rename-btn")
                yield Button("Отмена", id="cancel-btn")
        yield Footer()

    def on_mount(self) -> None:
        self.title = "Переименование"
        self.name_input.focus()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "rename-btn":
            self.action_save()
        elif event.button.id == "cancel-btn":
            self.action_cancel()

    def action_save(self) -> None:
        new_name = self.name_input.value.strip()
        if not new_name:
            return

        try:
            new_path = self.path.parent / new_name
            self.path.rename(new_path)
            self.parent_screen.update_status(f"✓ Файл переименован")
            self.parent_screen.load_notes()
            self.app.pop_screen()
        except Exception as e:
            self.parent_screen.update_status(f"✗ Ошибка: {e}")
            self.app.pop_screen()

    def action_cancel(self) -> None:
        self.app.pop_screen()


class InfoScreen(Screen):
    """Экран с детальной информацией о файле"""

    BINDINGS = [
        ("escape", "back", "Назад"),
        ("q", "back", "Назад"),
    ]

    def __init__(self, path: Path, notes_manager):
        super().__init__()
        self.path = path
        self.notes_manager = notes_manager

    def compose(self) -> ComposeResult:
        yield Header()

        metadata = self.notes_manager.get_note_metadata(self.path)
        stat = self.path.stat()

        mtime = datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        ctime = datetime.fromtimestamp(stat.st_ctime).strftime("%Y-%m-%d %H:%M:%S")

        info_text = f"""
╔═══════════════════════════════════════════════════════════════╗
║              ИНФОРМАЦИЯ О ФАЙЛЕ                              ║
╚═══════════════════════════════════════════════════════════════╝

ИМЯ ФАЙЛА:
  {self.path.name}

ПУТЬ:
  {self.path.absolute()}

РАЗМЕР:
  {stat.st_size} байт ({stat.st_size / 1024:.2f} KB)

ПОСЛЕДНЕЕ ИЗМЕНЕНИЕ:
  {mtime}

СОЗДАНО:
  {ctime}

МЕТАДАННЫЕ (YAML Frontmatter):
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Название: {metadata.get("title", "—")}
  Статус:   {metadata.get("status", "—")}
  Категория: {metadata.get("category", "—")}
  Дата:      {metadata.get("date", "—")}
  Теги:      {", ".join(metadata.get("tags", [])) or "—"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Нажми Esc или q для выхода
        """

        yield Static(info_text, id="info-content")
        yield Footer()

    def on_mount(self) -> None:
        self.title = f"Информация: {self.path.name}"

    def action_back(self) -> None:
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

РЕДАКТИРОВАНИЕ И УПРАВЛЕНИЕ ФАЙЛАМИ:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  e               Редактировать файл в $EDITOR
  o               Открыть в системном приложении
  r               Переименовать файл
  d               Удалить файл/папку (с подтверждением)
  t               Показать теги метаданных
  i               Открыть детальную информацию о файле

ПОИСК:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /               Начать поиск
  Введите текст для поиска по названиям и содержимому
  Enter           Открыть выбранный файл
  Esc             Закрыть поиск

СОЗДАНИЕ ЗАМЕТКИ:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  n               Создать новую заметку
  Укажите категорию (автодополнение доступно)
  Введите название заметки
  Добавьте теги (опционально)
  Ctrl+S для создания

ОПЕРАЦИИ С GIT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Ctrl+S          Синхронизировать (add, commit, push)
  Ctrl+F          Форматировать все заметки (mdformat)

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

            #rename-form {
                width: 60;
                height: auto;
                border: solid $primary;
                padding: 2;
            }

            #confirm-dialog {
                width: 60;
                height: auto;
                border: solid $warning;
                padding: 2;
            }

            #info-content {
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
