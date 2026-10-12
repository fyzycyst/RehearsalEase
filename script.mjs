// Strip only complete destinations; unmatched syntax stays literal.
function linkLabels(text) {
  const opener = /!?\[([^\]]*)\]\(/g;
  let output = '', consumed = 0, match;
  while ((match = opener.exec(text))) {
    let depth = 1, end = opener.lastIndex;
    for (; end < text.length && depth; end++) {
      if (text[end] === '\\') { end++; continue; }
      if (text[end] === '(') depth++;
      if (text[end] === ')') depth--;
    }
    if (depth) break;
    output += text.slice(consumed, match.index) + match[1];
    consumed = end;
    opener.lastIndex = end;
  }
  return output + text.slice(consumed);
}
function inlineText(text) {
  // Code spans bypass link and emphasis transformations entirely.
  return text.split(/(`+[^`]*`+)/g).map(part => {
    const code = part.match(/^(`+)([^`]*)\1$/);
    if (code) return code[2];
    return linkLabels(part)
      .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
      .replace(/(\*\*|~~)(.+?)\1/g, '$2')
      .replace(/(^|[^\w])__(?=\S)(.+?\S|\S)__(?!\w)/g, '$1$2')
      .replace(/(^|[^\w])_(?=\S)(.+?\S|\S)_(?!\w)/g, '$1$2')
      .replace(/\*([^\n]+?)\*/g, '$1');
  }).join('');
}
// Text transformation only: consumers must render this with textContent.
export function prepareScript(raw) {
  let fenced = false;
  const lines = raw.replace(/\r\n?/g, '\n').split('\n').map(line => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return ''; }
    if (fenced) return line;
    return inlineText(line.replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s*(?:[-+*]|\d+[.)])\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/^\s*\[[^\]]+\]:\s+\S+.*$/, ''));
  });
  const text = lines.join('\n').trim();
  const segmenter = new Intl.Segmenter('en', {granularity:'sentence'});
  const sentences = text.split(/\n\s*\n/).flatMap(paragraph =>
    [...segmenter.segment(paragraph.replace(/\n/g, ' '))].map(item => item.segment.trim()).filter(Boolean));
  return {text, sentences};
}
export function parseTarget(minutes, seconds) {
  if (!/^\d+$/.test(minutes) || !/^\d+$/.test(seconds)) return null;
  const m = Number(minutes), s = Number(seconds), total = m * 60 + s;
  return Number.isSafeInteger(total) && s <= 59 && total > 0 ? total : null;
}
