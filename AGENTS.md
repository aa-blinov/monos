# Инструкции для AI-агентов (Monos)

Этот файл содержит правила и контекст для AI-агентов, работающих с данной базой знаний.

## Стек

- **Backend:** Node.js + Express + better-sqlite3 (`webui/backend/`)
- **Frontend:** Svelte 4 + Vite + Tailwind + TipTap (`webui/frontend/`)
- **БД:** SQLite (файл `webui/.data/notes.db`)
- **Заметки:** `notes/` — Markdown с wiki-links `[[...]]`

## Запуск

```bash
# Backend (сначала корень: бэкенд берёт зависимости из корневого node_modules)
npm install
cd webui/backend && npm install && node index.js

# Frontend (dev)
cd webui/frontend && npm install && npm run dev
```

Бэкенд на порту 8000, фронтенд на 5173.

Фронтенд на другом порту — запусти бэкенд с `ALLOWED_ORIGINS=http://localhost:<порт>`. Иначе бэкенд отобьёт каждый
запрос страницы как чужой источник (403), и надпись о сохранении обвинит путь вместо настоящей причины.

Связка ключей спрашивает пароль системным диалогом и ждёт, а запрос держит тот поток, который его задал. `safeStorage`
есть только в главном процессе Electron, поэтому обращение к связке останавливает бэкенд, пока открыт диалог, и обойти
это из приложения нельзя: в `utilityProcess` `safeStorage` недоступен. Ожидание снимает ответ «Разрешить всегда» — после
него ключ открывается без вопроса. Живое приложение проверяют на копии данных (`--user-data-dir`).

## Проверка кода (обязательно)

Перед коммитом:

```bash
# Frontend
cd webui/frontend && npm test
cd webui/frontend && npm run check
cd webui/frontend && npm run build

# Backend
cd webui/backend && npm test
cd webui/backend && node --check index.js search.js database.js
npm run check:deps  # из корня: бэкенд тестируется на тех же версиях, что уезжают в сборку

# Electron (главный процесс)
npm run test:electron  # из корня: тесты меню на node:test

# Документация (модули и их тесты должны быть описаны)
npm run test:docs  # из корня: docs-freshness сверяет код с документацией
```

Тесты лежат рядом с тем, что проверяют, и запускаются по одному:

```bash
node --test webui/frontend/src/lib/foo.test.js
cd webui/frontend && node_modules/.bin/vitest run src/components/Foo.test.js
```

Проверка сохранения — на копии данных (стенд), а не на живой папке заметок: скрипт, который печатает в заметку, меняет
файл, и автосинк уносит правку в репозиторий. Открытую заметку проверяй чтением, а не вводом текста.

## Структура

```
electron/             # Главный процесс Electron: окно, меню, терминал
webui/
  backend/          # Node.js Express API
    index.js        # Express API и роуты
    database.js     # SQLite (better-sqlite3)
    search.js       # Логика поиска и ранжирования
    search.test.js  # Тесты поиска на node:test
    trash.js        # Корзина: перенос в .trash/, восстановление, миграция из индекса
    trash-store.js  # Пути корзины и sidecar (.trash.json)
    folder-config.js # Иконки и цвета папок: файл .monos/folders.json
    api-errors.js   # Ответ об ошибке {detail, code} без путей и стеков
    html-safety.js  # Фильтр HTML из заметок (печать, сайт)
    support/vault.js # Стенд для тестов: бэкенд на временной папке
  frontend/         # Svelte SPA
    src/
      components/   # Svelte компоненты
      lib/          # Общие модули (icons.js, search.js)
        search.js   # Подсветка и разбор поискового запроса
        search.test.js # Тесты клиентского поиска на node:test
      stores.js     # Svelte stores (editMode, syncScroll)
      app.css       # Gruvbox тема
  .data/            # SQLite БД, настройки Git
notes/              # Markdown заметки
```

## API эндпоинты

