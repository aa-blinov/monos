/**
 * The Help's text: how to use Monos, section by section, ending with a FAQ. Each section and topic has the same
 * id in both languages, so a link or a search result points at the same place whichever language is on.
 * Bodies are Markdown, rendered by the same preview as notes. "⌘" reads as Ctrl on Windows and Linux.
 */

const ru = [
  {
    id: 'start',
    title: 'Начало',
    summary: 'Monos — заметки в обычных файлах Markdown на вашем компьютере. Без аккаунта и сервера: синхронизация между устройствами идёт через ваш приватный репозиторий GitHub.',
    items: [
      { id: 'first-note', title: 'Первая заметка', body: 'Пока заметок нет, на доске экран «С чего начать»: начать писать, открыть папку с заметками или подключить синхронизацию.\n\nНажмите **⌘N** или карточку «Новая заметка» на доске. Можно начать с пустой заметки, с **заметки на сегодня** (название — дата, лежит в папке «Ежедневник») или с шаблона.\n\nСохранять не нужно: заметка сохраняется сама, пока вы пишете. **⌘S** сохраняет сразу.' },
      { id: 'where-files', title: 'Где лежат файлы', body: 'Каждая заметка — файл `.md`, папки в боковой панели — настоящие папки на диске. Их можно открыть любым редактором, а в **Настройки → Папка заметок** выбрать существующую папку, например хранилище Obsidian.\n\nСлужебные файлы Monos (шаблоны, сохранённые поиски, история правок агента) лежат в скрытой папке `.monos` рядом с заметками.' },
      { id: 'layout', title: 'Как устроено окно', body: '- **Слева** — боковая панель: закреплённые, недавние и дерево папок, а внизу — «Ещё» (таблица заметок, теги, сохранённые поиски, шаблоны), терминал, корзина, справка, синхронизация и настройки. **⌘B** прячет её.\n- **В центре** — доска со всеми заметками или открытая заметка.\n- **Внизу** — терминал для агента (только в приложении для компьютера), **⌘J**.\n- **⌘K** — палитра команд: любое действие и любая заметка по названию.' },
      { id: 'device-name', title: 'Имя устройства', body: 'Имя этого компьютера видно в истории правок и в конфликтах: «на MacBook» и «на рабочем ПК» понятнее, чем «здесь» и «там». Оно нужно только для синхронизации, поэтому задаётся при подключении GitHub: **Настройки → Подключение GitHub → Имя устройства**. Там уже подставлено системное имя компьютера.' },
    ],
  },
  {
    id: 'writing',
    title: 'Редактор',
    summary: 'Пишите как в документе — Monos хранит текст в Markdown. Разметку можно набирать прямо в тексте.',
    items: [
      { id: 'formatting', title: 'Оформление и меню «/»', body: 'Наберите **/** в начале строки — откроется меню блоков: заголовки, списки, чек-лист, цитата, блок кода, таблица, разделитель. ↑↓ выбирают, Enter вставляет, Esc закрывает.\n\nТо же работает разметкой: `#` и `##` — заголовки, `-` — список, `1.` — нумерованный, `[ ]` — задача, `>` — цитата, ```` ``` ```` — код, `---` — разделитель.\n\n**⌘B** — жирный, **⌘I** — курсив, **⌘E** — код в строке, **⌘Z** / **⌘⇧Z** — отменить и вернуть.' },
      { id: 'tasks', title: 'Задачи и срок', body: 'Строки `- [ ]` — задачи, отметка ставится кликом. В шапке заметки видно «X из Y задач».\n\nСрок задаётся в поле «Срок»: `2026-12-24`, `24.12.2026` или `24.12.26`, кнопки «Сегодня», «Завтра», «Через неделю» или календарь. В файле он хранится как `due: 2026-12-24`.' },
      { id: 'links', title: 'Ссылки между заметками', body: 'Наберите `[[` — появятся подсказки по названиям. Формы: `[[Заметка]]`, `[[Заметка|подпись]]`, `[[Заметка#Заголовок]]`, `[[Папка/Заметка]]`.\n\n**⌘-клик** или **⌘Enter** открывает ссылку. Ссылка на несуществующую заметку предложит её создать. Внизу заметки — «Связанные заметки» (кто ссылается сюда), упоминания без ссылки с кнопкой «Связать» и маленький граф.\n\nДругие названия заметки задаются в свойстве `aliases`, по ним ссылки тоже находят её. При переименовании заметки ссылки на неё обновляются сами.' },
      { id: 'embeds', title: 'Вставки, картинки и PDF', body: 'Картинку можно вставить из буфера или перетащить. Monos сожмёт её в WebP и положит в папку `_attachments` рядом с заметкой. Клик по картинке — переименовать (ссылки обновятся).\n\n`![[Заметка]]` встраивает другую заметку для чтения, `![[файл.pdf]]` показывает PDF.' },
      { id: 'callouts', title: 'Выноски', body: 'Цитата с типом становится цветной выноской, как в Obsidian:\n\n```\n> [!tip] Совет\n> Текст выноски\n```\n\nЗелёные — `tip`, `success`, `done`; жёлтые — `warning`, `caution`; красные — `danger`, `error`, `bug`. `[!tip]-` делает выноску свёрнутой.' },
      { id: 'properties', title: 'Свойства', body: 'Свойства — поля в начале файла: статус, приоритет, дата, флажок, список. Панель «Свойства» в заметке добавляет и меняет их; тип угадывается по значению.\n\nВсе свойства всех заметок видны в **Ещё → Таблица заметок**: колонки, сортировка и фильтр, например `prop:status=done`.' },
      { id: 'tools', title: 'Фокус, оглавление, история, экспорт', body: '- **Режим фокуса** убирает всё, кроме текста; Esc возвращает.\n- **Оглавление** — список заголовков для перехода.\n- **Markdown / визуальный редактор** — переключатель вида.\n- **История** — прошлые версии из GitHub: разница с текущей и «Восстановить эту версию». Появляется, когда подключена синхронизация.\n- **Ещё → Экспорт** внизу заметки: Markdown, HTML, текст, PDF. Рядом — печать.' },
      { id: 'lock', title: 'Пароль на заметку', body: 'В меню заметки — «Защита паролем…». Текст шифруется (AES-256), в файле и в GitHub остаётся только шифр. Пароль спрашивается один раз за сеанс.\n\n**Восстановить забытый пароль нельзя.** Закрытые заметки не попадают в поиск и в публикацию.' },
    ],
  },
  {
    id: 'organize',
    title: 'Порядок',
    summary: 'Папки, закрепление, цвета, теги и шаблоны — чтобы нужное было под рукой.',
    items: [
      { id: 'board', title: 'Доска', body: 'Доска показывает все заметки карточками: закреплённые первыми, дальше — недавно изменённые. Сверху выбирается число колонок и группировка по цвету.\n\nПравый клик по карточке: открыть, показать в дереве, скопировать путь, выбрать цвет. Цвет хранится только на этом компьютере.' },
      { id: 'tree', title: 'Папки и дерево', body: 'Правый клик в дереве (или Shift+F10): новая заметка, новая папка, закрепить, иконка и цвет, переименовать, дублировать, удалить, добавить тег.\n\nПеретаскивайте заметки в папки или в корень. **⌘-клик** выделяет несколько заметок — их можно перенести, пометить тегом или удалить вместе.' },
      { id: 'pin', title: 'Закрепление', body: 'Закреплённые заметки стоят первыми на доске и в своём разделе боковой панели. Закрепление записывается в файл (`pinned: true`), поэтому одинаково на всех устройствах.' },
      { id: 'tags', title: 'Теги', body: 'Теги добавляются в поле под заголовком заметки: Enter или запятая. Backspace в пустом поле убирает последний.\n\n**Ещё → Теги** — все теги с числом заметок. Клик ищет по тегу; тег можно переименовать или убрать сразу во всех заметках.' },
      { id: 'templates', title: 'Шаблоны', body: '**Ещё → Шаблоны**. В библиотеке около 30 шаблонов: работа, знания, жизнь, планы, дневник. Лишние можно скрыть.\n\nСвой шаблон: название, папка, теги и текст. В тексте работают `{{title}}`, `{{date}}`, `{{shortDate}}`, `{{time}}`. Шаблоны хранятся в `.monos/templates.json` и синхронизируются.' },
      { id: 'quick', title: 'Быстрые заметки', body: 'Кнопка «Заметка из буфера» в шапке сохраняет текст или картинку из буфера в папку «Быстрые заметки» с датой и временем в названии. Потом её можно переименовать и разложить.' },
      { id: 'trash', title: 'Корзина', body: 'Удалённая заметка попадает в корзину, а сразу после удаления есть «Отменить». В **Корзине** — «Восстановить» и «Удалить навсегда».\n\n**Удаление папки — сразу и навсегда**, вместе со всем внутри.' },
    ],
  },
  {
    id: 'search',
    title: 'Поиск',
    summary: 'Два способа: поиск по тексту всех заметок и быстрый переход по названию.',
    items: [
      { id: 'search-box', title: 'Поиск по заметкам', body: 'На доске — поле поиска сверху, **/** или **⌘⇧F**. Ищет по названию, пути, тегам и тексту; должны найтись все слова. Фраза в кавычках ищется целиком.\n\n`#слово` в начале ищет только по тегам.' },
      { id: 'operators', title: 'Операторы', body: '| Оператор | Что делает |\n| --- | --- |\n| `body:слово` | только в тексте заметки |\n| `path:папка` | путь содержит |\n| `tag:слово` | тег содержит |\n| `updated:2026-10` | изменена в этом месяце (или дне) |\n| `prop:status=done` | свойство равно |\n| `prop:priority>=3` | сравнение: `>`, `<`, `>=`, `<=` |\n| `prop:status` | свойство есть |\n| `-tag:архив` | минус исключает (перед любым оператором) |\n\nЗначения с пробелами — в кавычках: `path:"Рабочие проекты"`.' },
      { id: 'switcher', title: 'Переход по названию (⌘O)', body: '**⌘O** открывает список заметок: закреплённые, недавние, дальше — по совпадению названия, даже с опечатками. Работают `tag:`, `folder:`, `path:`, `title:`, `created:2026-10`, `-tag:`.' },
      { id: 'palette', title: 'Палитра команд (⌘K)', body: 'Всё, что есть в меню, — в одном месте: новая заметка, шаблоны, теги, таблица заметок, корзина, настройки, терминал, справка. Там же — заметки по названию.' },
      { id: 'saved', title: 'Сохранённые поиски', body: 'Значок закладки в поле поиска сохраняет запрос, например `tag:работа -tag:архив`. Они в **Ещё → Сохранённые поиски**, их можно переименовать и удалить. Хранятся в `.monos`, поэтому синхронизируются.' },
    ],
  },
  {
    id: 'sync',
    title: 'Синхронизация',
    summary: 'Каждое устройство держит свою копию заметок. Они встречаются в вашем приватном репозитории GitHub — других серверов нет.',
    items: [
      { id: 'connect', title: 'Подключить GitHub', body: '1. Создайте **приватный** репозиторий на GitHub.\n2. Создайте fine-grained токен с доступом только к нему: Permissions → Add permissions → Contents, и смените доступ с Read-only (он стоит по умолчанию) на **Read and write**: без записи заметки не отправятся.\n3. В **Настройки → Подключение GitHub** укажите владельца, репозиторий, ветку, токен и имя устройства.\n\nТокен хранится в связке ключей системы. Monos предупредит, если репозиторий публичный или у токена слишком много прав.' },
      { id: 'auto', title: 'Как идёт синхронизация', body: 'Кнопка «Синхронизировать» в боковой панели, плюс автосинхронизация раз в N минут (по умолчанию 15). Один круг: сохранить изменения, забрать чужие, отправить свои.\n\nПока заметка не сохранена, круг ждёт. Открытая заметка обновляется сама, если её изменили на другом устройстве. Можно включить отправку при закрытии приложения.' },
      { id: 'conflicts', title: 'Конфликты', body: 'Если одну заметку изменили на двух устройствах, правки в разных местах сливаются сами. Если в одном и том же месте — заметка отмечается красной точкой и открывается в режиме сравнения: для каждой части выберите версию этого устройства, другого, обе или напишите свой вариант.\n\nСвойства сравниваются по полям. Если заметку удалили на одном устройстве и изменили на другом — выберите, оставить или удалить. Закрытая паролем заметка сравнивается после ввода пароля. Проигравшая версия остаётся в истории.' },
      { id: 'phone', title: 'Телефон и другие устройства', body: 'Второй компьютер — та же установка Monos с тем же репозиторием.\n\nС телефона в той же сети Wi-Fi можно открыть заметки этого компьютера: **Настройки → Телефон и другие устройства**, включить и отсканировать QR. Это удобный просмотр и правка, без терминала. Соединение не шифруется — только для домашней сети.' },
    ],
  },
  {
    id: 'agent',
    title: 'Агент и терминал',
    summary: 'Встроенный терминал запускает CLI-агента прямо в папке заметок: он читает и правит файлы, а вы видите и принимаете его правки здесь же.',
    items: [
      { id: 'terminal', title: 'Терминал', body: 'Кнопка терминала внизу заметки или в шапке, **⌘J**. Только в приложении для компьютера.\n\nВкладки (до шести), поиск по выводу — **⌘F**, перезапуск оболочки в меню «⋯». Скрытый терминал продолжает работать. Пути заметок в выводе — ссылки: клик открывает заметку.' },
      { id: 'launch', title: 'Запустить агента', body: 'Палитра → «Запустить агента», или в меню заметки — «Спросить агента»: терминал откроется с уже набранным вопросом про эту заметку.\n\nКакой агент запускать — **Настройки → Агент**: Claude Code, Codex, Gemini CLI, OpenCode или своя команда. Сам агент устанавливается отдельно.' },
      { id: 'rules', title: 'Правила для агента', body: '«Добавить правила для агента» в настройках агента или в меню терминала создаёт `AGENTS.md` — как устроены заметки и что можно трогать — и `CLAUDE.md` / `GEMINI.md`, которые ссылаются на него. Файлы можно править; в списке заметок их нет.' },
      { id: 'review', title: 'Проверка правок агента', body: 'Перед запуском агента Monos запоминает состояние заметок. Всё, что изменилось не через Monos, получает синюю точку, а в терминале появляется кнопка «Изменения агента: N».\n\nВ проверке видна разница по каждому файлу: **Оставить** или **Откатить**, или всё сразу. Пока правки не проверены, эти файлы не уходят в синхронизацию; оставленные уходят отдельным коммитом «Agent edits».' },
    ],
  },
  {
    id: 'settings',
    title: 'Настройки и данные',
    items: [
      { id: 'look', title: 'Вид', body: 'Язык, тема (системная, светлая, тёмная и палитры Gruvbox, GitHub, Dracula, Nord, Solarized, Catppuccin), шрифт и размер текста.' },
      { id: 'backup', title: 'Резервная копия', body: '**Настройки → Резервная копия**: скачать все заметки ZIP-архивом, импортировать архив (совпадающие имена переименуются, ничего не перезапишется) или распечатать все заметки одним PDF.' },
      { id: 'folder', title: 'Другая папка заметок', body: 'В **Настройки → Папка заметок** можно выбрать любую папку с Markdown. Файлы не переносятся — Monos просто начинает работать с новой папкой после перезапуска.' },
      { id: 'advanced', title: 'Дополнительно', body: '- **Публикация сайтом** — статические HTML-страницы в выбранную папку; ничего не загружается, закрытые заметки пропускаются.\n- **Вложения** — картинки, на которые никто не ссылается.\n- **Ссылки и заметки** — битые ссылки, заметки без связей, давно не открытые, копии от Dropbox/iCloud.\n- **Веб-клиппер** — расширение браузера, сохраняет страницу или выделенное заметкой.' },
      { id: 'shortcuts', title: 'Горячие клавиши', body: '| Клавиши | Действие |\n| --- | --- |\n| ⌘K | палитра команд |\n| ⌘O | перейти к заметке |\n| ⌘N | новая заметка |\n| ⌘S | сохранить сейчас |\n| ⌘B | боковая панель (в тексте — жирный) |\n| ⌘J или ⌘` | терминал |\n| / или ⌘⇧F | поиск на доске |\n| / в начале строки | меню блоков |\n| ⌘-клик, ⌘Enter | открыть ссылку |\n| ⌘F в терминале | поиск по выводу |\n| Shift+F10 | контекстное меню в дереве |\n| Esc | закрыть меню, выйти из фокуса |\n\nНа Windows и Linux вместо ⌘ — Ctrl.' },
    ],
  },
  {
    id: 'faq',
    title: 'Вопросы и ответы',
    items: [
      { id: 'account', title: 'Нужен ли аккаунт?', body: 'Нет. Заметки — файлы на вашем компьютере. GitHub нужен только для синхронизации между устройствами, и это ваш собственный приватный репозиторий.' },
      { id: 'obsidian', title: 'Можно открыть хранилище Obsidian?', body: 'Да: **Настройки → Папка заметок** → выберите папку хранилища. Ссылки `[[...]]`, вставки `![[...]]`, выноски и свойства читаются так же.' },
      { id: 'offline', title: 'Работает без интернета?', body: 'Да, всё, кроме синхронизации. Изменения отправятся при следующей синхронизации с сетью.' },
      { id: 'lost-edit', title: 'Не потеряю ли я правку при конфликте?', body: 'Нет. Monos не перезапишет правку другого устройства молча: либо сольёт их, либо покажет обе версии. Заметка с неразобранным конфликтом не отправляется. Любую прежнюю версию можно вернуть из «Истории».' },
      { id: 'sync-stuck', title: 'Синхронизация не идёт', body: '- Есть ли красная точка у заметок? Сначала разберите конфликты.\n- Есть ли непроверенные правки агента? Оставьте или откатите их.\n- В **Настройки → Подключение GitHub** проверьте токен: он мог истечь.' },
      { id: 'agent-missing', title: 'Агент не запускается', body: 'Monos не ставит агента сам. Установите его (например, `claude`) так, чтобы он запускался из обычного терминала, и выберите его в **Настройки → Агент**. Терминал использует ту же оболочку и PATH, что и системный.' },
      { id: 'forgot-password', title: 'Забыл пароль от заметки', body: 'Восстановить нельзя: Monos не хранит пароль и не может расшифровать заметку без него. Прежние незакрытые версии могут остаться в «Истории».' },
      { id: 'folder-delete', title: 'Удалил папку — где она?', body: 'Удаление папки необратимо, в корзину она не попадает. Если включена синхронизация, файлы можно вернуть из истории репозитория на GitHub.' },
      { id: 'phone-app', title: 'Есть приложение для телефона?', body: 'Отдельного нет. В той же сети Wi-Fi телефон открывает заметки этого компьютера через браузер — см. «Телефон и другие устройства».' },
      { id: 'color-sync', title: 'Почему цвет заметки не виден на другом устройстве?', body: 'Цвет карточки хранится только на этом компьютере. Закрепление, теги и свойства записываются в файл и синхронизируются.' },
    ],
  },
];

