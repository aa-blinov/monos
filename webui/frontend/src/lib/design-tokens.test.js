import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The design system, as an executable contract.
 *
 * Every scale below was measured from the code first and documented to match,
 * not the other way round. What this file protects is not the current values —
 * it is the *set*: a value that is not on its scale is drift, and drift is how
 * a codebase that is technically consistent ends up visually arbitrary.
 *
 * Two spellings of the same number are allowed for icons (`size="16"` and
 * `w-4 h-4`) because both are unambiguous; what is forbidden is a number that
 * is not on the scale.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..');
const files = [
  ...fs.readdirSync(path.join(SRC, 'components'))
    .filter((f) => f.endsWith('.svelte'))
    .map((f) => path.join(SRC, 'components', f)),
  path.join(SRC, 'App.svelte'),
  path.join(SRC, 'app.css'),
];

const read = (file) => fs.readFileSync(file, 'utf-8');

/** Control and icon heights live on the 4px grid, no holes. */
const CONTROL_SCALE = [0, 24, 28, 32, 36, 40, 44];
/** Icon optical sizes: inline, dense row, default toolbar, page level. */
const ICON_SCALE = [12, 14, 16, 20, 24];
/** Spacing steps that live on the 4px grid. */
const SPACING_SCALE = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40, 48, 64];
/**
 * Corners by role. `xl` is the single container radius — cards, modals and
 * panels are the same kind of surface, so they are the same rounded square;
 * density changes their size, never their shape. `2xl` and `3xl` used to let
 * cards round differently per density while modals stayed square, which is
 * exactly the drift this list now prevents.
 */
// `none` — явный ноль. Нужен не для красоты, а чтобы снять радиус, который
// достался по наследству: например `code` внутри `pre` получает форму
// инлайн-чипа от селектора для `code`, и без явного обнуления блок кода
// остаётся со скруглённым внутренним углом.
const RADIUS_SCALE = ['none', 'sm', 'md', 'lg', 'xl', 'full'];
/** The radius a card, a modal and a panel must share. */
const CONTAINER_RADIUS = 'xl';
/** The same scale in px, for radii written directly in CSS. */
const CSS_RADIUS_PX = [2, 6, 8, 12];
/** What each documented token must claim, in px. */
const CSS_RADIUS_PX_BY_TOKEN = { sm: 2, md: 6, lg: 8, xl: 12 };

const TW_SPACING = {
  0: 0, 0.5: 2, 1: 4, 1.5: 6, 2: 8, 2.5: 10, 3: 12, 3.5: 14, 4: 16,
  5: 20, 6: 24, 7: 28, 8: 32, 9: 36, 10: 40, 11: 44, 12: 48, 14: 56, 16: 64,
};

test('heights on buttons, inputs and icon buttons stay on the control scale', () => {
  const offenders = [];
  // h-N is a control height unless it is paired with w-N on an icon.
  const controlTag = /<(button|input|select|textarea)\b[^>]*\bclass="([^"]*)"/g;
  for (const file of files) {
    const source = read(file);
    for (const [, tag, className] of source.matchAll(controlTag)) {
      for (const m of className.matchAll(/\bh-(\d+(?:\.\d+)?)\b/g)) {
        const px = TW_SPACING[Number(m[1])];
        if (px === undefined || CONTROL_SCALE.includes(px)) continue;
        offenders.push(`${path.basename(file)} <${tag}> h-${m[1]} (${px}px)`);
      }
    }
  }
  assert.deepEqual(offenders, [], `высота контрола вне шкалы ${CONTROL_SCALE.join('/')}: ${offenders.join(', ')}`);
});

test('icons use only the icon scale', () => {
  const offenders = [];
  const iconAttrs = /\b(?:size|w|h)-(\d+(?:\.\d+)?)\b/g;
  const ICON_COMPONENT = /<(?:Icon\.)?[A-Z][A-Za-z]*\s[^>]*class="([^"]*)"[^>]*\/?>/g;

  for (const file of files) {
    const source = read(file);
    // lucide size="N"
    for (const m of source.matchAll(/<[A-Z][A-Za-z]*\b[^>]*\bsize="(\d+)"/g)) {
      if (!ICON_SCALE.includes(Number(m[1]))) offenders.push(`${path.basename(file)} size="${m[1]}"`);
    }
    // class-based w-N h-N / h-N w-N icon sizing
    for (const [, cls] of source.matchAll(ICON_COMPONENT)) {
      const w = cls.match(/\bw-(\d+(?:\.\d+)?)\b/);
      const h = cls.match(/\bh-(\d+(?:\.\d+)?)\b/);
      if (!w || !h || w[1] !== h[1]) continue; // only paired w/h is an icon box
      const px = Number(w[1]) * 4;
      // A paired box at control scale is a tappable icon button, not a glyph.
      if (px >= 28) continue;
      if (!ICON_SCALE.includes(px)) offenders.push(`${path.basename(file)} w-${w[1]} h-${h[1]} (${px}px)`);
    }
  }
  assert.deepEqual(offenders, [], `размер иконки вне шкалы ${ICON_SCALE.join('/')}: ${offenders.join(', ')}`);
});

