#!/usr/bin/env python3
"""Script to enhance articles with Claude-specific guidance and better citations"""

import re
from pathlib import Path

BASE_PATH = Path(__file__).parent.parent


def enhance_agents_article():
    """Add Claude-specific guidance and citations to agents article"""
    filepath = BASE_PATH / "Образование/Большие языковые модели/Агенты на основе LLM - полный обзор.md"

    if not filepath.exists():
        print(f"❌ File not found: {filepath}")
        return False

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    original_content = content
    changes_made = []

    # Enhancement 1: Add Claude-specific note to Function Calling
    if "### Function Calling — как работает вызов функций" in content:
        old_section = """### Function Calling — как работает вызов функций

Когда модель решает использовать инструмент, она возвращает специальный формат:

```json
{
  "type": "function",
  "function": {
    "name": "get_weather",
    "arguments": {
      "city": "Moscow",
      "units": "celsius"
    }
  }
}
```"""

        new_section = """### Function Calling — как работает вызов функций

Когда модель решает использовать инструмент, она возвращает специальный формат. Это может быть JSON, XML или текстовой формат в зависимости от провайдера LLM.

**Важное замечание для Claude:** Claude использует специальную XML-синтаксис с тегами `<function_calls>` и `<invoke>` для вызова функций, что позволяет интегрировать с системой инструментов напрямую в текст ответа.

Вот пример общего формата:

```json
{
  "type": "function",
  "function": {
    "name": "get_weather",
    "arguments": {
      "city": "Moscow",
      "units": "celsius"
    }
  }
}
```"""

        if old_section in content:
            content = content.replace(old_section, new_section)
            changes_made.append("✓ Добавлена Claude-specific информация в Function Calling")

    # Enhancement 2: Add note about tool use best practices
    if "## Часть 7: Лучшие практики" in content:
        old_practices = """## Часть 7: Лучшие практики

### 1. Дайте агенту время на размышление"""

        new_practices = """## Часть 7: Лучшие практики

> **Совет для Claude:** Claude лучше всего работает с явными инструкциями о том, как использовать инструменты. Предоставляйте четкие описания функций и примеры использования, и Claude будет эффективнее выбирать подходящие инструменты для задачи.

### 1. Дайте агенту время на размышление"""

        if old_practices in content:
            content = content.replace(old_practices, new_practices)
            changes_made.append("✓ Добавлен совет для Claude в раздел 'Лучшие практики'")

    # Enhancement 3: Add citation for memory types
    if "**Эпизодическая память**" in content and not ("arXiv:" in content and "память" in content):
        old_memory = """### Виды памяти в агентах

**Эпизодическая память** (короткая) — что произошло в этом разговоре."""

        new_memory = """### Виды памяти в агентах

Психологические исследования памяти (Tulving, E., 1985) выделяют несколько типов памяти, которые полезно применять к агентам:

**Эпизодическая память** (короткая) — что произошло в этом разговоре."""

        if old_memory in content:
            content = content.replace(old_memory, new_memory)
            changes_made.append("✓ Добавлена ссылка на психологические основы видов памяти")

    if content != original_content:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)

        print(f"✅ Файл улучшен: {filepath.name}")
        print("\nПрименённые изменения:")
        for change in changes_made:
            print(f"  {change}")
        return True
    else:
        print(f"⚠️ Никаких изменений не требуется для: {filepath.name}")
        return False


def enhance_mas_article():
    """Add Claude-specific guidance to MAS article"""
    filepath = BASE_PATH / "Образование/Большие языковые модели/Архитектура мультиагентных систем.md"

    if not filepath.exists():
        print(f"❌ File not found: {filepath}")
        return False

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    original_content = content
    changes_made = []

    # Enhancement 1: Add Claude context window guidance
    if "## Часть 3: Управление состоянием и контекстом" in content:
        old_section = """### Проблема контекстного окна

С добавлением количества агентов, каждый из которых может иметь достаточно длинный контекст, быстро исчерпывается бюджет токенов."""

        new_section = """### Проблема контекстного окна

С добавлением количества агентов, каждый из которых может иметь достаточно длинный контекст, быстро исчерпывается бюджет токенов.

**Для Claude:** С контекстным окном ~200K токенов вы можете работать с довольно объемными состояниями, но всё равно нужна разумная стратегия кэширования и резюмирования для больших историй взаимодействий."""

        if old_section in content:
            content = content.replace(old_section, new_section)
            changes_made.append("✓ Добавлена информация про контекстное окно Claude")

    # Enhancement 2: Add Claude tool coordination note
    if "## Часть 2: Механизмы коммуникации" in content:
        old_comm = """### Синхронная коммуникация (Request-Response)

Простейший способ: один агент отправляет сообщение другому и ждет ответа."""

        new_comm = """### Синхронная коммуникация (Request-Response)

Простейший способ: один агент отправляет сообщение другому и ждет ответа.

**При использовании Claude:** Можно реализовать через вложенные вызовы инструментов, где один агент (реализованный как функция/tool) вызывает другого и получает результат синхронно."""

        if old_comm in content:
            content = content.replace(old_comm, new_comm)
            changes_made.append("✓ Добавлена информация про синхронную коммуникацию с Claude")

    if content != original_content:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)

        print(f"✅ Файл улучшен: {filepath.name}")
        print("\nПрименённые изменения:")
        for change in changes_made:
            print(f"  {change}")
        return True
    else:
        print(f"⚠️ Никаких изменений не требуется для: {filepath.name}")
        return False


if __name__ == "__main__":
    print("🔧 Улучшение статей про агентов...\n")

    result1 = enhance_agents_article()
    print()
    result2 = enhance_mas_article()

    print("\n" + "=" * 60)
    if result1 or result2:
        print("✅ Все улучшения успешно применены!")
    else:
        print("ℹ️ Файлы уже в хорошем состоянии")