const en = [
  {
    id: 'start',
    title: 'Getting started',
    summary: 'Monos keeps notes as plain Markdown files on your computer. No account and no server: devices sync through your own private GitHub repository.',
    items: [
      { id: 'first-note', title: 'Your first note', body: 'Until there are notes, the board shows "Where to start": start writing, open a folder of notes, or connect sync.\n\nPress **⌘N** or the "New note" card on the board. Start blank, with **today\'s note** (titled with the date, kept in "Daily notes"), or from a template.\n\nThere is nothing to save: a note saves itself as you type. **⌘S** saves at once.' },
      { id: 'where-files', title: 'Where the files are', body: 'Each note is a `.md` file and the folders in the sidebar are real folders on disk. Any editor can open them, and **Settings → Notes folder** can point Monos at an existing folder, such as an Obsidian vault.\n\nMonos keeps its own files (templates, saved searches, the agent\'s edit history) in a hidden `.monos` folder next to the notes.' },
      { id: 'layout', title: 'The window', body: '- **Left**: the sidebar with pinned, recent and the folder tree; at its foot More (notes table, tags, saved searches, templates), terminal, trash, help, sync and settings. **⌘B** hides it.\n- **Middle**: the board with every note, or the open note.\n- **Bottom**: the agent terminal (desktop app only), **⌘J**.\n- **⌘K**: the command palette, for any action and any note by name.' },
      { id: 'device-name', title: 'Device name', body: 'This computer\'s name appears in history and in conflicts: "on MacBook" and "on work PC" say more than "here" and "there". It only matters for sync, so it is set while connecting GitHub: **Settings → GitHub Connection → Device name**, with the computer\'s own name already filled in.' },
    ],
  },
  {
    id: 'writing',
    title: 'Editor',
    summary: 'Write as in a document; Monos stores Markdown. Markdown typed into the text works too.',
    items: [
      { id: 'formatting', title: 'Formatting and the "/" menu', body: 'Type **/** at the start of a line for the block menu: headings, lists, checklist, quote, code block, table, divider. ↑↓ to pick, Enter to insert, Esc to close.\n\nMarkdown works as you type: `#` and `##` for headings, `-` for a list, `1.` numbered, `[ ]` a task, `>` a quote, ```` ``` ```` code, `---` a divider.\n\n**⌘B** bold, **⌘I** italic, **⌘E** inline code, **⌘Z** / **⌘⇧Z** undo and redo.' },
      { id: 'tasks', title: 'Tasks and due dates', body: '`- [ ]` lines are tasks; click to tick one. The note header shows "X of Y tasks".\n\nSet a due date in the Due field: `2026-12-24`, `24.12.2026` or `24.12.26`, the Today, Tomorrow and In a week buttons, or the calendar. The file stores it as `due: 2026-12-24`.' },
      { id: 'links', title: 'Links between notes', body: 'Type `[[` for suggestions by name. Forms: `[[Note]]`, `[[Note|label]]`, `[[Note#Heading]]`, `[[Folder/Note]]`.\n\n**⌘-click** or **⌘Enter** follows a link. A link to a missing note offers to create it. Under the note: linked notes (what links here), unlinked mentions with a "Link" button, and a small graph.\n\nOther names for a note go in the `aliases` property and resolve links too. Renaming a note updates the links to it.' },
      { id: 'embeds', title: 'Embeds, images and PDFs', body: 'Paste or drop an image. Monos compresses it to WebP and keeps it in an `_attachments` folder next to the note. Click an image to rename it; links follow.\n\n`![[Note]]` embeds another note read-only, `![[file.pdf]]` shows a PDF.' },
      { id: 'callouts', title: 'Callouts', body: 'A quote with a type becomes a coloured callout, as in Obsidian:\n\n```\n> [!tip] Tip\n> Callout text\n```\n\nGreen: `tip`, `success`, `done`; yellow: `warning`, `caution`; red: `danger`, `error`, `bug`. `[!tip]-` starts folded.' },
      { id: 'properties', title: 'Properties', body: 'Properties are fields at the top of the file: status, priority, a date, a checkbox, a list. The note\'s Properties panel adds and edits them; the type is guessed from the value.\n\nEvery property of every note is in **More → Notes table**: columns, sorting and a filter such as `prop:status=done`.' },
      { id: 'tools', title: 'Focus, outline, history, export', body: '- **Focus mode** hides everything but the text; Esc brings it back.\n- **Outline** lists the headings to jump to.\n- **Markdown / rich editor** switches the view.\n- **History** shows earlier versions from GitHub: the difference from now and "Restore this version". It appears once sync is connected.\n- **More → Export** at the foot of the note: Markdown, HTML, plain text, PDF. Print is next to it.' },
      { id: 'lock', title: 'A password on a note', body: 'The note menu has "Password protection…". The text is encrypted (AES-256); the file and GitHub hold only the cipher. The passphrase is asked once per session.\n\n**A forgotten passphrase cannot be recovered.** Locked notes stay out of search and publishing.' },
    ],
  },
  {
    id: 'organize',
    title: 'Organising',
    summary: 'Folders, pins, colours, tags and templates keep what matters close.',
    items: [
      { id: 'board', title: 'The board', body: 'The board shows every note as a card: pinned first, then the most recently changed. At the top: the number of columns and grouping by colour.\n\nRight-click a card to open it, reveal it in the tree, copy its path or pick a colour. The colour is kept on this computer only.' },
      { id: 'tree', title: 'Folders and the tree', body: 'Right-click in the tree (or Shift+F10): new note, new folder, pin, icon and colour, rename, duplicate, delete, add a tag.\n\nDrag notes into folders or to the root. **⌘-click** selects several notes to move, tag or delete together.' },
      { id: 'pin', title: 'Pinning', body: 'Pinned notes come first on the board and in their own sidebar section. The pin is written to the file (`pinned: true`), so it is the same on every device.' },
      { id: 'tags', title: 'Tags', body: 'Add tags in the field under the note title: Enter or a comma. Backspace in the empty field removes the last one.\n\n**More → Tags** lists every tag with its note count. Click to search by tag; rename or remove a tag across all notes at once.' },
      { id: 'templates', title: 'Templates', body: '**More → Templates**. The library has about 30 templates: work, knowledge, life, planning, journal. Hide the ones you don\'t need.\n\nA template of your own has a name, folder, tags and text. The text can use `{{title}}`, `{{date}}`, `{{shortDate}}`, `{{time}}`. Templates live in `.monos/templates.json` and sync.' },
      { id: 'quick', title: 'Quick notes', body: '"Note from clipboard" in the header saves the clipboard\'s text or image to "Quick notes", named with the date and time. Rename and file it later.' },
      { id: 'trash', title: 'Trash', body: 'A deleted note goes to the trash, with Undo right after. The **Trash** has Restore and Delete forever.\n\n**Deleting a folder is immediate and permanent**, with everything in it.' },
    ],
  },
  {
    id: 'search',
    title: 'Search',
    summary: 'Two ways in: search the text of every note, or jump to a note by name.',
    items: [
      { id: 'search-box', title: 'Searching notes', body: 'On the board: the search field at the top, **/** or **⌘⇧F**. It searches names, paths, tags and text; every word must match. A phrase in quotes is matched whole.\n\n`#word` at the start searches tags only.' },
      { id: 'operators', title: 'Operators', body: '| Operator | Meaning |\n| --- | --- |\n| `body:word` | only in the note text |\n| `path:folder` | path contains |\n| `tag:word` | a tag contains |\n| `updated:2026-10` | changed that month (or day) |\n| `prop:status=done` | property equals |\n| `prop:priority>=3` | compare: `>`, `<`, `>=`, `<=` |\n| `prop:status` | has the property |\n| `-tag:archive` | a minus excludes (before any operator) |\n\nValues with spaces go in quotes: `path:"Work projects"`.' },
      { id: 'switcher', title: 'Jump to a note (⌘O)', body: '**⌘O** lists notes: pinned, recent, then by name match, typos included. It understands `tag:`, `folder:`, `path:`, `title:`, `created:2026-10` and `-tag:`.' },
      { id: 'palette', title: 'Command palette (⌘K)', body: 'Everything in the menus, in one place: new note, templates, tags, notes table, trash, settings, terminal, help. Notes by name too.' },
      { id: 'saved', title: 'Saved searches', body: 'The bookmark icon in the search field saves a query such as `tag:work -tag:archive`. Find them in **More → Saved searches** to rename or delete. They live in `.monos` and sync.' },
    ],
  },
  {
    id: 'sync',
    title: 'Sync',
    summary: 'Every device keeps its own copy of the notes. The copies meet in your private GitHub repository; there is no other server.',
    items: [
      { id: 'connect', title: 'Connect GitHub', body: '1. Create a **private** repository on GitHub.\n2. Create a fine-grained token with access to that repository only: Permissions → Add permissions → Contents, then change its access from Read-only (the default) to **Read and write**: without write access the notes cannot be sent.\n3. In **Settings → GitHub Connection** enter the owner, repository, branch, token and device name.\n\nThe token is kept in the system keychain. Monos warns if the repository is public or the token can do too much.' },
      { id: 'auto', title: 'How sync runs', body: '"Sync now" in the sidebar, plus auto-sync every N minutes (15 by default). One round commits your changes, fetches the others\', and pushes yours.\n\nA round waits while a note is unsaved. An open note refreshes itself when another device changed it. Upload on quit can be turned on.' },
      { id: 'conflicts', title: 'Conflicts', body: 'When two devices change the same note, edits in different places merge by themselves. Edits to the same place mark the note with a red dot and open it side by side: for each part, keep this device\'s version, the other\'s, both, or write your own.\n\nProperties are compared field by field. Deleted on one device but changed on the other: choose keep or delete. A locked note is compared after you enter its passphrase. The losing version stays in history.' },
      { id: 'phone', title: 'Phone and other devices', body: 'A second computer is the same Monos install with the same repository.\n\nA phone on the same Wi-Fi can open this computer\'s notes: **Settings → Phone and other devices**, turn it on and scan the QR. It is for reading and editing, without the terminal. The connection is unencrypted, so keep it to your home network.' },
    ],
  },
  {
    id: 'agent',
    title: 'Agent and terminal',
    summary: 'The built-in terminal runs a CLI agent right in the notes folder: it reads and edits files, and you see and accept its edits here.',
    items: [
      { id: 'terminal', title: 'Terminal', body: 'The terminal button at the foot of the note or in the header, **⌘J**. Desktop app only.\n\nTabs (up to six), search the output with **⌘F**, restart the shell from the "⋯" menu. A hidden terminal keeps running. Note paths in the output are links: click to open the note.' },
      { id: 'launch', title: 'Start the agent', body: 'Palette → "Start the agent", or "Ask the agent" in the note menu: the terminal opens with a question about the note already typed.\n\nPick the agent in **Settings → Agent**: Claude Code, Codex, Gemini CLI, OpenCode or a command of your own. The agent itself is installed separately.' },
      { id: 'rules', title: 'Rules for the agent', body: '"Add rules for the agent" in the agent settings or the terminal menu writes `AGENTS.md` (how the notes are laid out and what may be touched) plus `CLAUDE.md` / `GEMINI.md` that point to it. Edit them freely; they don\'t appear among notes.' },
      { id: 'review', title: 'Reviewing the agent\'s edits', body: 'Before the agent starts, Monos records the state of the notes. Anything changed outside Monos gets a blue dot, and the terminal shows an "Agent changes: N" button.\n\nThe review shows each file\'s difference: **Keep** or **Revert**, one by one or all at once. Unreviewed files are held back from sync; kept ones go out in their own "Agent edits" commit.' },
    ],
  },
  {
    id: 'settings',
    title: 'Settings and data',
    items: [
      { id: 'look', title: 'Appearance', body: 'Language, theme (system, light, dark and the Gruvbox, GitHub, Dracula, Nord, Solarized and Catppuccin palettes), font and text size.' },
      { id: 'backup', title: 'Backup', body: '**Settings → Backup**: download every note as a ZIP, import a ZIP (clashing names are renamed, nothing is overwritten), or print every note as one PDF.' },
      { id: 'folder', title: 'Another notes folder', body: '**Settings → Notes folder** can point at any folder of Markdown. Nothing is moved; Monos works from the new folder after a restart.' },
      { id: 'advanced', title: 'Advanced', body: '- **Publish as a website**: static HTML pages into a folder you choose; nothing is uploaded and locked notes are skipped.\n- **Attachments**: images nothing links to.\n- **Links and notes**: broken links, notes with no links, notes untouched for long, Dropbox/iCloud copies.\n- **Web clipper**: a browser extension that saves a page or a selection as a note.' },
      { id: 'shortcuts', title: 'Keyboard shortcuts', body: '| Keys | Action |\n| --- | --- |\n| ⌘K | command palette |\n| ⌘O | jump to a note |\n| ⌘N | new note |\n| ⌘S | save now |\n| ⌘B | sidebar (bold inside text) |\n| ⌘J or ⌘` | terminal |\n| / or ⌘⇧F | search on the board |\n| / at line start | block menu |\n| ⌘-click, ⌘Enter | follow a link |\n| ⌘F in the terminal | search the output |\n| Shift+F10 | context menu in the tree |\n| Esc | close a menu, leave focus mode |\n\nOn Windows and Linux use Ctrl for ⌘.' },
    ],
  },
  {
    id: 'faq',
    title: 'FAQ',
    items: [
      { id: 'account', title: 'Do I need an account?', body: 'No. Notes are files on your computer. GitHub is only for syncing devices, and it is your own private repository.' },
      { id: 'obsidian', title: 'Can I open an Obsidian vault?', body: 'Yes: **Settings → Notes folder** and choose the vault. `[[...]]` links, `![[...]]` embeds, callouts and properties read the same.' },
      { id: 'offline', title: 'Does it work offline?', body: 'Yes, everything but sync. Changes go out at the next sync with a connection.' },
      { id: 'lost-edit', title: 'Can a conflict lose my edit?', body: 'No. Monos never silently overwrites another device\'s edit: it merges them or shows both. A note with an unresolved conflict is not pushed. Any earlier version can be restored from History.' },
      { id: 'sync-stuck', title: 'Sync is stuck', body: '- Do notes have a red dot? Resolve the conflicts first.\n- Are there unreviewed agent edits? Keep or revert them.\n- Check the token in **Settings → GitHub Connection**; it may have expired.' },
      { id: 'agent-missing', title: 'The agent won\'t start', body: 'Monos doesn\'t install the agent. Install it (for example `claude`) so it runs from an ordinary terminal, and choose it in **Settings → Agent**. The built-in terminal uses the same shell and PATH as the system one.' },
      { id: 'forgot-password', title: 'I forgot a note\'s passphrase', body: 'It cannot be recovered: Monos does not store the passphrase and cannot decrypt the note without it. Earlier unlocked versions may still be in History.' },
      { id: 'folder-delete', title: 'I deleted a folder. Where is it?', body: 'Deleting a folder is permanent; it does not go to the trash. With sync on, the files can be recovered from the repository\'s history on GitHub.' },
      { id: 'phone-app', title: 'Is there a phone app?', body: 'Not a separate one. On the same Wi-Fi a phone opens this computer\'s notes in the browser; see "Phone and other devices".' },
      { id: 'color-sync', title: 'Why isn\'t a note\'s colour on my other device?', body: 'Card colours are kept on this computer only. Pins, tags and properties are written to the file and sync.' },
    ],
  },
];

/** The Help in the given language; anything but Russian reads English. */
export function helpSections(locale) {
  return locale === 'ru' ? ru : en;
}
