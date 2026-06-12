function quoteYamlString(value) {
  return JSON.stringify(String(value || ''));
}

function formatTags(tags = []) {
  return `[${tags.map((tag) => quoteYamlString(tag)).join(', ')}]`;
}

function splitFrontmatter(content) {
  const rawContent = String(content || '');
  const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { frontmatter: '', body: rawContent };

  return {
    frontmatter: match[1],
    body: rawContent.slice(match[0].length),
  };
}

export function upsertFrontmatter(content, metadata = {}) {
  const { frontmatter, body } = splitFrontmatter(content);
  const reservedKeys = new Set(['title', 'category', 'tags']);
  const preservedLines = frontmatter
    .split(/\r?\n/)
    .filter((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex === -1) return line.trim();
      return !reservedKeys.has(line.slice(0, separatorIndex).trim().toLowerCase());
    });

  const lines = [];
  if (metadata.title) lines.push(`title: ${quoteYamlString(metadata.title)}`);
  if (metadata.category) lines.push(`category: ${quoteYamlString(metadata.category)}`);
  lines.push(`tags: ${formatTags(metadata.tags || [])}`);
  lines.push(...preservedLines);

  return `---\n${lines.join('\n')}\n---\n\n${body.replace(/^\s*\n/, '')}`;
}