test('spacing utilities stay on the 4px grid', () => {
  const offenders = [];
  const SPACING_PROP = /\b(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space-y|space-x)-(\d+(?:\.\d+)?)\b/g;
  for (const file of files) {
    for (const m of read(file).matchAll(SPACING_PROP)) {
      const px = TW_SPACING[Number(m[2])];
      if (px === undefined || SPACING_SCALE.includes(px)) continue;
      offenders.push(`${path.basename(file)} ${m[1]}-${m[2]} (${px}px)`);
    }
  }
  assert.deepEqual(offenders, [], `отступ вне сетки: ${offenders.join(', ')}`);
});

test('no arbitrary spacing values — a literal px means the scale was bypassed', () => {
  const offenders = [];
  const ARBITRARY = /\b(?:p|px|py|pt|pb|m|mx|my|mt|mb|ml|mr|gap|space-y|space-x)-\[(?!\s*(?:length:)?var\()[^\]]+\]/g;
  for (const file of files) {
    for (const m of read(file).matchAll(ARBITRARY)) {
      // rem and vh are positions, not spacing steps
      if (/rem|vh|vw|dvh/.test(m[0])) continue;
      offenders.push(`${path.basename(file)} ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, [], `произвольные отступы: ${offenders.join(', ')}`);
});

test('corner radii stay on the radius scale', () => {
  const offenders = [];
  for (const file of files) {
    for (const m of read(file).matchAll(/\brounded-([a-z0-9]+)\b/g)) {
      if (!RADIUS_SCALE.includes(m[1])) offenders.push(`${path.basename(file)} rounded-${m[1]}`);
    }
    // Голое `rounded` — это 4px, шаг мимо шкалы. Проверка выше его не видит:
    // у неё есть дефис в регулярке, и именно поэтому такие углы доживали
    // незамеченными, пока их не посчитали глазами.
    // Разделителем может быть и `:` — так пишутся классы внутри
    // произвольных вариантов Tailwind (`[&_.x]:rounded`), и такой случай
    // проскакивал мимо проверки.
    for (const m of read(file).matchAll(/(^|[\s"'`:])rounded([\s"'`:]|$)/g)) {
      offenders.push(`${path.basename(file)} rounded (4px, вне шкалы)`);
    }
  }
  assert.deepEqual(offenders, [], `радиус вне шкалы: ${offenders.join(', ')}`);
});

test('круглая форма — только там, где она значима', () => {
  // Пилюля — это форма со смыслом: тег, чип, точка цвета, спиннер, сегмент.
  // Квадратная кнопка, нарисованная кругом, — это квадратная кнопка, нарисованная
  // неправильно: глаз сверяет кривизну углов прежде, чем прочтёт хоть слово.
  const offenders = [];
  for (const file of files) {
    for (const m of read(file).matchAll(/class="([^"]*)"/g)) {
      const classes = m[1];
      if (!/\brounded-full\b/.test(classes)) continue;
      // Настоящий квадрат: `w-7` и `h-7` отдельными токенами. `min-w-8` — это
      // не ширина, а минимум, и такие сегменты остаются пилюлями по смыслу.
      const width = /(?:^|\s)w-(\d+)(?=\s|$)/.exec(classes);
      const height = /(?:^|\s)h-(\d+)(?=\s|$)/.exec(classes);
      const size = width && height && width[1] === height[1] ? parseInt(width[1], 10) : 0;
      const dot = /\b[hw]-[0-3]\b/.test(classes);
      // Ореолы и прочая декорация не элементы интерфейса: их форму не видит
      // пользователь как кнопку, и требовать от них квадрат незачем.
      const decoration = /\bblur-/.test(classes) || /pointer-events-none/.test(classes);
      if (size >= 7 && !dot && !decoration) offenders.push(`${path.basename(file)} ${classes.slice(0, 70)}`);
    }
  }
  assert.deepEqual(offenders, [], `круг вместо скруглённого квадрата: ${offenders.join(' | ')}`);
});