| Метод  | Путь                             | Описание                  |
| ------ | -------------------------------- | ------------------------- |
| GET    | `/api/tree`                      | Дерево директорий         |
| GET    | `/api/file?path=`                | Читать файл               |
| POST   | `/api/file?path=`                | Сохранить файл            |
| DELETE | `/api/file?path=`                | В корзину (`.trash/`), папка целиком; `permanent=1` — насовсем |
| POST   | `/api/file/rename?path=`         | Переименовать             |
| POST   | `/api/file/move?source=&target=` | Переместить               |
| GET    | `/api/file-info?path=`           | Инфо о файле              |
| PUT    | `/api/file/metadata?path=`       | Обновить метаданные       |
| POST   | `/api/notes/create`              | Создать заметку           |
| GET    | `/api/notes/recent`              | Последние открытые        |
| GET    | `/api/notes/trash`               | Корзина (путь — откуда удалена) |
| POST   | `/api/notes/restore?path=`       | Из корзины на место       |
| POST   | `/api/search`                    | Поиск                     |
| GET    | `/api/notes/backlinks?path=`     | Обратные ссылки           |
| GET    | `/api/notes/resolve-link?name=`  | Найти заметку по названию |
| GET    | `/api/directories`               | Список папок              |
| POST   | `/api/directory/create?path=`    | Создать папку             |
| POST   | `/api/directory/icon?path=`      | Иконка и цвет             |
| GET    | `/api/git/status`                | Git статус                |
| POST   | `/api/git/setup`                 | Настроить Git             |
| POST   | `/api/git/sync`                  | Синхронизация             |
| GET    | `/api/git/log`                   | История коммитов          |
| GET    | `/api/git/repos?token=`          | Список репозиториев       |
| GET    | `/api/git/branches?token=&repo=` | Ветки                     |
| GET    | `/api/git/user?token=`           | Пользователь GitHub       |
| GET    | `/api/git/conflicts`             | Конфликты                 |
| POST   | `/api/git/conflicts/resolve`     | Разрешить конфликты       |

## Git и версионирование

1. Перед синхронизацией — нажать **Format** (иконка волшебной палочки в редакторе)
2. **Sync** в футере сайдбара — pull + commit + push
3. Pre-commit хуки в репозитории: mdformat, ruff, pre-commit-hooks
4. **Фоновая синхронизация не прерывает работу**: упавший раунд показывается в строке синхронизации сайдбара (значок,
   подпись и причина в подсказке), а не окном поверх текста. Успешный раунд снимает отметку

## Интерфейс

01. **Никаких «·»** между частями строки — разделять скобками или пробелом. И надпись не кончается точкой: «Откреплено»,
    а не «Откреплено.» — точка читается как конец фразы, которой дальше нет
02. **Мета-строка шапки** — одна фраза через запятую: дата, синхронизация, статистика, задачи. Части идут текстовым
    потоком (`inline`), запятая через `::after`, а не `::before`: при `::before` перенесённая строка начиналась с
    запятой. Кнопок в строке нет
03. **Кнопки заметки — в верхней строке, у правого края**: «Структура» иконкой, имя — в подсказке. Подпись рядом с
    иконкой не нужна. В колонке «Структура» своя кнопка закрытия остаётся только на телефоне: там панель закрывает весь
    экран, и из шапки её не достать
04. **В футере сайдбара три строки: «Прочее», терминал, настройки.** Всё остальное лежит в «Прочем», и корзина —
    последним пунктом там, за разделителем: разрушающее действие не стоит вплотную к тому, что нажимают часто, и
    снаружи его нет ни на компьютере, ни на телефоне. Порядок внутри: карта, избранное, теги, вложения, свойства,
    сохранённые поиски, шаблоны, затем корзина
05. **Панель форматирования идёт по смыслу**: отмена, начертание, заголовки, списки, блоки, вставка. Редкие инструменты
    уходят в меню «…» с конца ряда, поэтому порядок решает, что исчезнет первым
06. **Шапка и текст — разные колонки.** Шапка держит 48rem, текст — ширину из настроек, обе по центру. Заголовок не
    встаёт по левому краю текста: это осознанно, `e2e/36-inside-a-note.spec.js` проверяет, что заголовок не двигается
    при смене ширины текста
07. **Настройки вида** (размер шрифта, ширина контента, межстрочный интервал) — в панели форматирования, у правого края,
    и в Настройках. Кнопка «…» в панели появляется только при переполнении, а настройка, доступная лишь из Настроек, до
    редактора не доходит
