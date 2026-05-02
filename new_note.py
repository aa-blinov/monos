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
from rich.table import Table

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
                subcategories[sub_dir.name] = f"Подкатегория: {sub_dir.name}"

        if subcategories:
            categories[main_dir.name] = subcategories

    return categories


def display_categories(categories):
    """Display category structure in a nice table."""
    table = Table(title="📁 Доступные категории")
    table.add_column("Основная категория", style="cyan")
    table.add_column("Подкатегория", style="magenta")
    table.add_column("Описание", style="green")

    for main_cat in sorted(categories.keys()):
        subcats = categories[main_cat]
        first = True
        for subcat in sorted(subcats.keys()):
            description = subcats[subcat]
            if first:
                table.add_row(main_cat, subcat, description)
                first = False
            else:
                table.add_row("", subcat, description)

    console.print(table)


def select_category(categories):
    """Let user select main category and subcategory."""
    display_categories(categories)
    console.print()

    # Select main category
    main_categories = sorted(categories.keys())
    console.print("Выберите основную категорию:")
    for i, cat in enumerate(main_categories, 1):
        console.print(f"  {i}. {cat}")

    while True:
        try:
            choice = int(
                Prompt.ask(
                    "Введите номер основной категории",
                    choices=[str(i) for i in range(1, len(main_categories) + 1)],
                )
            )
            main_cat = main_categories[choice - 1]
            break
        except (ValueError, IndexError):
            console.print("[red]Неверный выбор. Попробуйте снова.[/red]")

    # Select or create subcategory
    subcategories = sorted(categories[main_cat].keys())
    console.print(f"\nВыберите подкатегорию для '{main_cat}':")
    for i, subcat in enumerate(subcategories, 1):
        console.print(f"  {i}. {subcat}")
    console.print(
        f"  {len(subcategories) + 1}. [yellow]+ Создать новую подкатегорию[/yellow]"
    )

    while True:
        try:
            choice = int(
                Prompt.ask(
                    "Введите номер подкатегории",
                    choices=[str(i) for i in range(1, len(subcategories) + 2)],
                )
            )

            if choice == len(subcategories) + 1:
                # Create new subcategory
                new_subcat = Prompt.ask("📂 Введите название новой подкатегории")
                new_subcat = new_subcat.replace(" ", "_")
                root_dir = Path(__file__).parent
                new_subcat_path = root_dir / main_cat / new_subcat
                new_subcat_path.mkdir(parents=True, exist_ok=True)
                console.print(f"[green]✅ Подкатегория '{new_subcat}' создана![/green]")
                sub_cat = new_subcat
                break
            else:
                sub_cat = subcategories[choice - 1]
                break
        except (ValueError, IndexError):
            console.print("[red]Неверный выбор. Попробуйте снова.[/red]")

    return main_cat, sub_cat


def get_note_details():
    """Get note title and optional tags."""
    title = Prompt.ask("📝 Введите название заметки")

    # Optional: get tags
    tags_input = Prompt.ask(
        "🏷️  Введите теги (через запятую)",
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

    # Select category
    main_cat, sub_cat = select_category(categories)

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
