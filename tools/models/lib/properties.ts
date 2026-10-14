/**
 * Java .properties reader (the catalog format of Sweet Home 3D libraries): `key=value`,
 * `key: value` or `key value`, `#` and `!` comments, `\uXXXX` escapes, lines continued by a
 * trailing backslash (leading blanks of the next line dropped), escaped separators.
 */
export function parseProperties(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!.replace(/^[ \t\f]+/, '');
    if (line === '' || line.startsWith('#') || line.startsWith('!')) continue;
    while (endsWithContinuation(line) && i + 1 < lines.length) {
      line = line.slice(0, -1) + lines[++i]!.replace(/^[ \t\f]+/, '');
    }
    let k = 0;
    let key = '';
    for (; k < line.length; k++) {
      const c = line[k]!;
      if (c === '\\') {
        key += line.slice(k, k + 2);
        k++;
        continue;
      }
      if (c === '=' || c === ':' || c === ' ' || c === '\t' || c === '\f') break;
      key += c;
    }
    let rest = line.slice(k).replace(/^[ \t\f]*/, '');
    if (rest.startsWith('=') || rest.startsWith(':')) rest = rest.slice(1).replace(/^[ \t\f]*/, '');
    out.set(unescape(key), unescape(rest));
  }
  return out;
}

/** True when the line ends with an odd number of backslashes. */
function endsWithContinuation(line: string): boolean {
  let n = 0;
  for (let i = line.length - 1; i >= 0 && line[i] === '\\'; i--) n++;
  return n % 2 === 1;
}

function unescape(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, e: string) => {
    if (e.length === 5) return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e === 't') return '\t';
    if (e === 'n') return '\n';
    if (e === 'r') return '\r';
    if (e === 'f') return '\f';
    return e;
  });
}
