import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeUrl, sanitizeHtml } from './html-safety.js';

// B7: a link is judged by the scheme a browser would read, not by the text as written.
test('a scheme written with entities, whitespace or capitals is still the scheme it spells', () => {
  for (const value of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '&#106;avascript:alert(3)',
    '&#x6a;avascript:alert(3)',
    'java&#x09;script:alert(4)',
    'java&Tab;script:alert(4)',
    'java\nscript:alert(1)',
    ' \tjavascript:alert(1)',
    'jav&#x0A;ascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'java&colon;script&colon;alert(1)',
    'javascript&colon;alert(1)',
  ]) {
    assert.equal(isSafeUrl(value), false, value);
  }
});

test('web, mail, phone, anchor and relative targets stay', () => {
  for (const value of ['https://example.com/a?b=1&amp;c=2', 'http://x.y', 'mailto:a@b.c', 'tel:+123', '#section', '?q=1', 'other.md', '../up/Note%20x.md', '_attachments/a b.png', 'a:b.md/c', '']) {
    assert.equal(isSafeUrl(value), value === 'a:b.md/c' ? false : true, value);
  }
  assert.equal(isSafeUrl('data:image/png;base64,AAAA', { image: true }), true);
  assert.equal(isSafeUrl('data:image/svg+xml;base64,AAAA', { image: true }), false);
  assert.equal(isSafeUrl('data:image/png;base64,AAAA'), false, 'a link may not be a data URL');
});

test('scripts, frames, forms, handlers and styles do not survive; the text stays visible', () => {
  const html = sanitizeHtml('<p onclick="x()">a</p><script>alert(1)</script><iframe src="//e"></iframe><form action="/x"><input name=q></form>'
    + '<img src="x.png" onerror="alert(1)" srcset="a"><a href="javascript:1" style="x">l</a><style>b{}</style><svg onload=1><circle/></svg><object data=x></object>');
  assert.doesNotMatch(html, /<(script|iframe|form|style|svg|object)|<[^>]*(onclick|onerror|onload|srcset|style=|javascript:)/i);
  assert.match(html, /alert\(1\)/, 'a note that talks about a script still reads');
  assert.match(html, /<img src="x\.png">/);
});

test('allowed markup keeps its meaning, and a link gets rel="noopener noreferrer"', () => {
  const html = sanitizeHtml('<h2 class="x">T</h2><a href="https://example.com/?a=1&amp;b=2" title="t">go</a><table><tr><td colspan="2" align="left">c</td></tr></table>'
    + '<input type="checkbox" checked disabled><input type="text" value="x"><ol start="3"><li>i</li></ol>');
  assert.match(html, /<h2 class="x">T<\/h2>/);
  assert.match(html, /<a href="https:\/\/example\.com\/\?a=1&amp;b=2" title="t" rel="noopener noreferrer">go<\/a>/);
  assert.match(html, /<td colspan="2" align="left">/);
  assert.match(html, /<input type="checkbox" checked disabled>/);
  assert.doesNotMatch(html, /type="text"/);
  assert.match(html, /<ol start="3">/);
});

test('a half-written tag and a quote that never closes are text, and a long run of them is quick', () => {
  assert.equal(sanitizeHtml('a < b and <b'), 'a &lt; b and &lt;b');
  const started = Date.now();
  sanitizeHtml('<a x="'.repeat(20000));
  sanitizeHtml('<'.repeat(200000));
  assert.ok(Date.now() - started < 3000, 'no quadratic scan');
});