08. **Надпись сохранения называет причину**: сервер отдаёт статус и код отказа, `editor.saveFailedReason(status, code)`
    превращает их в текст. Одна надпись на все отказы заставляла угадывать. 403 отдают три разные причины (путь, чужой
    адрес, чужой источник) — код в ответе говорит какая, иначе за путь винят запрос, который пришёл вообще не от
    приложения
09. **Запись файла отдельно от индекса.** Файл записан — значит текст на диске; упавший индекс не должен отвечать 500 на
    записанный файл
10. **Нижняя панель: слева путь, справа свойства.** Путь ведёт до папки, без имени заметки: имя уже стоит
    заголовком выше, и в пути оно повторялось бы через слэш. У заметки без папки путь говорит «Без папки». Путь
    обрезается только когда места нет. Свойства (теги, срок, поля, закрепить) — иконками у правого края, подпись и
    значение уходят в подсказку при наведении. Отступы между иконками — одинаковые: пустая надпись о сохранении места
    не занимает. Сама надпись о сохранении стоит слева от иконок, а не между ними, на телефоне — полосой над панелью
11. **Иконка с подсказкой — `TooltipIconButton`, имя кнопки — в пропе `label`.** Компонент ставит свой `aria-label`
    после `$$restProps`, поэтому переданный извне `aria-label` молча пропадает, и кнопка остаётся без имени для
    скринридера
12. **Дата с временем в русской локали читается как фраза**: «Изменено 19 окт. в 21:22», а не «19 окт., 21:22», как
    выдаёт Intl. Формат живёт в `lib/date-format.js` (`interfaceDateTime`)
13. **Нативное меню — только macOS**, собирает его главный процесс (`electron/menu.cjs`). Подписи живут там же на двух
    языках: главный процесс не достаёт `strings.js` (в сборке есть только собранная страница). Акселератор съедает
    клавишу, поэтому у каждого пункта с ускорителем есть команда, которую выполняет страница; контекстные клавиши (⌘B)
    остаются без ускорителя — решает страница. Язык меню: сначала язык системы, потом страница присылает свой
    (`menu:locale`). Вид заметки (режим фокуса, колонка структуры) живёт в редакторе: меню отправляет команду через стор
    `editorViewCommand`, и открытая заметка её выполняет. Меню показывает состояние окна: переключатели с галочками, а
    пункты, которым нужна заметка, серые без неё. Состояние присылает страница (`menu:state`, стор `menuState`), главный
    процесс пересобирает меню — галочка на пункте меняется по тому, что страница сказала. «Показать в Finder» — дело
    оболочки: путь к заметке она берёт из того же состояния, страницу не спрашивает. «Печать…» — тоже дело оболочки:
    системный диалог печати открывает она, а печатает заметку как отдельный документ (`printCurrentNote`). «Недавние
    заметки» — список из того же состояния, клик по заметке отправляет странице путь. ⌘W закрывает то, что открыто:
    заметку, а без заметки окно (на macOS он всегда что-то закрывает). Порядок меню «Заметка» — как в HIG (новое,
    открыть, недавние, закрыть, сохранить, печать), а в меню «Окно» остались свернуть, развернуть и окна вперёд: на
    macOS окна закрывают в меню «Файл». Меню под иконкой в Dock — то же самое: новая заметка и недавние
    (`buildDockTemplate`). Что есть в меню — есть и в справке: клавиши приложения из меню идут в таблицу «Горячие
    клавиши» (`lib/help-content.js`), системные (⌘X, ⌘C, ⌘V) не перечисляем, а клавиши только для приложения помечены
    «только в приложении»
14. **Окно помнит размер и место.** Состояние лежит в `window-state.json` в папке приложения
    (`electron/window-state.cjs`): размер, положение и проверка, что окно попадает на существующий экран — ушедший
    монитор не должен оставить окно за пределами рабочего стола. Заголовок окна — имя заметки и имя приложения («CV —
    Monos»), на доске — просто «Monos»: имя заметки приходит в состоянии окна
