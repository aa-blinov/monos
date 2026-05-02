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

# Define category structure based on your current system
CATEGORIES = {
    "01_Work": {
        "EORA": "EORA проекты, стратегия, встречи",
        "NSTU": "NSTU проекты и коммерческие предложения",
        "Research_DPI": "Исследовательские материалы по DPI",
    },
    "02_Projects_and_Education": {
        "HSE_Stephen": "Проект для ВШЭ",
        "Wife_Study": "Учебные материалы",
        "Pet_Projects": "Личные проекты",
    },
    "03_Tech_Knowledge": {
        "LLM": "Знания про LLM и RAG",
        "Python": "Python и программирование",
        "Copilot": "Промпты для ИИ-помощников",
    },
    "04_Documents": {
        "Digital_Nomad": "Digital Nomad Residency материалы",
        "TRP_and_PR": "ВНЖ и документы",
    },
    "05_Personal_and_Creative": {
        "Psychology": "Психология и личное развитие",
        "Ideas": "Идеи для проектов",
        "Prompts": "Избранные промпты",
    },
}


def display_categories():
    """Display category structure in a nice table."""
    table = Table(title="📁 Доступные категории")
    table.add_column("Основная категория", style="cyan")
    table.add_column("Подкатегория", style="magenta")
    table.add_column("Описание", style="green")

    for main_cat, subcats in CATEGORIES.items():
        first = True
        for subcat, description in subcats.items():
            if first:
                table.add_row(main_cat, subcat, description)
                first = False
            else:
                table.add_row("", subcat, description)

    console.print(table)


def select_category():
    """Let user select main category and subcategory."""
    display_categories()
    console.print()

    # Select main category
    main_categories = list(CATEGORIES.keys())
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

    # Select subcategory
    subcategories = list(CATEGORIES[main_cat].keys())
    console.print(f"\nВыберите подкатегорию для '{main_cat}':")
    for i, subcat in enumerate(subcategories, 1):
        console.print(f"  {i}. {subcat}")

    while True:
        try:
            choice = int(
                Prompt.ask(
                    "Введите номер подкатегории",
                    choices=[str(i) for i in range(1, len(subcategories) + 1)],
                )
            )
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

    # Select category
    main_cat, sub_cat = select_category()

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
