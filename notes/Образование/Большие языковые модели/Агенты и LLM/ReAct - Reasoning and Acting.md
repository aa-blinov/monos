# ReAct: Synergizing Reasoning and Acting in Language Models

> **В этой серии:** [Агенты на основе LLM](Агенты%20на%20основе%20LLM.md) — [Построение эффективных агентов](Построение%20эффективных%20агентов%20-%20практическое%20руководство.md) — [Архитектура мультиагентных систем](Архитектура%20мультиагентных%20систем.md) — [RAG](RAG.md)
- **Документация проекта:**
  - [Агенты на основе LLM](Агенты%20на%20основе%20LLM.md) — общий обзор агентов и их архитектур
  - [Архитектура мультиагентных систем](Архитектура%20мультиагентных%20систем.md) — как ReAct используется в многоагентных системах

## Введение

**ReAct** (Reasoning + Acting) — это один из самых влиятельных паттернов в истории развития языковых моделей. Опубликованная в октябре 2022 года работа Shunyu Yao и коллег из Princeton показала нечто революционное: если просто попросить LLM *чередовать* этапы размышления и действия, её способность решать сложные задачи возрастает в разы.

На первый взгляд всё просто: модель думает, потом действует, потом снова думает. Но эта простота скрывает глубокую истину о том, как работают языковые модели. В этой статье мы разберёмся, почему ReAct работает, как его применять, и почему он стал фундаментом для всех современных агентов.

## Проблема: Почему обычные LLM часто ошибаются?

### Галлюцинации и логические ошибки

Представьте, что вы спрашиваете GPT-3 или GPT-4:

> Какой город является столицей страны, где находится озеро Виктория?

Модель может ответить неправильно, потому что:

1. **Попыталась угадать** вместо того, чтобы разбить задачу на части
2. **Не имела актуальной информации** (особенно для новых фактов)
3. **Не могла проверить свой ответ** до того, как выдать его пользователю
4. **Сделала логический скачок** без промежуточных шагов

Традиционно разработчики пытались решить эту проблему с помощью **prompt engineering** — более сложные инструкции, few-shot примеры, цепочки мышления (Chain of Thought). Но это имело пределы.

### Ограничение Chain of Thought

**Chain of Thought (CoT)** — методика, где вы просто просите модель "думать пошагово". Например:

```
Q: Если в корзине 15 яблок, и я взял половину, потом вернул 3, сколько осталось?
A: Давайте разберёмся пошагово:
1. Начально: 15 яблок
2. Взял половину: 15 / 2 = 7.5, взял 7 яблок
3. Осталось: 15 - 7 = 8
4. Вернул 3: 8 + 3 = 11
Ответ: 11 яблок
```

CoT помогает, но у него есть критический недостаток: **модель не может получить информацию извне**. Если нужны свежие новости, данные из БД, результаты запроса — CoT бесполезен. Модель может только фантазировать.

## Решение: ReAct паттерн

### Основная идея

ReAct объединяет два мира:

1. **Reasoning (размышление)** — модель объясняет свой план, анализирует проблему, размышляет о каждом шаге
2. **Acting (действие)** — модель вызывает инструменты (API, функции, поиск) и получает реальные данные

Процесс чередуется циклично: **Подумать → Действовать → Наблюдать → Подумать → Действовать...**

### Визуальный поток

```
┌─────────────────────────────────────────────────────────┐
│ Пользователь: "Когда был запущен SpaceX Starship-2?"   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │ Thought: Мне нужна актуальная│
        │ информация. Поищу в интернете│
        └──────────────┬───────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │ Action: search("SpaceX       │
        │ Starship-2 launch")          │
        └──────────────┬───────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │ Observation: [результаты     │
        │ поиска с датами и фактами]   │
        └──────────────┬───────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │ Thought: На основе результатов│
        │ вижу дату. Ответ готов.      │
        └──────────────┬───────────────┘
                       │
                       ▼
  ┌──────────────────────────────────────┐
  │ Final Answer: SpaceX Starship-2 был  │
  │ запущен [дата из результатов]        │
  └──────────────────────────────────────┘
```