15. **Поиск по тексту заметки.** Считает совпадения и подсвечивает их плагин prosemirror-search (`FindInNote` в
    `lib/richEditorExtensions.js`), панель — в редакторе (`data-testid="note-find"`). Клавиша ⌘F остаётся без ускорителя
    в меню: в терминале она ищет по выводу, в заметке — по её тексту, и решает страница. Enter и ⇧Enter ведут к
    следующему и предыдущему совпадению, Esc закрывает панель и возвращает каретку в текст
16. **Правый клик — родное меню macOS.** Оболочка ловит `context-menu` (`electron/main.cjs`): в редактируемой цели
    (`params.isEditable`) показывает системное меню (вырезать, копировать, вставить, выделить всё) подписями языка
    интерфейса (`buildContextMenuTemplate` в `electron/menu.cjs`), в остальном — меню приложения, нарисованное в
    странице (список заметок, дерево, карточка). Меню Chromium с пунктами «Reload» и «Inspect» не появляется никогда.
    Страница, перехватившая правый клик сама, отменяет его на уровне DOM, и Electron меню не спрашивает: свои меню
    страницы и родное меню не сталкиваются
17. **Язык документа следует за языком интерфейса.** `document.documentElement.lang` обновляется в `App.svelte` при
    смене языка: синтезатор речи читает страницу тем же голосом, каким нарисован интерфейс
18. **Приложение живёт и без окна.** Окно закрыли (⌘W без заметки или кнопкой окна) — приложение остаётся в Dock и в
    меню. Команда, которой некуда идти, открывает новое окно и доезжает до его страницы (`pendingMenuCommand`), а не
    падает в закрытый `webContents`. Клик по иконке в Dock и повторный запуск приложения открывают окно снова. Закрытое
    окно проверяется через `isDestroyed()`: обращение к destroyed-объекту в главном процессе бросает исключение
19. **Правый клик в терминале — меню приложения.** Вывод терминала рисует xterm, там нужно своё меню: копировать,
    вставить, выделить всё (`components/TerminalPanel.svelte`, подписи в `lib/strings.js`). Страница отменяет правый
    клик на уровне DOM, и Electron меню не спрашивает: меню браузера в приложении не появляется
20. **Родное меню «Формат».** Жирный, курсив, зачёркнутый, код в строке, заголовки и списки — как в любом приложении с
    текстом на macOS (`buildMenuTemplate` в `electron/menu.cjs`, подписи там же). Команды уходят в страницу (`format-…`)
    и в редактор (`runFormat` в `components/RichEditor.svelte` — те же команды, что и на панели над текстом). Без
    ускорителей: ⌘B в Monos двусмысленна (в тексте — жирный, вне текста — боковая панель), и меню забрало бы её себе.
    Пункты серые, когда текст не редактируется (запертая заметка, конфликт): страница сообщает это полем `editable`
21. **«Выделить всё» и «Удалить» — команды страницы, а не роли браузера.** Роль `selectAll` выделила бы всю страницу:
    боковую панель, шапку и текст заметки разом, и это видно как поломка, а роль `delete` в редакторе не удаляет ничего
    (проверено и пробой, и вживую: в редакторе ProseMirror нативная роль молчит). Страница делает и то и другое там, где
    стоит каретка: текст поля или текст заметки (`selectAllText` и `deleteSelectionText` в
    `components/RichEditor.svelte`); в терминале своё выделение и своё удаление (⌘A и ⌫), туда команды не лезут. Так и в
    меню «Правка», так и в контекстном меню текста (`buildContextMenuTemplate`). Остальные роли (вырезать, копировать,
    вставить, отменить, повторить) работают как надо: браузер шлёт событие, его ловит редактор
22. **«Показать в Finder» из дерева заметок.** Оболочка умеет показать файл в Finder (`revealInFinder` в
    `electron/main.cjs`), а страница просит об этом через `window.monosMenu.reveal` (`electron/preload.cjs`). Пункт есть
    только в приложении для компьютера: в веб-версии Finder нет
