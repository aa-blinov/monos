const MARKDOWN_CLIPBOARD_PATTERN = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s+\S|\d+\.\s+\S|>\s+\S|```|~~~|---\s*$|\[[ xX]\]\s+\S)|(\*\*[^*]+\*\*|__[^_]+__|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|`[^`]+`|\[\[[^\]]+\]\])/m;

function clipboardTypes(dataTransfer) {
  return [...(dataTransfer?.types || [])].map((type) => String(type).toLowerCase());
}

export function markdownTextFromClipboard(dataTransfer) {
  if (!dataTransfer) return '';
  const explicitMarkdown = dataTransfer.getData?.('text/markdown') || '';
  if (explicitMarkdown.trim()) return explicitMarkdown;
  if (clipboardTypes(dataTransfer).includes('text/html')) return '';

  const text = dataTransfer.getData?.('text/plain') || '';
  return MARKDOWN_CLIPBOARD_PATTERN.test(text) ? text : '';
}