### Ключевые компоненты

**1. Thought (Мысль)**
- Модель объясняет, что она хочет сделать
- Анализирует текущую информацию
- Планирует следующий шаг

Пример:
```
Thought: Мне нужно узнать текущий курс доллара к рублю.
Я использую функцию для получения данных с финансового API.
```

**2. Action (Действие)**
- Вызов внешней функции или инструмента
- Синтаксис обычно структурирован (например, JSON или XML)

Пример:
```
Action: get_exchange_rate
Action Input: {"from": "USD", "to": "RUB"}
```

**3. Observation (Наблюдение)**
- Результат выполнения действия
- Новая информация для анализа

Пример:
```
Observation: {"USD_to_RUB": 95.42, "timestamp": "2024-01-15T10:30:00Z"}
```

Цикл повторяется до достижения финального ответа.

## Архитектура и реализация

### Классическая схема ReAct агента

```
┌─────────────────────────────────────────────────┐
│           LLM (Claude, GPT-4, etc.)             │
│  - Генерирует Thought, Action, Final Answer     │
└────────────────┬────────────────────────────────┘
                 │ (Prompting с примерами ReAct)
                 │
    ┌────────────┴─────────────┬──────────────┐
    │                          │              │
    ▼                          ▼              ▼
┌─────────────┐        ┌──────────────┐  ┌──────────┐
│  Parser     │        │ Tool Router  │  │ Memory   │
│ (выделяет  │        │(маршрутизирует│ │(история) │
│ Thought,   │        │действия)     │  └──────────┘
│ Action)    │        └──────┬───────┘
└──────┬─────┘               │
       │          ┌──────────┴──────────┬──────────┐
       │          ▼                     ▼          ▼
       │      ┌──────────┐         ┌──────────┐ ┌──────────┐
       │      │ Search   │         │Database  │ │Custom    │
       │      │ API      │         │Query     │ │Functions │
       │      └──────────┘         └──────────┘ └──────────┘
       │          │                     │          │
       └──────────┴─────────────────────┴──────────┘
                   │
                   ▼ (Observations)
             ┌──────────────┐
             │ Accumulator  │
             │(собирает     │
             │результаты)   │
             └──────┬───────┘
                    │
                    ▼
            (повторный prompt
             для LLM с новым
             наблюдением)
```

### Пример кода на Python

```python
from anthropic import Anthropic

client = Anthropic()

# Определяем доступные инструменты
TOOLS = {
    "search": lambda query: f"Results for '{query}': [mock data]",
    "calculator": lambda expr: f"Result: {eval(expr)}",
    "get_date": lambda: "2024-01-15",
}

def react_agent(user_query: str, max_iterations: int = 10) -> str:
    """
    ReAct агент: чередует размышление и действие
    """
    messages = []
    system_prompt = """You are a helpful assistant that uses the ReAct framework.
    
When responding, follow this format:
Thought: [your reasoning about what to do]
Action: [tool_name]
Action Input: [input_for_tool]

After each action, you'll receive an observation.
Continue this cycle until you can provide a Final Answer.

Available tools: search, calculator, get_date

When you have enough information, respond with:
Final Answer: [your answer]"""

    messages.append({"role": "user", "content": user_query})
    
    for iteration in range(max_iterations):
        # LLM генерирует мысль и действие
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1000,
            system=system_prompt,
            messages=messages
        )
        
        assistant_message = response.content[0].text
        messages.append({"role": "assistant", "content": assistant_message})
        
        # Проверяем, есть ли Final Answer
        if "Final Answer:" in assistant_message:
            return assistant_message.split("Final Answer:")[-1].strip()
        
        # Парсим Action и выполняем его
        if "Action:" in assistant_message:
            lines = assistant_message.split("\n")
            action = None
            action_input = None
            
            for i, line in enumerate(lines):
                if line.startswith("Action:"):
                    action = line.replace("Action:", "").strip()
                if line.startswith("Action Input:"):
                    action_input = line.replace("Action Input:", "").strip()
            
            if action and action in TOOLS:
                # Выполняем инструмент
                observation = TOOLS[action](action_input)
                messages.append({
                    "role": "user",
                    "content": f"Observation: {observation}"
                })
            else:
                messages.append({
                    "role": "user",
                    "content": "Observation: Tool not found or error occurred"
                })
    
    return "Max iterations reached"

# Использование
if __name__ == "__main__":
    result = react_agent("What is 25 * 4 and what's today's date?")
    print(result)
```