test('радиусы, заданные в CSS, тоже лежат на шкале', () => {
  // Классы Tailwind проверяются выше, но радиус можно задать и вручную —
  // и тогда проверка по шкале молча его пропускает.
  const offenders = [];
  for (const file of files) {
    for (const m of read(file).matchAll(/border-radius:\s*([\d.]+)(px|rem)/g)) {
      const value = parseFloat(m[1]) * (m[2] === 'rem' ? 16 : 1);
      if (CSS_RADIUS_PX.includes(Math.round(value * 100) / 100)) continue;
      offenders.push(`${path.basename(file)} border-radius: ${m[1]}${m[2]} (${value}px)`);
    }
  }
  assert.deepEqual(offenders, [], `радиус в CSS вне шкалы: ${offenders.join(', ')}`);
});

test('icon stroke width is one value everywhere', () => {
  const offenders = [];
  for (const file of files) {
    for (const m of read(file).matchAll(/strokeWidth="([\d.]+)"/g)) {
      if (m[1] !== '1.7') offenders.push(`${path.basename(file)} strokeWidth="${m[1]}"`);
    }
  }
  assert.deepEqual(offenders, [], `толщина штриха вне шкалы: ${offenders.join(', ')}`);
});

test('the documented scales in DESIGN.md match the ones enforced here', () => {
  const design = read(path.resolve(SRC, '..', '..', '..', 'DESIGN.md'));
  for (const px of CONTROL_SCALE) {
    assert.ok(design.includes(`${px}px`), `DESIGN.md должен документировать контрол ${px}px`);
  }
  for (const px of [12, 14, 16, 20, 24]) {
    assert.ok(design.includes(`${px}px`), `DESIGN.md должен документировать иконку ${px}px`);
  }
  // Радиусы тоже. Проверки не было — и шкала разъехалась настолько, что
  // карточки скруглялись на 16/24px, а окна не скруглялись вовсе.
  // Смотрим только раздел про углы: `2xl` в таблице высот — другое измерение.
  const radiusSection = design.split('### Corner Radius')[1]?.split('\n### ')[0] || '';
  for (const token of RADIUS_SCALE) {
    assert.ok(radiusSection.includes(`\`${token}\``), `DESIGN.md должен документировать радиус ${token}`);
  }
  for (const token of ['2xl', '3xl']) {
    assert.ok(
      !radiusSection.includes(`| \`${token}\` |`),
      `DESIGN.md больше не документирует радиус ${token}: он выведен из обращения`,
    );
  }
  // Имя токена мало: таблица обязана называть верный размер в пикселях,
  // иначе `sm` можно объявить хоть двадцатью — тест бы не заметил.
  for (const [token, px] of Object.entries(CSS_RADIUS_PX_BY_TOKEN)) {
    const row = new RegExp(`\\| \`${token}\` \\| (\\d+)px \\|`).exec(radiusSection);
    assert.ok(row, `в таблице углов нет строки с размером для ${token}`);
    assert.equal(
      Number(row[1]), px,
      `DESIGN.md обещает ${token} = ${row[1]}px, а по шкале это ${px}px`,
    );
  }
});

test('окна и карточки делят один радиус', () => {
  // Модалка и карточка — одна и та же поверхность. Если у них разные углы,
  // окно выглядит вклеенным поверх доски.
  const shell = read(path.join(SRC, 'components', 'ModalShell.svelte'));
  assert.match(
    shell,
    new RegExp(`rounded-${CONTAINER_RADIUS}\\b`),
    'панель модалки должна использовать радиус контейнера',
  );

  for (const name of ['NoteCard.svelte', 'NoteBoard.svelte', 'TrashView.svelte']) {
    const source = read(path.join(SRC, 'components', name));
    assert.match(
      source,
      new RegExp(`rounded-${CONTAINER_RADIUS}\\b`),
      `${name}: карточки должны использовать радиус контейнера`,
    );
    assert.ok(
      !/rounded-(2xl|3xl)\b/.test(source),
      `${name}: крупные радиусы вышли из обращения`,
    );
  }
});