#!/usr/bin/env python3
"""
Пользовательские виджеты для TUI
"""

from pathlib import Path
from typing import List, Optional

from textual.containers import Vertical
from textual.message import Message
from textual.widgets import Label, Static, Tree
from textual.widgets.tree import TreeNode

try:
    from .models import NotesManager
except ImportError:
    from models import NotesManager


class NotesBrowser(Vertical):
    """Браузер для навигации по заметкам"""

    class FileSelected(Message):
        """Сигнал при выборе файла"""

        def __init__(self, path: Path):
            super().__init__()
            self.path = path

    def __init__(self, notes_manager: NotesManager):
        super().__init__(id="notes-browser")
        self.notes_manager = notes_manager
        self._tree: Optional[Tree] = None
        self.current_node: Optional[TreeNode] = None

    def compose(self):
        """Компоновка браузера"""
        yield Label("Браузер заметок", id="browser-title")
        self._tree = Tree(self.notes_manager.notes_dir.name)
        self._tree.id = "notes-tree"
        yield self._tree

    def on_mount(self) -> None:
        """При загрузке"""
        self.load_notes()
        # Развернём корневой узел
        if self._tree:
            self._tree.root.expand()

    def load_notes(self) -> None:
        """Загрузить все заметки в дерево"""
        if not self._tree:
            return

        self._tree.clear()
        root = self._tree.root
        self._populate_tree(root, self.notes_manager.notes_dir)
        # Развернём корневой узел после загрузки
        root.expand()

    def show_notes(self, notes: List[Path]) -> None:
        """
        Показать определённый список заметок

        Args:
            notes: Список путей к заметкам
        """
        if not self._tree:
            return

        self._tree.clear()
        root = self._tree.root

        for note in notes:
            rel_path = note.relative_to(self.notes_manager.notes_dir)
            label = f"{note.name} ({self.notes_manager.get_note_size(note)})"
            root.add_leaf(label, {"path": note})

    def _populate_tree(self, parent: TreeNode, path: Path) -> None:
        """
        Рекурсивно заполнить дерево файлов и папок

        Args:
            parent: Родительский узел дерева
            path: Путь к директории
        """
        try:
            entries = sorted(path.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))

            for entry in entries:
                # Пропускаем скрытые и служебные
                if entry.name.startswith("."):
                    continue

                if entry.is_dir():
                    # Добавляем папку
                    label = f"{entry.name}/"
                    # Автоматически развертываем подпапки для удобства
                    has_content = any(
                        p.suffix == ".md" or p.is_dir() for p in entry.iterdir() if not p.name.startswith(".")
                    )
                    node = parent.add(label, expand=has_content, data={"path": entry})
                    # Рекурсивно добавляем содержимое
                    self._populate_tree(node, entry)

                elif entry.suffix == ".md" and entry.name != "README.md":
                    # Добавляем файл с размером
                    size = self.notes_manager.get_note_size(entry)
                    label = f"{entry.name} ({size})"
                    parent.add_leaf(label, {"path": entry})

        except (PermissionError, OSError):
            pass

    def on_tree_select(self, event: Tree.NodeSelected) -> None:
        """При выборе узла дерева"""
        if event.node.data:
            path = event.node.data.get("path")
            if path:
                self.post_message(self.FileSelected(path))


class SearchWidget(Static):
    """Виджет для поиска заметок"""

    def __init__(self, notes_manager: NotesManager):
        super().__init__()
        self.notes_manager = notes_manager
        self.results: List[Path] = []


class StatusBar(Static):
    """Статус-бар приложения"""

    def __init__(self):
        super().__init__(id="status-bar")
        self._message = "Готово"

    def render(self) -> str:
        """Отобразить статус"""
        return f"[{self._message}]"

    def update(self, message: str) -> None:
        """Обновить сообщение в статус-баре"""
        self._message = message
        self.refresh()