## Практические примеры

### Пример 1: Исследование финансовой информации

**Запрос:** "Какова была цена акции Apple в день, когда была запущена первая версия iPhone?"

**ReAct цикл:**

```
Thought: Мне нужно узнать две вещи:
1. Когда была запущена первая версия iPhone
2. Какова была цена акции Apple в тот день

Сначала найду дату первого iPhone.

Action: search
Action Input: "first iPhone launch date"

Observation: iPhone был запущен 29 июня 2007 года.

Thought: Теперь мне нужна цена акции Apple в июне 2007 года.

Action: get_stock_price
Action Input: {"ticker": "AAPL", "date": "2007-06-29"}

Observation: Цена закрытия Apple 29 июня 2007 была $119.87.

Final Answer: Цена акции Apple в день запуска первого iPhone 
(29 июня 2007) была $119.87 за акцию.
```

### Пример 2: Решение многошаговой логической задачи

**Запрос:** "У Алисы было 12 яблок. Она дала половину Бобу. Потом Боб дал трети своего Кэрол. Сколько яблок у каждого?"

```
Thought: Это задача на пошаговые вычисления. Давайте разберёмся:
- Исходно у Алисы 12 яблок
- Она дала половину Бобу
- Боб отдал треть того, что он получил, Кэрол

Буду использовать калькулятор для вычислений.

Action: calculator
Action Input: 12 / 2

Observation: 6

Thought: Алиса дала Бобу 6 яблок. 
Теперь:
- У Алисы: 12 - 6 = 6
- У Боба: 6

Боб даёт треть своих яблок Кэрол:

Action: calculator
Action Input: 6 / 3

Observation: 2

Thought: Боб даёт 2 яблока Кэрол.
Итог:
- У Алисы: 6
- У Боба: 6 - 2 = 4
- У Кэрол: 2

Final Answer: 
- Алиса имеет 6 яблок
- Боб имеет 4 яблока
- Кэрол имеет 2 яблока
```

## Почему ReAct работает лучше других подходов?

### 1. **Прозрачность рассуждений**

Вы видите *каждый шаг* мышления агента. Это важно для:
- Отладки (если что-то пошло не так, видно где)
- Доверия (пользователь понимает, почему был дан такой ответ)
- Обучения (можно улучшать стратегию агента)

### 2. **Возможность исправления курса**

Если агент ошибается на одном шаге, он может исправить себя на следующем:

```
Thought: Я думал, что нужно использовать search, но 
на самом деле у меня уже есть эта информация 
из Observation. Давайте продолжим.
```

### 3. **Комбинация внутренних и внешних знаний**

- Внутренние знания: всё, что модель знает из обучения
- Внешние знания: актуальные данные из API, БД, web

ReAct позволяет идеально комбинировать оба источника.

### 4. **Масштабируемость инструментов**

Можно добавлять новые инструменты без переобучения модели:

```python
TOOLS = {
    "search": search_function,
    "calculator": calc_function,
    "get_date": date_function,
    "send_email": email_function,  # новый инструмент
    "check_weather": weather_function,  # ещё один
    # ... и так далее
}
```

