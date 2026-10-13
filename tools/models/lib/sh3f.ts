import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseProperties } from './properties.ts';
import { unzipTo } from './fetch.ts';
import type { RawItem } from './types.ts';

const num = (v: string | undefined): number | undefined => (v === undefined || v.trim() === '' ? undefined : Number(v));

/**
 * The models of a Sweet Home 3D library archive (zip holding a .sh3f, itself a zip holding
 * PluginFurnitureCatalog*.properties and the models): one RawItem per `#n` index, with the
 * French name when the library has one.
 */
export function readSh3fLibrary(archive: string, dir: string, library: string, defaultLicense: string): RawItem[] {
  unzipTo(archive, dir);
  const sh3f = readdirSync(dir).find((f) => f.toLowerCase().endsWith('.sh3f'));
  if (!sh3f) throw new Error(`no .sh3f in ${archive}`);
  const lib = unzipTo(path.join(dir, sh3f), path.join(dir, 'lib'));
  const props = parseProperties(readFileSync(path.join(lib, 'PluginFurnitureCatalog.properties'), 'latin1'));
  const frFile = path.join(lib, 'PluginFurnitureCatalog_fr.properties');
  const fr = existsSync(frFile) ? parseProperties(readFileSync(frFile, 'latin1')) : new Map<string, string>();
  const items: RawItem[] = [];
  const seen = new Set<string>();
  for (let n = 1; props.has(`id#${n}`); n++) {
    const get = (k: string) => props.get(`${k}#${n}`);
    // a library may list the same model twice (in two categories): the first one is kept
    if (seen.has(get('id')!)) continue;
    seen.add(get('id')!);
    const model = get('model')!;
    const rot = get('modelRotation');
    items.push({
      source: 'sh3d',
      library,
      key: get('id')!.split('#').pop()!,
      sourceId: get('id')!,
      name: get('name')!,
      nameFr: fr.get(`name#${n}`),
      category: get('category'),
      tags: (get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean),
      width: num(get('width')),
      depth: num(get('depth')),
      height: num(get('height')),
      elevation: num(get('elevation')),
      creator: get('creator'),
      license: get('license') || defaultLicense,
      modelPath: path.join(lib, model.replace(/^\//, '')),
      iconPath: get('icon') ? path.join(lib, get('icon')!.replace(/^\//, '')) : undefined,
      modelRotation: rot ? rot.split(/\s+/).map(Number) : undefined,
      doorOrWindow: get('doorOrWindow') === 'true',
      staircase: props.has(`staircaseCutOutShape#${n}`),
    });
  }
  return items;
}
