# /// script
# dependencies = [
#   "rich",
# ]
# ///

import os
from datetime import datetime
from pathlib import Path

from rich.console import Console
from rich.prompt import Confirm, Prompt

console = Console()


def discover_categories():
    """Dynamically discover categories from the actual filesystem structure."""
    root_dir = Path(__file__).parent
    categories = {}

    # Find all directories starting with a number (main categories)
    for main_dir in sorted(root_dir.iterdir()):
        if not main_dir.is_dir():
            continue
        if main_dir.name.startswith("."):
            continue
        if main_dir.name == "assets":
            continue

        # Check if it looks like a main category (starts with digit)
        if not main_dir.name[0].isdigit():
            continue

        subcategories = {}
        # Find all subdirectories (subcategories)
        for sub_dir in sorted(main_dir.iterdir()):
            if sub_dir.is_dir() and not sub_dir.name.startswith("."):
                subcategories[sub_dir.name] = sub_dir

        if subcategories:
            categories[main_dir.name] = subcategories

    return categories


def display_tree(categories, selected_main=None, selected_sub=None):
    """Display the category tree with visual hierarchy."""
    console.clear()
    console.print("[bold cyan]📂 Навигация по категориям[/bold cyan]\n")

    for i, main_cat in enumerate(sorted(categories.keys()), 1):
        is_selected_main = main_cat == selected_main
        marker = "▶ " if is_selected_main else "  "
        color = "yellow" if is_selected_main else "white"
        console.print(f"{marker}[{color}]{i}. {main_cat}[/{color}]")

        if is_selected_main:
            subcats = sorted(categories[main_cat].keys())
            for j, sub_cat in enumerate(subcats, 1):
                is_selected_sub = sub_cat == selected_sub
                sub_marker = "  └─ ▶" if is_selected_sub else "  └─"
                sub_color = "green" if is_selected_sub else "dim"
                console.print(f"{sub_marker}[{sub_color}]{j}. {sub_cat}[/{sub_color}]")
            console.print(
                f"  └─[dim]{len(subcats) + 1}. [yellow]+ Создать новую подкатегорию[/yellow][/dim]"
            )

    console.print()


def select_category_interactive(categories):
    """Interactive navigation through category tree."""
    selected_main = None
    selected_sub = None

    while True:
        display_tree(categories, selected_main, selected_sub)

        if selected_main is None:
            console.print(
                "[dim]Выберите основную категорию (введите номер и нажмите Enter)[/dim]"
            )
            choice = Prompt.ask("[cyan]Выбор[/cyan]", default="")

            try:
                choice_num = int(choice)
                main_cats = sorted(categories.keys())
                if 1 <= choice_num <= len(main_cats):
                    selected_main = main_cats[choice_num - 1]
                else:
                    console.print("[red]❌ Неверный номер[/red]")
            except ValueError:
                console.print("[red]❌ Введите число[/red]")

        else:
            subcats = sorted(categories[selected_main].keys())
            console.print(f"\n[dim]Выберите подкатегорию в '{selected_main}'[/dim]")
            console.print("[dim](Введите 0 для выбора другой основной категории)[/dim]")

            choice = Prompt.ask("[cyan]Выбор[/cyan]", default="")

            try:
                choice_num = int(choice)

                if choice_num == 0:
                    selected_main = None
                    selected_sub = None
                elif choice_num == len(subcats) + 1:
                    # Create new subcategory
                    new_subcat = Prompt.ask("\n📂 Название новой подкатегории")
                    new_subcat = new_subcat.replace(" ", "_")
                    root_dir = Path(__file__).parent
                    new_subcat_path = root_dir / selected_main / new_subcat
                    new_subcat_path.mkdir(parents=True, exist_ok=True)
                    console.print(
                        f"[green]✅ Подкатегория '{new_subcat}' создана![/green]"
                    )
                    selected_sub = new_subcat
                    return selected_main, selected_sub
                elif 1 <= choice_num <= len(subcats):
                    selected_sub = subcats[choice_num - 1]
                    return selected_main, selected_sub
                else:
                    console.print("[red]❌ Неверный номер[/red]")
            except ValueError:
                console.print("[red]❌ Введите число[/red]")


def get_note_details():
    """Get note title and optional tags."""
    console.print()
    title = Prompt.ask("📝 Название заметки")

    # Optional: get tags
    tags_input = Prompt.ask(
        "🏷️  Теги (через запятую)",
        default="",
    )
    tags = [tag.strip() for tag in tags_input.split(",") if tag.strip()]

    return title, tags


def create_note(main_category, subcategory, title, tags):
    """Create the note file with frontmatter."""
    root_dir = Path(__file__).parent
    note_dir = root_dir / main_category / subcategory

    # Create directory if it doesn't exist
    note_dir.mkdir(parents=True, exist_ok=True)

    # Generate filename from title
    # Replace spaces with underscores, remove special characters
    filename = "".join(c if c.isalnum() or c in (" ", "-") else "" for c in title)
    filename = filename.replace(" ", "_").lower()
    if not filename.endswith(".md"):
        filename += ".md"

    file_path = note_dir / filename

    # Check if file already exists
    if file_path.exists():
        if not Confirm.ask(
            f"[yellow]Файл {filename} уже существует. Перезаписать?[/yellow]"
        ):
            console.print("[red]Отмена.[/red]")
            return None

    # Create frontmatter
    now = datetime.now().isoformat()
    frontmatter = f"""---
title: {title}
date: {now}
category: {main_category}/{subcategory}
tags: {tags if tags else "[]"}
---

"""

    # Add template content
    content = (
        frontmatter
        + f"""## {title}

<!-- Добавьте содержимое вашей заметки здесь -->

"""
    )

    # Write file
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

    return file_path


def main():
    """Main function."""
    console.print("[bold cyan]🎯 Создание новой заметки[/bold cyan]\n")

    # Discover categories dynamically
    categories = discover_categories()

    if not categories:
        console.print("[red]❌ Не найдено категорий в проекте![/red]")
        return

    # Interactive selection
    main_cat, sub_cat = select_category_interactive(categories)

    # Get note details
    title, tags = get_note_details()

    # Create the note
    file_path = create_note(main_cat, sub_cat, title, tags)

    if file_path:
        console.print("\n[green]✅ Заметка создана![/green]")
        console.print(
            f"[cyan]Путь:[/cyan] {file_path.relative_to(Path(__file__).parent)}"
        )
        console.print(f"[cyan]Категория:[/cyan] {main_cat}/{sub_cat}")
        if tags:
            console.print(f"[cyan]Теги:[/cyan] {', '.join(tags)}")

        # Offer to open in editor
        if Confirm.ask("\n📂 Открыть файл в редакторе?"):
            os.system(f'open "{file_path}"')


if __name__ == "__main__":
    main()