## Сравнение подходов

| Характеристика | Standard Prompt | Chain of Thought | ReAct |
|----------------|-----------------|------------------|-------|
| **Точность на простых задачах** | ~70% | ~75% | ~75% |
| **Точность на сложных задачах** | ~20% | ~50% | ~80%+ |
| **Может получить внешние данные** | ❌ | ❌ | ✅ |
| **Прозрачность мышления** | ❌ | ✅ | ✅ |
| **Может исправить ошибку** | ❌ | ❌ | ✅ |
| **Скорость выполнения** | Быстро | Быстро | Медленнее |
| **Стоимость (API вызовы)** | Дешево | Дешево | Дороже |

## Расширения и варианты ReAct

### 1. **Self-Refine ReAct**

Добавляется этап критики собственного ответа:

```
Thought → Action → Observation → Thought → Action →
Observation → Critique → Refined Action → Final Answer
```

### 2. **ReAct + Few-Shot Learning**

В system prompt добавляют примеры успешных ReAct цепочек:

```
Example 1:
Thought: [example thought]
Action: [example action]
Observation: [example observation]
Final Answer: [example answer]

Example 2:
...

Now, user query: [actual user query]
```

### 3. **Hierarchical ReAct**

Для сложных задач — несколько уровней агентов, каждый со своим набором инструментов:

```
Main Agent
├── Research Sub-Agent (поиск информации)
├── Analysis Sub-Agent (анализ данных)
└── Synthesis Sub-Agent (объединение результатов)
```

### 4. **ReAct с Memory**

Длительные диалоги требуют управления памятью:

```python
class ReActAgentWithMemory:
    def __init__(self):
        self.short_term_memory = []  # текущий диалог
        self.long_term_memory = []   # важные факты
    
    def process_thought(self, thought):
        # Анализируем, стоит ли сохранить мысль
        if self.is_important(thought):
            self.long_term_memory.append(thought)
```

## Ограничения ReAct

### 1. **Стоимость токенов**

Каждый цикл Thought → Action → Observation требует дополнительных вызовов API. Для очень дешевых инстансов это может быть дорого.

### 2. **Скорость выполнения**

Параллельные действия невозможны в классическом ReAct. Модель выполняет их последовательно, что может быть медленным.

**Решение:** Распределённые агенты или пакетные операции.

### 3. **Качество парсинга**

Модель должна генерировать структурированный вывод (Action, Action Input). Если парсер неправильный, цепочка рушится.

**Решение:** Использовать structured outputs (как в Claude API).

### 4. **Галлюцинации инструментов**

Модель может выдумать инструмент, которого не существует:

```
Action: magic_fix_everything
Action Input: {"problem": "всё"}
```

**Решение:** Строгая валидация доступных инструментов в промпте.

## Практические советы по реализации

### 1. **Чёткое описание инструментов**

```python
TOOL_DESCRIPTIONS = {
    "search": {
        "description": "Поиск информации в интернете",
        "parameters": {
            "query": "строка поиска (максимум 100 символов)"
        }
    },
    "calculator": {
        "description": "Математические вычисления",
        "parameters": {
            "expression": "математическое выражение (например, '2 + 2 * 3')"
        }
    }
}
```

### 2. **Чёткий формат вывода**

В system prompt явно указывайте формат:

```
Respond in this exact format:
Thought: [your reasoning]
Action: [one_of: search, calculator, get_date]
Action Input: [json_input]

When done:
Final Answer: [your answer]
```

### 3. **Обработка ошибок**

```python
def safe_tool_call(tool_name, tool_input):
    try:
        return TOOLS[tool_name](tool_input)
    except Exception as e:
        return f"Error: Tool '{tool_name}' failed: {str(e)}"
```

### 4. **Ограничение итераций**

