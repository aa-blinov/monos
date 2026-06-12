import { marked } from 'marked';

const allowedPreviewTags = new Set([
  'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DEL', 'EM', 'H1', 'H2', 'H3',
  'H4', 'H5', 'H6', 'HR', 'I', 'INPUT', 'LI', 'OL', 'P', 'PRE', 'S',
  'STRONG', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL',
]);
const dropPreviewTags = new Set(['IFRAME', 'OBJECT', 'SCRIPT', 'STYLE']);

function isSafeHref(value) {
  const href = String(value || '').trim();
  return /^(https?:|mailto:|tel:|#|\/(?!\/)|\.{0,2}\/)/i.test(href);
}

export function stripFrontmatter(content) {
  return String(content || '').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trim();
}

export function sanitizePreviewHtml(html) {
  if (typeof document === 'undefined') return '';
  const template = document.createElement('template');
  template.innerHTML = html;

  for (const node of [...template.content.querySelectorAll('*')]) {
    if (dropPreviewTags.has(node.tagName)) {
      node.remove();
      continue;
    }

    if (!allowedPreviewTags.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      continue;
    }

    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || name === 'style') {
        node.removeAttribute(attr.name);
        continue;
      }

      const isLinkAttr = node.tagName === 'A'
        && (name === 'href' || name === 'title' || name === 'target' || name === 'rel');
      const isTableAttr = ['TH', 'TD'].includes(node.tagName)
        && (name === 'align' || name === 'colspan' || name === 'rowspan');
      const isCheckboxAttr = node.tagName === 'INPUT'
        && (name === 'type' || name === 'checked' || name === 'disabled');

      if (!isLinkAttr && !isTableAttr && !isCheckboxAttr) {
        node.removeAttribute(attr.name);
      }
    }

    if (node.tagName === 'A') {
      if (!isSafeHref(node.getAttribute('href'))) node.removeAttribute('href');
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noreferrer');
    }

    if (node.tagName === 'INPUT') node.setAttribute('disabled', '');
  }

  return template.innerHTML;
}

export function renderMarkdownPreview(content) {
  const body = stripFrontmatter(content);
  if (!body) return '';
  return sanitizePreviewHtml(marked.parse(body));
}