23. **«Настройки» открываются отдельным окном, как в macOS.** Пункт меню и кнопка в боковой панели открывают окно
    (`openSettingsWindow` в `electron/main.cjs`, страница в режиме окна — `?window=1` в `App.svelte`: без боковой панели
    и без верхней панели). Заметки остаются в своём окне. Меню показывает состояние того окна, что впереди: окно
    сообщает его само, а когда окно снова впереди, сообщает ещё раз. Поэтому ⌘W в окне настроек закрывает это окно, а не
    заметку. Настройки, которые видны обоим окнам (тема, язык, режим темы), живут в localStorage, и окна слышат друг
    друга через событие storage (`syncedWithStorage` в `lib/stores/persisted.js`). Окно настроек не занимается фоновой
    работой: автосинхронизацию ведёт окно с заметками
24. **Файл, брошенный в окно, открывает заметку.** Путь брошенного файла знает только система: `File.path` из Electron
    удалён, поэтому путь берёт `webUtils.getPathForFile` в preload (`electron/preload.cjs`). Проверяет его оболочка,
    чистым модулем `electron/dropped-note.cjs`: открывается только `.md` и `.txt` из папки заметок, и только как
    `notes/<путь>`. Остальное игнорируется молча: файлы пользователя не копируются в папку заметок без спроса. Отказ для
    заметки вне папки показывается подсказкой в странице, а не окном над текстом. Дроп, который уже взял редактор или
    дерево, до общей обработки не доходит: общий обработчик смотрит `defaultPrevented` прежде, чем сам его поставить
25. **Фоновое событие говорит система, а не окно.** Пока окно впереди, приложение молчит: человек видит строку
    синхронизации и метку под заголовком заметки. Когда окно ушло в фон, macOS сообщает сама: пришли заметки, круг
    синхронизации не удался, появились конфликты. Уведомление создаёт оболочка (`electron/notify.cjs` и `Notification` в
    `electron/main.cjs`): решение «окно впереди, значит молчим» принимает она, страница только говорит, что случилось
    (`backgroundEvent` в `lib/git-sync.js`). Одно и то же событие не повторяется каждым кругом. Клик по уведомлению
    приводит приложение вперёд и показывает то, о чём уведомление: пришли заметки, значит доска
26. **Терминал — у нижней кромки, а не в шапке.** Панель выезжает снизу, и переключатель стоит там же: строкой
    «Терминал» в футере боковой панели (одно место на всех экранах) и кнопкой в футере заметки. В шапке доски его нет:
    верхний правый угол занят поиском и быстрой заметкой. В вебе кнопки нет вовсе, потому что нет и терминала
27. **Справка живёт в настройках, последним разделом.** В футере боковой панели её нет: там «Прочее», терминал и
    настройки. Свой раздел в настройках держит описание и кнопку «Открыть справку»; сама справка остаётся
    отдельной страницей (⌘/ и палитра команд), и её текст не переезжает в настройки
28. **Строка фильтров доски закреплена.** Теги и порядок решают, что видно на доске, поэтому при прокрутке карточек
    они остаются у верхней кромки: фон страницы, линия снизу. Бар держит одинаковый отступ сверху и снизу, в один шаг
    (`1rem`): верхний отступ страницы он подтягивает к этому шагу (`sm:-top-2 sm:-mt-2 lg:-top-4 lg:-mt-4`), нижний
    равен ему (`pb-4`), а фон продлён вверх на этот шаг (`before:h-4`), чтобы над ним не выглядывала карточка. Меню
    порядка висит по левому краю своей кнопки, как список тегов, и уезжает влево только если иначе не помещается

29. **Верхняя полоса окна рисуется страницей на macOS и Windows.** Системный заголовок скрыт (`titleBarStyle: 'hidden'`,
    `electron/titlebar.cjs`), по всей ширине идёт полоса 40px (`components/TitleBar.svelte`) одного цвета с темой и с
    названием окна («CV — Monos»): за неё окно перетаскивают (`-webkit-app-region: drag`, кнопок в ней нет). Родными
    остаются светофор macOS (`trafficLightPosition`) и кнопки Windows (`titleBarOverlay`), которые страница красит в
    цвета темы (`monosWindow.setTitleBarColors`). На Linux остаётся рамка оконного менеджера, в браузере полосы нет:
    страница узнаёт об этом из `window.monosWindow.customTitleBar`
