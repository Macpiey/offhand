/**
 * Minimal, safe markdown renderer for agent replies. HTML-escapes first, then
 * applies a small whitelist: fenced code, inline code, bold, italics,
 * headings, bullet lists, links (https only). No dependency, no raw HTML.
 */
export function renderMarkdown(src: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Pull fenced code blocks out before other processing.
  const blocks: string[] = [];
  let text = src.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code: string) => {
    blocks.push(`<pre class="md-code">${esc(code.replace(/\n$/, ''))}</pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });

  text = esc(text);

  const inline = (s: string) =>
    s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|\s)\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(
        /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
      );

  const lines = text.split('\n');
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(li[1]!)}</li>`);
      continue;
    }
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
    if (h) {
      const level = Math.min(h[1]!.length + 2, 5); // h3..h5 — never compete with app chrome
      out.push(`<h${level}>${inline(h[2]!)}</h${level}>`);
    } else if (line.trim() === '') {
      out.push('<br/>');
    } else {
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  if (inList) out.push('</ul>');

  return out
    .join('')
    .replace(/(<br\/>)+/g, '<br/>')
    .replace(/\u0000(\d+)\u0000/g, (_m, i: string) => blocks[Number(i)] ?? '');
}
