/** Kebab-case ASCII identifier part: accents stripped, camelCase split, other characters to '-'. */
export function slug(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const REPLACE: Array<[RegExp, string]> = [
  [/[‘’‚′]/g, "'"],
  [/[“”„«»]/g, '"'],
  [/[‐-―]/g, '-'],
  [/…/g, '...'],
  [/×/g, 'x'],
  [/[←-⇿]/g, '->'],
  [/[   ]/g, ' '],
];

/** A source name made fit for the interface (no typographic characters it forbids, single spaces). */
export function cleanName(s: string): string {
  let out = s;
  for (const [re, by] of REPLACE) out = out.replace(re, by);
  return out.replace(/\s+/g, ' ').trim();
}
