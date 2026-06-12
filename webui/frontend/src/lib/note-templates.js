function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function isoDate(date = new Date()) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-');
}

function shortDate(date = new Date()) {
  return [
    padDatePart(date.getDate()),
    padDatePart(date.getMonth() + 1),
    String(date.getFullYear()).slice(-2),
  ].join('-');
}

function timeLabel(date = new Date()) {
  return `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function titleWithDate(prefix, date = new Date()) {
  return `${prefix} ${shortDate(date)}`;
}

function context(title, date = new Date()) {
  return {
    title: title || 'Untitled',
    date,
    isoDate: isoDate(date),
    shortDate: shortDate(date),
    time: timeLabel(date),
  };
}

export const noteTemplates = [
  {
    id: 'daily-note',
    group: 'Journal',
    title: 'Daily Note',
    description: 'Daily focus, quick log, tasks, gratitude, and links created today.',
    category: 'Daily',
    tags: ['daily', 'journal'],
    suggestedTitle: ({ date }) => titleWithDate('Daily', date),
    content: ({ isoDate, time }) => `# Daily Note

Date: ${isoDate}
Started: ${time}

## Focus
- 

## Tasks
- [ ] 

## Quick Log
- 

## Notes Created Today
- 

## Gratitude
- 

## Shutdown
- What moved forward:
- What needs attention tomorrow:
`,
  },
  {
    id: 'weekly-review',
    group: 'Journal',
    title: 'Weekly Review',
    description: 'Review outcomes, open loops, wins, lessons, and next week priorities.',
    category: 'Reviews',
    tags: ['weekly', 'review'],
    suggestedTitle: ({ date }) => titleWithDate('Weekly Review', date),
    content: ({ isoDate }) => `# Weekly Review

Week of ${isoDate}

## Wins
- 

## Shipped / Finished
- 

## Open Loops
- [ ] 

## Lessons
- 

## People To Follow Up With
- 

## Next Week Priorities
1. 
2. 
3. 
`,
  },
  {
    id: 'meeting-note',
    group: 'Work',
    title: 'Meeting Notes',
    description: 'Agenda, participants, decisions, notes, and action items with owners.',
    category: 'Meetings',
    tags: ['meeting'],
    suggestedTitle: ({ date }) => titleWithDate('Meeting', date),
    content: ({ title, isoDate, time }) => `# ${title}

Date: ${isoDate}
Time: ${time}
Project:
Participants:

## Agenda
- 

## Notes
- 

## Decisions
- 

## Action Items
- [ ] Task - Owner - Due

## Follow-up
- 
`,
  },
  {
    id: 'one-on-one',
    group: 'Work',
    title: '1:1 Meeting',
    description: 'A lightweight one-on-one template for context, agenda, feedback, and follow-ups.',
    category: 'People',
    tags: ['meeting', '1on1'],
    suggestedTitle: ({ date }) => titleWithDate('1:1', date),
    content: ({ isoDate }) => `# 1:1

Date: ${isoDate}
Person:
Context:

## Their Updates
- 

## My Updates
- 

## Questions
- 

## Feedback
- 

## Commitments
- [ ] 
`,
  },
  {
    id: 'project-brief',
    group: 'Work',
    title: 'Project Brief',
    description: 'Outcome, scope, stakeholders, milestones, risks, and success criteria.',
    category: 'Projects',
    tags: ['project'],
    suggestedTitle: () => 'Project Brief',
    content: ({ title, isoDate }) => `# ${title}

Created: ${isoDate}
Status: Draft
Owner:

## Outcome
What should be true when this project is done?

## Why Now
- 

## Scope
### In
- 

### Out
- 

## Stakeholders
- 

## Milestones
- [ ] 

## Risks
- 

## Success Criteria
- 

## Related Notes
- 
`,
  },
  {
    id: 'work-session',
    group: 'Work',
    title: 'Work Session',
    description: 'Focused work block with intention, constraints, log, outputs, and next step.',
    category: 'Work Sessions',
    tags: ['work-session'],
    suggestedTitle: ({ date }) => titleWithDate('Work Session', date),
    content: ({ isoDate, time }) => `# Work Session

Date: ${isoDate}
Started: ${time}
Project:

## Intention
- 

## Constraints
- 

## Session Log
- 

## Output
- 

## Next Step
- [ ] 
`,
  },
  {
    id: 'decision-record',
    group: 'Work',
    title: 'Decision Record',
    description: 'Capture context, options, decision, trade-offs, and revisit date.',
    category: 'Decisions',
    tags: ['decision', 'adr'],
    suggestedTitle: () => 'Decision - ',
    content: ({ title, isoDate }) => `# ${title}

Date: ${isoDate}
Status: Proposed
Owner:

## Context
- 

## Options Considered
1. 
2. 
3. 

## Decision
- 

## Consequences
### Positive
- 

### Negative / Trade-offs
- 

## Revisit
Date:
Signal:
`,
  },
  {
    id: 'research-note',
    group: 'Knowledge',
    title: 'Research Note',
    description: 'Research question, sources, evidence, synthesis, and confidence.',
    category: 'Research',
    tags: ['research'],
    suggestedTitle: () => 'Research - ',
    content: ({ title, isoDate }) => `# ${title}

Date: ${isoDate}
Question:
Confidence: Low / Medium / High

## Why This Matters
- 

## Sources
- 

## Evidence
- 

## Synthesis
- 

## Open Questions
- 

## Next Reading
- 
`,
  },
  {
    id: 'topic-moc',
    group: 'Knowledge',
    title: 'Topic / MOC',
    description: 'Map of content for a topic with entry points, key notes, and unanswered questions.',
    category: 'Maps',
    tags: ['moc', 'topic'],
    suggestedTitle: () => 'MOC - ',
    content: ({ title }) => `# ${title}

## Overview
- 

## Start Here
- 

## Key Notes
- 

## Related Topics
- [[ ]]

## Questions
- 

## Maintenance
- Last reviewed:
- What is missing:
`,
  },
  {
    id: 'zettel',
    group: 'Knowledge',
    title: 'Atomic Note / Zettel',
    description: 'One idea per note with context, claim, evidence, and links.',
    category: 'Zettelkasten',
    tags: ['zettel', 'idea'],
    suggestedTitle: () => 'Idea - ',
    content: ({ title }) => `# ${title}

## Idea
Write one clear idea in your own words.

## Context
- 

## Evidence / Example
- 

## Why It Matters
- 

## Links
- Supports:
- Contradicts:
- Related:
`,
  },
  {
    id: 'book-notes',
    group: 'Knowledge',
    title: 'Book Notes',
    description: 'Bibliographic info, thesis, chapter notes, quotes, and actions.',
    category: 'Books',
    tags: ['book', 'reading'],
    suggestedTitle: () => 'Book - ',
    content: ({ title }) => `# ${title}

Author:
Status: To Read / Reading / Finished
Started:
Finished:

## One-Sentence Summary
- 

## Core Thesis
- 

## Chapter Notes
- 

## Best Quotes
> 

## Ideas To Reuse
- 

## Actions
- [ ] 
`,
  },
  {
    id: 'article-review',
    group: 'Knowledge',
    title: 'Article / Paper Review',
    description: 'Structured capture for papers, essays, reports, and links from the web.',
    category: 'Reading',
    tags: ['article', 'paper'],
    suggestedTitle: () => 'Review - ',
    content: ({ title, isoDate }) => `# ${title}

Captured: ${isoDate}
Source:
Author:
URL:

## TL;DR
- 

## Key Claims
- 

## Evidence
- 

## Useful Details
- 

## My Take
- 

## Links
- 
`,
  },
  {
    id: 'person-note',
    group: 'People',
    title: 'Person',
    description: 'People CRM note: context, relationship, projects, promises, and follow-ups.',
    category: 'People',
    tags: ['person'],
    suggestedTitle: () => 'Person - ',
    content: ({ title }) => `# ${title}

Role:
Organization:
Contact:
Last Contact:

## Context
- 

## Projects / Topics
- 

## Preferences
- 

## Promises
- [ ] 

## Conversation Log
- 

## Follow-up
- [ ] 
`,
  },
  {
    id: 'learning-plan',
    group: 'Personal',
    title: 'Learning Plan',
    description: 'Define a skill, curriculum, practice loop, resources, and milestones.',
    category: 'Learning',
    tags: ['learning'],
    suggestedTitle: () => 'Learning Plan - ',
    content: ({ title }) => `# ${title}

Skill:
Why:
Target Level:

## Curriculum
1. 
2. 
3. 

## Practice Loop
- Frequency:
- Exercise:
- Feedback:

## Resources
- 

## Milestones
- [ ] 

## Notes
- 
`,
  },
  {
    id: 'postmortem',
    group: 'Work',
    title: 'Postmortem',
    description: 'Incident or project retro: impact, timeline, causes, actions, and prevention.',
    category: 'Reviews',
    tags: ['postmortem', 'retro'],
    suggestedTitle: () => 'Postmortem - ',
    content: ({ title, isoDate }) => `# ${title}

Date: ${isoDate}
Status:
Severity:

## Summary
- 

## Impact
- 

## Timeline
- 

## Root Causes
- 

## What Went Well
- 

## What Went Wrong
- 

## Action Items
- [ ] Owner - Action - Due
`,
  },
  {
    id: 'eisenhower-matrix',
    group: 'Planning',
    title: 'Eisenhower Matrix',
    description: 'Prioritize tasks by urgency and importance: do, schedule, delegate, eliminate.',
    category: 'Planning',
    tags: ['planning', 'priority'],
    suggestedTitle: ({ date }) => titleWithDate('Eisenhower', date),
    content: ({ title, isoDate }) => `# ${title}

Date: ${isoDate}

## Do Now
Urgent and important.
- [ ] 

## Schedule
Important, not urgent.
- [ ] Task - Date

## Delegate
Urgent, not important.
- [ ] Task - Person

## Eliminate
Neither urgent nor important.
- 

## Review Notes
- What should move to Schedule before it becomes urgent?
- What can be removed entirely?
`,
  },
  {
    id: 'gtd-clarify',
    group: 'Planning',
    title: 'GTD Clarify',
    description: 'Turn raw inbox items into next actions, projects, waiting-for, someday, or reference.',
    category: 'GTD',
    tags: ['gtd', 'inbox'],
    suggestedTitle: ({ date }) => titleWithDate('GTD Clarify', date),
    content: ({ isoDate }) => `# GTD Clarify

Date: ${isoDate}

## Inbox Items
- 

## Next Actions
- [ ] 

## Projects
- 

## Waiting For
- [ ] Item - Person - Since

## Someday / Maybe
- 

## Reference
- 
`,
  },
  {
    id: 'monthly-budget',
    group: 'Life',
    title: 'Monthly Budget',
    description: 'Simple monthly money plan for income, expenses, savings, and subscriptions.',
    category: 'Finance',
    tags: ['budget', 'finance'],
    suggestedTitle: ({ date }) => titleWithDate('Budget', date),
    content: ({ title, isoDate }) => `# ${title}

Month: ${isoDate.slice(0, 7)}

## Income
| Source | Amount | Notes |
| --- | ---: | --- |
|  |  |  |

## Fixed Expenses
| Category | Amount | Due | Paid |
| --- | ---: | --- | --- |
| Rent / Mortgage |  |  | [ ] |
| Utilities |  |  | [ ] |
| Subscriptions |  |  | [ ] |

## Variable Expenses
| Category | Planned | Actual |
| --- | ---: | ---: |
| Groceries |  |  |
| Transport |  |  |
| Health |  |  |

## Savings Goals
- [ ] Goal - Amount

## Month Notes
- 
`,
  },
  {
    id: 'subscription-tracker',
    group: 'Life',
    title: 'Subscription Tracker',
    description: 'Track recurring payments, renewal dates, value, and cancellation decisions.',
    category: 'Finance',
    tags: ['subscriptions', 'finance'],
    suggestedTitle: () => 'Subscriptions',
    content: ({ isoDate }) => `# Subscriptions

Updated: ${isoDate}

| Service | Cost | Period | Renewal | Keep? | Notes |
| --- | ---: | --- | --- | --- | --- |
|  |  | Monthly |  | [ ] |  |

## Review
- What did I forget I was paying for?
- What can be cancelled before renewal?
- What should be downgraded or shared?
`,
  },
  {
    id: 'meal-plan',
    group: 'Household',
    title: 'Meal Plan + Groceries',
    description: 'Plan meals, reuse ingredients, and build a shopping list for the week.',
    category: 'Food',
    tags: ['meal-plan', 'groceries'],
    suggestedTitle: ({ date }) => titleWithDate('Meal Plan', date),
    content: ({ isoDate }) => `# Meal Plan

Week of ${isoDate}

## Meals
| Day | Breakfast | Lunch | Dinner |
| --- | --- | --- | --- |
| Monday |  |  |  |
| Tuesday |  |  |  |
| Wednesday |  |  |  |
| Thursday |  |  |  |
| Friday |  |  |  |
| Weekend |  |  |  |

## Grocery List
### Produce
- [ ] 

### Protein
- [ ] 

### Pantry
- [ ] 

### Household
- [ ] 

## Prep
- [ ] 
`,
  },
  {
    id: 'recipe-card',
    group: 'Household',
    title: 'Recipe Card',
    description: 'A reusable recipe note with ingredients, steps, timing, and improvements.',
    category: 'Recipes',
    tags: ['recipe', 'food'],
    suggestedTitle: () => 'Recipe - ',
    content: ({ title }) => `# ${title}

Servings:
Prep time:
Cook time:

## Ingredients
- 

## Steps
1. 
2. 
3. 

## Notes
- What worked:
- What to change:

## Pairings
- 
`,
  },
  {
    id: 'travel-plan',
    group: 'Life',
    title: 'Travel Plan',
    description: 'Plan route, lodging, documents, budget, activities, and daily itinerary.',
    category: 'Travel',
    tags: ['travel', 'planning'],
    suggestedTitle: () => 'Trip - ',
    content: ({ title }) => `# ${title}

Destination:
Dates:
People:

## Essentials
- [ ] Tickets
- [ ] Accommodation
- [ ] Insurance
- [ ] Documents

## Budget
| Category | Estimate | Actual |
| --- | ---: | ---: |
| Transport |  |  |
| Stay |  |  |
| Food |  |  |
| Activities |  |  |

## Itinerary
### Day 1
- 

### Day 2
- 

## Ideas
- 
`,
  },
  {
    id: 'packing-list',
    group: 'Household',
    title: 'Packing List',
    description: 'Reusable trip packing checklist grouped by documents, clothes, tech, and health.',
    category: 'Travel',
    tags: ['packing', 'travel'],
    suggestedTitle: () => 'Packing List',
    content: () => `# Packing List

## Documents
- [ ] Passport / ID
- [ ] Tickets
- [ ] Insurance
- [ ] Reservations

## Clothes
- [ ] 

## Tech
- [ ] Phone charger
- [ ] Laptop charger
- [ ] Power bank

## Health
- [ ] Medication
- [ ] First aid

## Home Before Leaving
- [ ] Trash
- [ ] Plants
- [ ] Windows
- [ ] Keys
`,
  },
  {
    id: 'home-maintenance',
    group: 'Household',
    title: 'Home Maintenance',
    description: 'Track household maintenance, chores, repairs, warranties, and next dates.',
    category: 'Home',
    tags: ['home', 'maintenance'],
    suggestedTitle: ({ date }) => titleWithDate('Home Maintenance', date),
    content: ({ isoDate }) => `# Home Maintenance

Updated: ${isoDate}

## This Week
- [ ] 

## Repairs
| Item | Problem | Next step | Owner |
| --- | --- | --- | --- |
|  |  |  |  |

## Recurring Maintenance
| Task | Frequency | Last done | Next |
| --- | --- | --- | --- |
| Filters | Monthly |  |  |
| Deep clean | Monthly |  |  |

## Purchases Needed
- [ ] 

## Notes
- 
`,
  },
  {
    id: 'health-log',
    group: 'Life',
    title: 'Health Log',
    description: 'Daily health snapshot for sleep, energy, symptoms, movement, and notes.',
    category: 'Health',
    tags: ['health', 'log'],
    suggestedTitle: ({ date }) => titleWithDate('Health', date),
    content: ({ isoDate }) => `# Health Log

Date: ${isoDate}

## Snapshot
- Sleep:
- Energy:
- Mood:
- Stress:

## Movement
- 

## Food / Water
- 

## Symptoms
- 

## Medication / Supplements
- [ ] 

## Notes for Doctor / Future Me
- 
`,
  },
  {
    id: 'habit-tracker',
    group: 'Life',
    title: 'Habit Tracker',
    description: 'Simple weekly habit checklist with reflection and adjustment prompts.',
    category: 'Habits',
    tags: ['habits', 'weekly'],
    suggestedTitle: ({ date }) => titleWithDate('Habits', date),
    content: ({ isoDate }) => `# Habit Tracker

Week of ${isoDate}

| Habit | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |

## What helped?
- 

## What got in the way?
- 

## Next adjustment
- 
`,
  },
  {
    id: 'shopping-wishlist',
    group: 'Household',
    title: 'Shopping Wishlist',
    description: 'Capture wants before buying: need, budget, alternatives, and wait-until date.',
    category: 'Shopping',
    tags: ['shopping', 'wishlist'],
    suggestedTitle: () => 'Wishlist',
    content: () => `# Shopping Wishlist

| Item | Why | Price | Priority | Wait until |
| --- | --- | ---: | --- | --- |
|  |  |  | Low / Medium / High |  |

## Before Buying
- Do I already own something that solves this?
- Can I borrow, repair, or buy used?
- What happens if I wait 30 days?

## Approved Purchases
- [ ] 
`,
  },
  {
    id: 'home-dashboard',
    group: 'System',
    title: 'Personal Dashboard',
    description: 'A lightweight hub for priorities, active projects, waiting-for, and important links.',
    category: 'Home',
    tags: ['dashboard'],
    suggestedTitle: () => 'Home Dashboard',
    content: ({ isoDate }) => `# Home Dashboard

Updated: ${isoDate}

## Now
- 

## Active Projects
- [[ ]]

## Waiting For
- [ ] 

## Important Links
- [[ ]]

## Areas To Review
- 

## Inbox
- 
`,
  },
];

const approachDefinitions = {
  planning: {
    title: 'Planning Systems',
    description: 'GTD, Eisenhower, periodic reviews, and lightweight execution rituals.',
  },
  knowledge: {
    title: 'Knowledge Work',
    description: 'Zettelkasten, MOC, Cornell-style capture, reading, and research notes.',
  },
  work: {
    title: 'Workflows',
    description: 'Meetings, projects, decisions, postmortems, and focused work sessions.',
  },
  life: {
    title: 'Life OS',
    description: 'Personal planning across health, money, habits, travel, and goals.',
  },
  household: {
    title: 'Household',
    description: 'Everyday home notes for meals, groceries, packing, maintenance, and purchases.',
  },
  system: {
    title: 'System Hubs',
    description: 'Dashboards and home notes that connect the rest of the workspace.',
  },
};

const ruApproachDefinitions = {
  planning: {
    title: 'Системы планирования',
    description: 'GTD, матрица Эйзенхауэра, периодические обзоры и лёгкие ритуалы исполнения.',
  },
  knowledge: {
    title: 'Работа со знаниями',
    description: 'Zettelkasten, MOC, Cornell-подход, чтение и исследовательские заметки.',
  },
  work: {
    title: 'Рабочие процессы',
    description: 'Встречи, проекты, решения, постмортемы и фокусированные рабочие сессии.',
  },
  life: {
    title: 'Life OS',
    description: 'Личное планирование: здоровье, деньги, привычки, поездки и цели.',
  },
  household: {
    title: 'Быт',
    description: 'Повседневные домашние заметки: еда, покупки, поездки, обслуживание и дела.',
  },
  system: {
    title: 'Системные хабы',
    description: 'Дашборды и домашние заметки, связывающие рабочее пространство.',
  },
};

const templateApproaches = {
  'daily-note': 'planning',
  'weekly-review': 'planning',
  'eisenhower-matrix': 'planning',
  'gtd-clarify': 'planning',
  'meeting-note': 'work',
  'one-on-one': 'work',
  'project-brief': 'work',
  'work-session': 'work',
  'decision-record': 'work',
  postmortem: 'work',
  'research-note': 'knowledge',
  'topic-moc': 'knowledge',
  zettel: 'knowledge',
  'book-notes': 'knowledge',
  'article-review': 'knowledge',
  'person-note': 'life',
  'learning-plan': 'life',
  'monthly-budget': 'life',
  'subscription-tracker': 'life',
  'travel-plan': 'life',
  'health-log': 'life',
  'habit-tracker': 'life',
  'meal-plan': 'household',
  'recipe-card': 'household',
  'packing-list': 'household',
  'home-maintenance': 'household',
  'shopping-wishlist': 'household',
  'home-dashboard': 'system',
};

const ruTemplateTranslations = {
  'daily-note': {
    group: 'Журнал',
    title: 'Дневная заметка',
    description: 'Фокус дня, быстрый журнал, задачи, благодарность и заметки, созданные сегодня.',
    category: 'Дневник',
    suggestedTitle: ({ date }) => titleWithDate('День', date),
    content: ({ isoDate, time }) => `# Дневная заметка

Дата: ${isoDate}
Начато: ${time}

## Фокус
- 

## Задачи
- [ ] 

## Быстрый журнал
- 

## Заметки, созданные сегодня
- 

## Благодарность
- 

## Завершение дня
- Что продвинулось:
- Что требует внимания завтра:
`,
  },
  'weekly-review': {
    group: 'Журнал',
    title: 'Еженедельный обзор',
    description: 'Итоги, открытые вопросы, победы, уроки и приоритеты следующей недели.',
    category: 'Обзоры',
    suggestedTitle: ({ date }) => titleWithDate('Еженедельный обзор', date),
    content: ({ isoDate }) => `# Еженедельный обзор

Неделя от ${isoDate}

## Победы
- 

## Завершено
- 

## Открытые вопросы
- [ ] 

## Уроки
- 

## Люди, с кем нужно связаться
- 

## Приоритеты следующей недели
1. 
2. 
3. 
`,
  },
  'meeting-note': {
    group: 'Работа',
    title: 'Заметка встречи',
    description: 'Повестка, участники, решения, заметки и задачи с ответственными.',
    category: 'Встречи',
    suggestedTitle: ({ date }) => titleWithDate('Встреча', date),
    content: ({ title, isoDate, time }) => `# ${title}

Дата: ${isoDate}
Время: ${time}
Проект:
Участники:

## Повестка
- 

## Заметки
- 

## Решения
- 

## Действия
- [ ] Задача - Ответственный - Срок

## Продолжение
- 
`,
  },
  'one-on-one': {
    group: 'Работа',
    title: 'Встреча 1:1',
    description: 'Лёгкий шаблон для контекста, повестки, обратной связи и договорённостей.',
    category: 'Люди',
    suggestedTitle: ({ date }) => titleWithDate('1:1', date),
    content: ({ isoDate }) => `# 1:1

Дата: ${isoDate}
Человек:
Контекст:

## Обновления собеседника
- 

## Мои обновления
- 

## Вопросы
- 

## Обратная связь
- 

## Договорённости
- [ ] 
`,
  },
  'project-brief': {
    group: 'Работа',
    title: 'Бриф проекта',
    description: 'Результат, рамки, участники, этапы, риски и критерии успеха.',
    category: 'Проекты',
    suggestedTitle: () => 'Бриф проекта',
    content: ({ title, isoDate }) => `# ${title}

Создано: ${isoDate}
Статус: Черновик
Владелец:

## Результат
Что должно стать правдой после завершения проекта?

## Почему сейчас
- 

## Рамки
### Входит
- 

### Не входит
- 

## Участники
- 

## Этапы
- [ ] 

## Риски
- 

## Критерии успеха
- 

## Связанные заметки
- 
`,
  },
  'work-session': {
    group: 'Работа',
    title: 'Рабочая сессия',
    description: 'Фокусированный рабочий блок с намерением, ограничениями, журналом и следующим шагом.',
    category: 'Рабочие сессии',
    suggestedTitle: ({ date }) => titleWithDate('Рабочая сессия', date),
    content: ({ isoDate, time }) => `# Рабочая сессия

Дата: ${isoDate}
Начато: ${time}
Проект:

## Намерение
- 

## Ограничения
- 

## Журнал сессии
- 

## Результат
- 

## Следующий шаг
- [ ] 
`,
  },
  'decision-record': {
    group: 'Работа',
    title: 'Запись решения',
    description: 'Контекст, варианты, решение, компромиссы и дата пересмотра.',
    category: 'Решения',
    suggestedTitle: () => 'Решение - ',
    content: ({ title, isoDate }) => `# ${title}

Дата: ${isoDate}
Статус: Предложено
Владелец:

## Контекст
- 

## Рассмотренные варианты
1. 
2. 
3. 

## Решение
- 

## Последствия
### Плюсы
- 

### Минусы / компромиссы
- 

## Пересмотр
Дата:
Сигнал:
`,
  },
  'research-note': {
    group: 'Знания',
    title: 'Исследовательская заметка',
    description: 'Вопрос исследования, источники, факты, выводы и уровень уверенности.',
    category: 'Исследования',
    suggestedTitle: () => 'Исследование - ',
    content: ({ title, isoDate }) => `# ${title}

Дата: ${isoDate}
Вопрос:
Уверенность: Низкая / Средняя / Высокая

## Почему это важно
- 

## Источники
- 

## Факты
- 

## Выводы
- 

## Открытые вопросы
- 

## Что читать дальше
- 
`,
  },
  'topic-moc': {
    group: 'Знания',
    title: 'Тема / MOC',
    description: 'Карта содержания по теме: точки входа, ключевые заметки и открытые вопросы.',
    category: 'Карты',
    suggestedTitle: () => 'MOC - ',
    content: ({ title }) => `# ${title}

## Обзор
- 

## Начать здесь
- 

## Ключевые заметки
- 

## Связанные темы
- [[ ]]

## Вопросы
- 

## Обслуживание
- Последний обзор:
- Чего не хватает:
`,
  },
  zettel: {
    group: 'Знания',
    title: 'Атомарная заметка / Zettel',
    description: 'Одна идея на заметку: контекст, тезис, доказательства и связи.',
    category: 'Зеттелькастен',
    suggestedTitle: () => 'Идея - ',
    content: ({ title }) => `# ${title}

## Идея
Сформулируйте одну ясную мысль своими словами.

## Контекст
- 

## Доказательство / пример
- 

## Почему это важно
- 

## Связи
- Поддерживает:
- Противоречит:
- Связано:
`,
  },
  'book-notes': {
    group: 'Знания',
    title: 'Заметки по книге',
    description: 'Библиография, тезис, заметки по главам, цитаты и действия.',
    category: 'Книги',
    suggestedTitle: () => 'Книга - ',
    content: ({ title }) => `# ${title}

Автор:
Статус: Хочу прочитать / Читаю / Прочитано
Начато:
Завершено:

## Краткое резюме
- 

## Главный тезис
- 

## Заметки по главам
- 

## Лучшие цитаты
> 

## Идеи для применения
- 

## Действия
- [ ] 
`,
  },
  'article-review': {
    group: 'Знания',
    title: 'Обзор статьи / работы',
    description: 'Структура для статей, эссе, отчётов и ссылок из интернета.',
    category: 'Чтение',
    suggestedTitle: () => 'Обзор - ',
    content: ({ title, isoDate }) => `# ${title}

Сохранено: ${isoDate}
Источник:
Автор:
URL:

## Кратко
- 

## Ключевые тезисы
- 

## Доказательства
- 

## Полезные детали
- 

## Моя оценка
- 

## Связи
- 
`,
  },
  'person-note': {
    group: 'Люди',
    title: 'Человек',
    description: 'Личная CRM-заметка: контекст, отношения, проекты, обещания и follow-up.',
    category: 'Люди',
    suggestedTitle: () => 'Человек - ',
    content: ({ title }) => `# ${title}

Роль:
Организация:
Контакт:
Последний контакт:

## Контекст
- 

## Проекты / темы
- 

## Предпочтения
- 

## Обещания
- [ ] 

## Журнал разговоров
- 

## Follow-up
- [ ] 
`,
  },
  'learning-plan': {
    group: 'Личное',
    title: 'План обучения',
    description: 'Определите навык, программу, практику, ресурсы и этапы.',
    category: 'Обучение',
    suggestedTitle: () => 'План обучения - ',
    content: ({ title }) => `# ${title}

Навык:
Зачем:
Целевой уровень:

## Программа
1. 
2. 
3. 

## Практика
- Частота:
- Упражнение:
- Обратная связь:

## Ресурсы
- 

## Этапы
- [ ] 

## Заметки
- 
`,
  },
  postmortem: {
    group: 'Работа',
    title: 'Постмортем',
    description: 'Разбор инцидента или проекта: влияние, таймлайн, причины, действия и профилактика.',
    category: 'Обзоры',
    suggestedTitle: () => 'Постмортем - ',
    content: ({ title, isoDate }) => `# ${title}

Дата: ${isoDate}
Статус:
Критичность:

## Резюме
- 

## Влияние
- 

## Таймлайн
- 

## Корневые причины
- 

## Что сработало хорошо
- 

## Что пошло не так
- 

## Действия
- [ ] Ответственный - Действие - Срок
`,
  },
  'eisenhower-matrix': {
    group: 'Планирование',
    title: 'Матрица Эйзенхауэра',
    description: 'Приоритизация задач по срочности и важности: сделать, запланировать, делегировать, убрать.',
    category: 'Планирование',
    suggestedTitle: ({ date }) => titleWithDate('Эйзенхауэр', date),
    content: ({ title, isoDate }) => `# ${title}

Дата: ${isoDate}

## Сделать сейчас
Срочно и важно.
- [ ] 

## Запланировать
Важно, но не срочно.
- [ ] Задача - Дата

## Делегировать
Срочно, но не важно.
- [ ] Задача - Человек

## Убрать
Не срочно и не важно.
- 

## Заметки обзора
- Что стоит запланировать, пока это не стало срочным?
- Что можно полностью удалить?
`,
  },
  'gtd-clarify': {
    group: 'Планирование',
    title: 'GTD-разбор входящих',
    description: 'Превратить сырой inbox в следующие действия, проекты, ожидания, someday или справку.',
    category: 'GTD',
    suggestedTitle: ({ date }) => titleWithDate('GTD-разбор', date),
    content: ({ isoDate }) => `# GTD-разбор входящих

Дата: ${isoDate}

## Входящие
- 

## Следующие действия
- [ ] 

## Проекты
- 

## Ожидаю
- [ ] Что - От кого - С какого дня

## Когда-нибудь / возможно
- 

## Справка
- 
`,
  },
  'monthly-budget': {
    group: 'Личное',
    title: 'Месячный бюджет',
    description: 'Простой финансовый план месяца: доходы, расходы, накопления и подписки.',
    category: 'Финансы',
    suggestedTitle: ({ date }) => titleWithDate('Бюджет', date),
    content: ({ title, isoDate }) => `# ${title}

Месяц: ${isoDate.slice(0, 7)}

## Доходы
| Источник | Сумма | Заметки |
| --- | ---: | --- |
|  |  |  |

## Постоянные расходы
| Категория | Сумма | Дата | Оплачено |
| --- | ---: | --- | --- |
| Жильё |  |  | [ ] |
| Коммунальные |  |  | [ ] |
| Подписки |  |  | [ ] |

## Переменные расходы
| Категория | План | Факт |
| --- | ---: | ---: |
| Продукты |  |  |
| Транспорт |  |  |
| Здоровье |  |  |

## Цели накоплений
- [ ] Цель - Сумма

## Заметки месяца
- 
`,
  },
  'subscription-tracker': {
    group: 'Личное',
    title: 'Трекер подписок',
    description: 'Повторяющиеся платежи, даты продления, польза и решения об отмене.',
    category: 'Финансы',
    suggestedTitle: () => 'Подписки',
    content: ({ isoDate }) => `# Подписки

Обновлено: ${isoDate}

| Сервис | Цена | Период | Продление | Оставить? | Заметки |
| --- | ---: | --- | --- | --- | --- |
|  |  | Месяц |  | [ ] |  |

## Обзор
- За что я забыл, что плачу?
- Что можно отменить до продления?
- Что можно понизить или разделить?
`,
  },
  'meal-plan': {
    group: 'Быт',
    title: 'План питания + покупки',
    description: 'План еды на неделю, повторное использование ингредиентов и список покупок.',
    category: 'Еда',
    suggestedTitle: ({ date }) => titleWithDate('Питание', date),
    content: ({ isoDate }) => `# План питания

Неделя от ${isoDate}

## Еда
| День | Завтрак | Обед | Ужин |
| --- | --- | --- | --- |
| Понедельник |  |  |  |
| Вторник |  |  |  |
| Среда |  |  |  |
| Четверг |  |  |  |
| Пятница |  |  |  |
| Выходные |  |  |  |

## Список покупок
### Овощи и фрукты
- [ ] 

### Белок
- [ ] 

### Бакалея
- [ ] 

### Для дома
- [ ] 

## Заготовки
- [ ] 
`,
  },
  'recipe-card': {
    group: 'Быт',
    title: 'Карточка рецепта',
    description: 'Переиспользуемый рецепт с ингредиентами, шагами, временем и улучшениями.',
    category: 'Рецепты',
    suggestedTitle: () => 'Рецепт - ',
    content: ({ title }) => `# ${title}

Порции:
Подготовка:
Готовка:

## Ингредиенты
- 

## Шаги
1. 
2. 
3. 

## Заметки
- Что получилось:
- Что изменить:

## С чем сочетать
- 
`,
  },
  'travel-plan': {
    group: 'Личное',
    title: 'План поездки',
    description: 'Маршрут, жильё, документы, бюджет, активности и расписание по дням.',
    category: 'Поездки',
    suggestedTitle: () => 'Поездка - ',
    content: ({ title }) => `# ${title}

Куда:
Даты:
Кто едет:

## Главное
- [ ] Билеты
- [ ] Жильё
- [ ] Страховка
- [ ] Документы

## Бюджет
| Категория | План | Факт |
| --- | ---: | ---: |
| Транспорт |  |  |
| Жильё |  |  |
| Еда |  |  |
| Активности |  |  |

## Маршрут
### День 1
- 

### День 2
- 

## Идеи
- 
`,
  },
  'packing-list': {
    group: 'Быт',
    title: 'Список вещей',
    description: 'Переиспользуемый чеклист для поездки: документы, одежда, техника и здоровье.',
    category: 'Поездки',
    suggestedTitle: () => 'Список вещей',
    content: () => `# Список вещей

## Документы
- [ ] Паспорт / ID
- [ ] Билеты
- [ ] Страховка
- [ ] Брони

## Одежда
- [ ] 

## Техника
- [ ] Зарядка телефона
- [ ] Зарядка ноутбука
- [ ] Пауэрбанк

## Здоровье
- [ ] Лекарства
- [ ] Аптечка

## Дом перед отъездом
- [ ] Мусор
- [ ] Растения
- [ ] Окна
- [ ] Ключи
`,
  },
  'home-maintenance': {
    group: 'Быт',
    title: 'Обслуживание дома',
    description: 'Домашние задачи, ремонт, гарантии, покупки и следующие даты.',
    category: 'Дом',
    suggestedTitle: ({ date }) => titleWithDate('Дом', date),
    content: ({ isoDate }) => `# Обслуживание дома

Обновлено: ${isoDate}

## На этой неделе
- [ ] 

## Ремонт
| Что | Проблема | Следующий шаг | Ответственный |
| --- | --- | --- | --- |
|  |  |  |  |

## Регулярное обслуживание
| Задача | Частота | Последний раз | Следующий |
| --- | --- | --- | --- |
| Фильтры | Ежемесячно |  |  |
| Генеральная уборка | Ежемесячно |  |  |

## Что купить
- [ ] 

## Заметки
- 
`,
  },
  'health-log': {
    group: 'Личное',
    title: 'Журнал здоровья',
    description: 'Ежедневный снимок: сон, энергия, симптомы, движение и заметки.',
    category: 'Здоровье',
    suggestedTitle: ({ date }) => titleWithDate('Здоровье', date),
    content: ({ isoDate }) => `# Журнал здоровья

Дата: ${isoDate}

## Снимок дня
- Сон:
- Энергия:
- Настроение:
- Стресс:

## Движение
- 

## Еда / вода
- 

## Симптомы
- 

## Лекарства / добавки
- [ ] 

## Заметки для врача / будущего себя
- 
`,
  },
  'habit-tracker': {
    group: 'Личное',
    title: 'Трекер привычек',
    description: 'Простой недельный чеклист привычек с рефлексией и корректировкой.',
    category: 'Привычки',
    suggestedTitle: ({ date }) => titleWithDate('Привычки', date),
    content: ({ isoDate }) => `# Трекер привычек

Неделя от ${isoDate}

| Привычка | Пн | Вт | Ср | Чт | Пт | Сб | Вс |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |

## Что помогло?
- 

## Что мешало?
- 

## Следующая корректировка
- 
`,
  },
  'shopping-wishlist': {
    group: 'Быт',
    title: 'Вишлист покупок',
    description: 'Сохраняйте желания до покупки: зачем, бюджет, альтернативы и дата ожидания.',
    category: 'Покупки',
    suggestedTitle: () => 'Вишлист',
    content: () => `# Вишлист покупок

| Вещь | Зачем | Цена | Приоритет | Подождать до |
| --- | --- | ---: | --- | --- |
|  |  |  | Низкий / Средний / Высокий |  |

## Перед покупкой
- У меня уже есть что-то, что решает эту задачу?
- Можно одолжить, починить или купить б/у?
- Что будет, если подождать 30 дней?

## Одобренные покупки
- [ ] 
`,
  },
  'home-dashboard': {
    group: 'Система',
    title: 'Личный дашборд',
    description: 'Лёгкий хаб для приоритетов, активных проектов, ожиданий и важных ссылок.',
    category: 'Главная',
    suggestedTitle: () => 'Личный дашборд',
    content: ({ isoDate }) => `# Личный дашборд

Обновлено: ${isoDate}

## Сейчас
- 

## Активные проекты
- [[ ]]

## Ожидаю
- [ ] 

## Важные ссылки
- [[ ]]

## Области для обзора
- 

## Входящие
- 
`,
  },
};

export function localizeTemplate(template, currentLocale = 'en') {
  const approach = templateApproaches[template.id] || 'system';
  const approachText = currentLocale === 'ru'
    ? ruApproachDefinitions[approach]
    : approachDefinitions[approach];
  const base = {
    ...template,
    approach,
    approachTitle: approachText?.title || approach,
    approachDescription: approachText?.description || '',
  };
  if (currentLocale !== 'ru') return base;
  const translation = ruTemplateTranslations[template.id];
  return translation ? { ...base, ...translation } : base;
}

export function getLocalizedTemplates(currentLocale = 'en') {
  return noteTemplates.map((template) => localizeTemplate(template, currentLocale));
}

export function getTemplateById(id, currentLocale = 'en') {
  const templates = getLocalizedTemplates(currentLocale);
  return templates.find((template) => template.id === id) || templates[0];
}

export function getTemplateContext(title, date = new Date()) {
  return context(title, date);
}

export function buildTemplateContent(template, title, date = new Date()) {
  const ctx = context(title, date);
  return template.content(ctx).trimStart();
}