30. **Шрифт — Medeo** (`public/fonts`, `src/fonts.css`): Mono по умолчанию, Sans и Pixel рядом, латиница и кириллица в
    одном файле. Прежние имена (`JetBrains Mono`, `Inter`, `Source Serif 4`) заменяет `currentFontName` в
    `lib/fonts.js` при чтении настройки: serif переходит в Georgia, а не в пиксельный шрифт

## Traps

- **The backend loads its dependencies from the root `node_modules`.** `webui/backend/package.json` holds only `better-sqlite3`, because that one is compiled and has to match the runtime that loads it: the tests run on plain Node with the copy in `webui/backend/node_modules`, the app runs on Electron with the copy in the root. `npm run check:deps` fails when a runtime dependency is missing from the root file, and CI runs it. A new backend dependency goes into the root `package.json` too.
- **`webui/run.sh` and `pyproject.toml` are leftovers.** The project was a Python app with a FastAPI backend once. `run.sh` installs `requirements.txt` and starts `uvicorn`, and neither exists now; `pyproject.toml` carries the mdformat, ruff and pre-commit tooling the hooks use, and a `tui` group for a text interface that was never built. There is no Python in the application.
- **The last line of `docs/CONTRIBUTING.md` names two scripts that do not exist.** It asks for `npm run check` and `npm run test` from the root. The root has `check:backend`, `check:frontend`, `test:backend`, `test:frontend` and `test:e2e`. Run the ones that exist.
- **The file is the truth and the index is a cache.** Every write goes to the Markdown file first. `notes.db` can be deleted and rebuilt from the folder, so an index update is never the only copy of anything. `indexAllFiles` skips a note the index already holds, comparing text, modification time and place, which means a file changed outside the app is picked up by the watcher rather than by the index.
- **The FTS index uses a trigram tokenizer, and the ranking lives in `search.js`.** The first version used `unicode61`, which indexes whole words and silently dropped `сеть` for «подсеть» and `rag` for «fragment». The tokenizer is the reason a search matches inside a word, and the score and the excerpts are still computed in `search.js` over the rows the index returns.
- **The port is not a constant in the packaged app.** `electron/main.cjs` starts the backend with `{ port: 0 }` and reads the port back, then sets `ALLOWED_ORIGINS` afterwards, because the port is known only once the server binds. `appOrigins` reaches the clipper routes as a function for the same reason: a list captured at registration time left the development defaults in place and made a packaged app refuse its own origin.
- **Nothing reads the keychain while the app opens.** After an update the signature changes, macOS asks for the login password before `safeStorage` decrypts, and the backend (in the main process) stands still behind that dialog: no window content, no `/health`. So `GET /api/settings` never decrypts: it answers `git_token_set: true|false` (this computer only, like the token itself) and no `git_token`. The text comes from `GET /api/settings/secret?key=git_token` (this computer only), and the page asks for it only where it is used: the repository and branch lists, when the sync part of Settings is in view. Git routes call `revealSecret` themselves. A new reader of `git_token` goes through the secret route, never through the settings object, and `startServer` must not touch `safeStorage` (`startup-keychain.test.js` fails if it does). Saving: an empty `git_token` and `git_token_set` are ignored, because the form saves the whole object before the token is revealed; only a text sets the token and only `null` clears it (`resetGitAuth`).
- **The terminal does not go through the API.** It lives in the Electron main process under node-pty, and the page reaches it only through `electron/preload.cjs`, which exposes `window.monosTerminal`. The backend has no terminal route, and the window the app opens for printing gets no preload at all. A terminal route in the backend would put a shell on the network.
- **A sync commits before it pulls.** `/api/git/sync` stages and commits locally, then pulls, then pushes. The other order fails outright when both devices changed the same note, because git refuses to pull into uncommitted local changes. That is the exact case the sync exists for.
- **Network git goes through `gitExecAsync`.** The backend runs inside the main process, so a synchronous `fetch`, `pull` or `push` freezes the window, the terminal and every request for the length of the round trip. Only quick local git calls, such as status, add, commit and rev-parse, stay on the synchronous `gitExec`.
- **A new file under `webui/frontend/src/lib/` needs two things.** A sibling `foo.test.js`, and a line in `docs/LIB.md`. `node --test docs/docs-freshness.test.js` fails on a module without a test or on a module the map does not mention, and CI runs that file.
- **Two locales, no fallback.** Every string in `webui/frontend/src/lib/strings.js` exists in the `en` and in the `ru` block, and a test compares the key sets. A key in one block only fails the suite.
- **Theme values come from `lib/themes.js`.** Components read CSS variables and never hardcode a colour. A size is written `text-[length:var(--text-whisper)]`, because Tailwind reads a bare `var()` as a colour, and a literal `px` size ignores the interface size setting.

