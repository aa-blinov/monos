#!/usr/bin/env python3
"""Script to improve and verify LLM agent articles"""

import os
import re
from pathlib import Path

BASE_PATH = Path(__file__).parent.parent


def check_file(filepath):
    """Check current status of a file"""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    print(f"\n📋 Проверка файла: {filepath.name}")
    print("=" * 60)

    # Check for broken text
    if "Этот метод был впервые важно на ярко показан Wei et al." in content:
        print("❌ Найден сломанный текст в Chain of Thought")
    else:
        print("✓ Сломанный текст не найден")

    # Check for citations
    citations = {
        "arXiv:2201.11903": "Chain of Thought (Wei et al.)",
        "arXiv:2210.03629": "ReAct (Yao et al.)",
        "arXiv:2308.08155": "Agent research",
        "arXiv:2311.08435": "Agent research",
    }

    print("\n📚 Citations:")
    for arxiv, name in citations.items():
        if arxiv in content:
            print(f"  ✓ {arxiv} ({name})")
        else:
            print(f"  - {arxiv} ({name})")

    # Check for TOC
    if "## Содержание" in content or "## Table of Contents" in content:
        print("\n✓ Table of Contents присутствует")
    else:
        print("\n❌ Table of Contents отсутствует")

    # Count sections
    sections = len(re.findall(r"^## ", content, re.MULTILINE))
    subsections = len(re.findall(r"^### ", content, re.MULTILINE))
    print(f"\n📊 Структура: {sections} разделов, {subsections} подразделов")

    return content


def improve_agents_article():
    """Improve the Agents article"""
    filepath = BASE_PATH / "Образование/Большие языковые модели/Агенты на основе LLM - полный обзор.md"

    if not filepath.exists():
        print(f"❌ File not found: {filepath}")
        return

    content = check_file(filepath)

    improvements = []

    # Fix broken Chain of Thought text
    old_cot = """Похожий подход — **Chain of Thought** (CoT) — это просто просить модель показать её рассуждения. Метод был предложен Wei et al. в работе "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models" ([arXiv:2201.11903](https://arxiv.org/abs/2201.11903)) Этот метод был впервые важно на ярко показан Wei et al. в работе "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models" ([ar"""

    if old_cot in content:
        new_cot = """Похожий подход — **Chain of Thought** (CoT) — это просто просить модель показать её рассуждения. Метод был предложен Wei et al. в работе "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models" ([arXiv:2201.11903](https://arxiv.org/abs/2201.11903)). CoT существенно улучшает качество рассуждений моделей, особенно на сложных задачах."""
        content = content.replace(old_cot, new_cot)
        improvements.append("✓ Исправлен сломанный текст в Chain of Thought")

    # Add Claude-specific note in Function Calling section
    func_call_original = """### Function Calling — как работает вызов функций

Когда модель решает использовать инструмент, она возвращает специальный формат:

```json"""

    func_call_improved = """### Function Calling — как работает вызов функций

Когда модель решает использовать инструмент, она возвращает специальный формат. **Для Claude**, это происходит через XML-теги в тексте (в отличие от других моделей, которые могут возвращать JSON). Вот пример:

```json"""

    if func_call_original in content:
        content = content.replace(func_call_original, func_call_improved)
        improvements.append("✓ Добавлена Claude-specific информация в Function Calling")

    if improvements:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print("\n" + "=" * 60)
        print("✅ Улучшения применены:")
        for imp in improvements:
            print(f"  {imp}")
    else:
        print("\n" + "=" * 60)
        print("⚠️ Нет изменений (возможно, файл уже улучшен)")


if __name__ == "__main__":
    improve_agents_article()
