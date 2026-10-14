/** Kebab-case ASCII identifier part: accents stripped, camelCase split, other characters to '-'. */
export function slug(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const REPLACE: Array<[RegExp, string]> = [
  [/[\u2018\u2019\u201a\u2032]/g, "'"],
  [/[\u201c\u201d\u201e\u00ab\u00bb]/g, '"'],
  [/[\u2010-\u2015]/g, '-'],
  [/\u2026/g, '...'],
  [/\u00d7/g, 'x'],
  [/[\u2190-\u21ff]/g, '->'],
  [/[\u00a0\u2007\u202f]/g, ' '],
];

/** Capital initials the Sweet Home 3D French names write without their accent ("Etagere"). */
const ACCENTED: Array<[RegExp, string]> = [
  [/\bEchelle/g, '\u00c9chelle'],
  [/\bEclairage/g, '\u00c9clairage'],
  [/\bEtabli/g, '\u00c9tabli'],
  [/\bEtag\u00e8re/g, '\u00c9tag\u00e8re'],
  [/\bEtendoir/g, '\u00c9tendoir'],
  [/\bEcran/g, '\u00c9cran'],
  [/\bEvier/g, '\u00c9vier'],
  [/\bEl\u00e9vateur/g, '\u00c9l\u00e9vateur'],
];

/**
 * A source name made fit for the interface: no typographic characters it forbids, single spaces,
 * and the accent of a capital initial restored ("Etagere" -> "Etagere" with its E acute).
 */
export function cleanName(s: string): string {
  let out = s;
  for (const [re, by] of REPLACE) out = out.replace(re, by);
  for (const [re, by] of ACCENTED) out = out.replace(re, by);
  return out.replace(/\s+/g, ' ').trim();
}
