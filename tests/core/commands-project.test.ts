import { describe, expect, it } from 'vitest';
import { addObject } from '@/core/commands/objects';
import {
  addCustomObject,
  deleteCustomObject,
  renameProject,
  setBackground,
  updateBackground,
  updateSettings,
} from '@/core/commands/project';
import { createObjectFromSize } from '@/core/model/factory';
import type { Background, CustomObjectDef } from '@/core/model/types';
import { emptyProject, levelId, lvl, noop, refuse, run } from './helpers';

const def = (over: Partial<CustomObjectDef> = {}): CustomObjectDef => ({
  id: 'c1',
  name: 'Mon meuble',
  shape: 'rect',
  width: 80,
  depth: 40,
  height: 90,
  color: '#abc',
  lshape: null,
  pose: 'floor',
  ...over,
});

const bg = (over: Partial<Background> = {}): Background => ({
  imageId: 'img1',
  widthPx: 1000,
  heightPx: 800,
  scale: 0.5,
  x: 0,
  y: 0,
  rotation: 0,
  opacity: 0.5,
  locked: false,
  visible: true,
  ...over,
});

describe('renameProject', () => {
  it('trims; refuses blank; no-op when unchanged', () => {
    const p = emptyProject();
    expect(run(p, renameProject("  Maison d'été ")).name).toBe("Maison d'été");
    expect(refuse(p, renameProject('   '))).toBe('Nom invalide');
    noop(p, renameProject('Maison'));
  });
});

describe('updateSettings', () => {
  it('updates the given settings only', () => {
    const p = emptyProject();
    const next = run(p, updateSettings({ gridStep: 5, defaultWallThickness: 25 }));
    expect(next.settings).toEqual({ ...p.settings, gridStep: 5, defaultWallThickness: 25 });
  });

  it('refuses non-positive or non-finite values without partial change', () => {
    const p = emptyProject();
    for (const patch of [{ gridStep: 0 }, { gridStep: -1 }, { partitionThickness: NaN }, { gridStep: 5, defaultCeilingHeight: Infinity }]) {
      expect(refuse(p, updateSettings(patch))).toBe('Valeur invalide');
    }
    noop(p, updateSettings({ gridStep: 10 }));
    noop(p, updateSettings({}));
  });
});

describe('custom objects', () => {
  it('adds a definition', () => {
    const p = emptyProject();
    expect(run(p, addCustomObject(def())).customObjects['c1']).toEqual(def());
  });

  it('refuses a duplicate id, a blank name, bad sizes and bad L notches', () => {
    const p = run(emptyProject(), addCustomObject(def()));
    expect(refuse(p, addCustomObject(def()))).toBe('Objet déjà enregistré');
    expect(refuse(p, addCustomObject(def({ id: 'c2', name: ' ' })))).toBe('Nom invalide');
    expect(refuse(p, addCustomObject(def({ id: 'c2', width: 0 })))).toBe('Dimension invalide');
    expect(refuse(p, addCustomObject(def({ id: 'c2', height: NaN })))).toBe('Dimension invalide');
    const l = def({ id: 'c2', shape: 'lshape', lshape: { notchWidth: -1, notchDepth: 5 } });
    expect(refuse(p, addCustomObject(l))).toBe('Dimension invalide');
  });

  it('deletes an unused definition', () => {
    const p = run(emptyProject(), addCustomObject(def()));
    expect(run(p, deleteCustomObject('c1')).customObjects).toEqual({});
  });

  it('refuses to delete a definition used by a placed object, on any level', () => {
    let p = run(emptyProject(), addCustomObject(def()));
    const o = createObjectFromSize({ kind: 'custom', customObjectId: 'c1' }, 0, 0, { width: 80, depth: 40, height: 90 }, 'M', '#abc');
    p = run(p, addObject(levelId(p), o));
    expect(refuse(p, deleteCustomObject('c1'))).toBe('Objet utilisé dans le plan');
    expect(refuse(p, deleteCustomObject('nope'))).toBe('Objet introuvable');
  });
});

describe('background', () => {
  it('sets then removes a background', () => {
    const p = emptyProject();
    const withBg = run(p, setBackground(levelId(p), bg()));
    expect(lvl(withBg).background).toEqual(bg());
    expect(lvl(run(withBg, setBackground(levelId(p), null))).background).toBeNull();
    noop(p, setBackground(levelId(p), null));
  });

  it('clamps the opacity and refuses a bad scale or size on set', () => {
    const p = emptyProject();
    const lv = levelId(p);
    expect(lvl(run(p, setBackground(lv, bg({ opacity: 3 })))).background!.opacity).toBe(1);
    expect(refuse(p, setBackground(lv, bg({ scale: 0 })))).toBe('Échelle invalide');
    expect(refuse(p, setBackground(lv, bg({ widthPx: 0 })))).toBe('Dimension invalide');
    expect(refuse(p, setBackground(lv, bg({ x: NaN })))).toBe('Position invalide');
  });

  it('updates a background: opacity clamped 0..1, scale > 0, imageId untouched', () => {
    const base = emptyProject();
    const p = run(base, setBackground(levelId(base), bg()));
    const lv = levelId(p);
    expect(lvl(run(p, updateBackground(lv, { opacity: 1.7 }))).background!.opacity).toBe(1);
    expect(lvl(run(p, updateBackground(lv, { opacity: -2 }))).background!.opacity).toBe(0);
    const next = run(p, updateBackground(lv, { scale: 0.25, x: 10, locked: true, visible: false, rotation: 90 }));
    expect(lvl(next).background).toEqual(bg({ scale: 0.25, x: 10, locked: true, visible: false, rotation: 90 }));
    expect(refuse(p, updateBackground(lv, { scale: 0 }))).toBe('Échelle invalide');
    expect(refuse(p, updateBackground(lv, { scale: -1 }))).toBe('Échelle invalide');
    expect(refuse(p, updateBackground(lv, { opacity: NaN }))).toBe('Position invalide');
    noop(p, updateBackground(lv, { scale: 0.5, opacity: 0.5 }));
  });

  it('refuses an update on a level without background', () => {
    const p = emptyProject();
    expect(refuse(p, updateBackground(levelId(p), { opacity: 1 }))).toBe('Aucune image de fond');
  });
});