- **A note in the trash is keyed by its place under `.trash/`, and the API names it by where it came from.** The index row of a trashed note has `path = notes/.trash/Projects/Plan.md`, `original_path = notes/Projects/Plan.md` and `trashed_at` (all three come from the file and its `.trash.json` sidecar, `trash-store.js`). `noteCardPayload` answers `path` = the original and `trashPath` = the real one, because the trash page restores by `path` and an undo restores by the path it deleted. Never ask `notes_index WHERE path = ?` with a path from a request to learn whether a note is in the trash: it is not there under that path; use `findTrashedRow(db, appPath)` (`trash.js`). Everything that lists live notes still filters `trashed_at`, and `listAttachments` reads the notes in the trash from the folder they came from, or a picture only a trashed note shows would be offered for deletion. Never write a new "trashed" state into the index alone: the file moves first (`moveNoteToTrash`).
- **`resolveNotesPath` refuses any segment that starts with a dot.** `.git`, `.monos` and `.trash` are not places a request may name (a write into `.git/config` is code execution on the next git call). The app reaches its own files by absolute paths; a route that must name a hidden path passes `allowHidden` and says why. The path is also made canonical there (`./`, `//`, a trailing slash, `a/../b`), and a route that looks the note up in the index uses `relPath(fullPath)`, never the string it was sent.
- **Every API error is `{ detail, code }`.** Throw `httpError(status, message, code)` and answer with `sendError(res, error)` (`api-errors.js`): an error raised on purpose keeps its words, anything else is logged and answered as a 500 `internal` without its message, and `scrubPaths` takes this computer's folders out of every `detail`. A route that writes `res.status(409).json({ detail })` by hand still gets the default code for 409. Unknown `/api/*` addresses are a JSON 404.
- **Icons and colours of folders: the file is the truth** (`.monos/folders.json`, `folder-config.js`). Change them only through `setFolderConfig`/`moveFolderConfig`/`removeFolderConfig`, which write the file and then the `folder_config` table; `relocateIndexRows` calls the move for you.
- **HTML made from a note goes through `html-safety.js`.** The print sheet and the published site run `sanitizeHtml` over what Markdown produced, and a link target is judged by the scheme a browser would read (entities decoded, whitespace and control characters removed, then an allow-list). Do not add a second place that renders note HTML without it.
- **A test sets `NOTES_ROOT` before any import that reaches `config.js`.** `ROOT_DIR` and `NOTES_DIR` are read once, when the module loads, and a static `import` of `utils.js`, `note-lock.js` or `indexing.js` at the top of a test file loads it before the first line runs. The test then indexes the real repository's `notes/` and `.data/notes.db`. Use `support/vault.js` (`bootVault`), or import dynamically after setting the variable.

## Style / safety rails

- **A note is valid, portable Markdown at every moment.** Never trade the file for index speed, a preview or a convenience.
- **The frontend never touches the disk.** It calls the API.
- **Both locales, always.** There is no fallback to English.
- **No remote assets.** The font is shipped in the repository for that reason, and no telemetry, account or analytics surface exists.
- **No personal notes in the repository.** The `notes/` folder is runtime data.
- **Comments explain why, never what.**
- **A new dependency is a new thing in the shipped app.** The desktop build copies the root `node_modules` into the artefact, so weigh one before adding it.

## Where the product truth lives

`PRODUCT.md` holds it. Read it before changing the behaviour of the app, and write the change there when the behaviour changes.