```python
def react_agent(query, max_iterations=10):
    for i in range(max_iterations):
        # ... логика ...
        if should_stop():
            break
    
    if i == max_iterations - 1:
        return "Maximum iterations reached. Partial answer: ..."
```

### 5. **Логирование и отладка**

```python
def log_react_step(thought, action, observation):
    print(f"[Step {iteration}]")
    print(f"  Thought: {thought}")
    print(f"  Action: {action}")
    print(f"  Observation: {observation[:100]}...")  # первые 100 символов
```

## Интеграция с современными фреймворками

### LangChain

```python
from langchain.agents import initialize_agent, Tool
from langchain.agents import AgentType
from langchain.llms import OpenAI

tools = [
    Tool(name="Calculator", func=calculator, 
         description="useful for math questions"),
    Tool(name="Search", func=search,
         description="useful for current events")
]

agent = initialize_agent(
    tools,
    OpenAI(),
    agent=AgentType.REACT_DOCSTORE,  # ReAct паттерн
    verbose=True
)

agent.run("What is 25 * 4?")
```

### Claude SDK

```python
from anthropic import Anthropic

client = Anthropic()

tools = [
    {
        "name": "search",
        "description": "Search for information",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"}
            }
        }
    }
]

response = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    tools=tools,
    messages=[{"role": "user", "content": "What is today's date?"}]
)
```

## Будущее ReAct

### 1. **Мультимодальный ReAct**

Агенты будут работать не только с текстом, но и с изображениями:

```
Thought: Пользователь показал скриншот ошибки
Action: analyze_image
Action Input: image_data

Observation: На скриншоте видна ошибка "FileNotFoundError"
```

### 2. **Асинхронный ReAct**

Параллельное выполнение нескольких действий:

```
Action 1: search("weather")  ──┐
Action 2: calendar_check()   ──┼─→ (все выполняются параллельно)
Action 3: email_check()      ──┘

Observations: [результат 1, результат 2, результат 3]
```

### 3. **ReAct с обучением**

Агент запоминает удачные цепочки и повторно их использует:

```
if similar_query_in_memory():
    use_successful_chain_from_memory()
else:
    generate_new_chain()
```

## Заключение

ReAct — это не просто ещё один паттерн промптирования. Это фундаментальный сдвиг в том, как мы используем языковые модели. Вместо того чтобы просить модель "угадать" ответ, мы просим её *думать и действовать*, чередуя размышления с реальными действиями.

**Ключевые выводы:**

1. **ReAct объединяет силы LLM (знания) и инструментов (данные)**
2. **Прозрачность рассуждений делает агентов понятными и отлаживаемыми**
3. **Циклическая структура позволяет исправлять ошибки в процессе**
4. **Масштабируемость инструментов позволяет расширять возможности без переобучения**

Если вы разрабатываете любой агент, чат-бот или автоматизированную систему, ReAct должен быть в вашем арсенале.

## Дальнейшее чтение

- **Оригинальная работа:** [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629) (arXiv:2210.03629)
- **Документация проекта:**
  - [Агенты на основе LLM - полный обзор](Агенты%20на%20основе%20LLM.md) — общий обзор агентов и их архитектур
  - [Архитектура мультиагентных систем](Архитектура%20мультиагентных%20систем.md) — как ReAct используется в многоагентных системах
- **Похожие паттерны:**
  - [Chain of Thought Prompting](https://arxiv.org/abs/2201.11903) (arXiv:2201.11903)
  - [Tree of Thoughts](https://arxiv.org/abs/2305.10601) (arXiv:2305.10601)
  - [Self-Ask Prompting](https://arxiv.org/abs/2210.03350) (arXiv:2210.03350)
- **Практическая реализация:**
  - [LangChain Agents Documentation](https://python.langchain.com/docs/modules/agents/)
  - [Anthropic Claude API Tools Guide](https://docs.anthropic.com/)

---

**Автор:** AI Assistant  
**Последнее обновление:** 2024-01-15  
**Статус:** Опубликовано