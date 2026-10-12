import { describe, expect, it } from 'vitest';
import { getCatalogEntry } from '@/catalog/catalog';
import { checkSeverityByTarget, computeChecks } from '@/core/checks/computeChecks';
import { displayNames } from '@/core/checks/names';
import type { Check, CheckKind } from '@/core/checks/types';
import { overlapArea, ringsOverlapArea, shapeArea } from '@/core/checks/overlap';
import { intersection } from '@/core/geometry/boolean';
import { deriveLevel } from '@/core/geometry/derived';
import { objectFootprint } from '@/core/geometry/objects';
import { convexParts, isConvexRing } from '@/core/geometry/polygon';
import { createBeam, createCupboard, createObjectFromSize, createOpening, createSlope } from '@/core/model/factory';
import type { Cupboard, CustomObjectDef, Id, Level, Opening, PlacedObject } from '@/core/model/types';
import { findWall, levelFromWalls, rectRoom } from './fixtures';

/** Interior 0..400 x 0..400 (wall axes at -10 and 410, 20 cm thick), ceiling 250. */
const room = (): Level => levelFromWalls(rectRoom(-10, -10, 410, 410));

/** plan-chambre: same room, ceiling 240, slope from x = 197 towards +x, 240 -> 150 over 203. */
function chambre(): Level {
  const level = room();
  level.height = 240;
  const s = createSlope({ x: 197, y: -50 }, { x: 197, y: 450 }, 'right', 203, 240, 150);
  level.slopes[s.id] = s;
  return level;
}

/** A catalog object with the size, name, pose and elevation of its entry. */
function put(level: Level, catalogId: string, x: number, y: number, over: Partial<PlacedObject> = {}): PlacedObject {
  const e = getCatalogEntry(catalogId);
  if (!e) throw new Error(`no catalog entry ${catalogId}`);
  const o = createObjectFromSize({ kind: 'catalog', catalogId }, x, y, e, e.name, e.color, {
    pose: e.pose,
    elevation: e.elevation ?? 0,
    ...over,
  });
  level.objects[o.id] = o;
  return o;
}

/** Top wall (-10, -10) -> (410, -10): dir +x, left = +y = room side; offset o -> center x = o - 10. */
const topWall = (level: Level): Id => findWall(level, -10, -10, 410, -10);

function addCupboard(level: Level, wallId: Id, offset: number, over: Partial<Cupboard> = {}): Cupboard {
  const c = createCupboard(wallId, offset, 'left', over);
  level.cupboards[c.id] = c;
  return c;
}

function addOpening(level: Level, wallId: Id, kind: Opening['kind'], offset: number, over: Partial<Opening> = {}): Opening {
  const o = createOpening(wallId, kind, offset, over);
  level.openings[o.id] = o;
  return o;
}

/**
 * Checks of a deep copy of the level: the tests edit their levels in place, which the identity
 * caches (computeChecks, deriveLevel, deriveVolumes) rightly take for the same level.
 */
function checks(level: Level, custom: Record<Id, CustomObjectDef> = {}): Check[] {
  const copy = structuredClone(level);
  return computeChecks(copy, deriveLevel(copy), custom);
}
const ofKind = (level: Level, kind: CheckKind, custom: Record<Id, CustomObjectDef> = {}): Check[] =>
  checks(level, custom).filter((c) => c.kind === kind);
const summary = (cs: Check[]) => cs.map((c) => ({ kind: c.kind, severity: c.severity, message: c.message, targets: c.targets }));

describe('height under the ceiling', () => {
  it('wardrobe 200 deep under the slope: error with the exact message', () => {
    const level = chambre();
    // 120 wide along y, 60 deep along x: x 330..390, ceiling lowest at x = 390 (154.43)
    const w = put(level, 'wardrobe', 360, 130, { rotation: 90 });
    expect(summary(checks(level))).toEqual([
      {
        kind: 'height',
        severity: 'error',
        message: 'Armoire : monte à 2,00 m, plafond à 1,54 m à cet endroit.',
        targets: [{ kind: 'object', id: w.id }],
      },
    ]);
  });

  it('stairs (catalog Structure) cross the ceiling: no alert; a wardrobe as high does (ruling V2-R16)', () => {
    const level = room(); // ceiling 250
    put(level, 'stairs-straight', 200, 200); // 90 x 300, 270 high
    expect(checks(level)).toEqual([]);
    put(level, 'wardrobe', 80, 200, { height: 270 });
    expect(checks(level).map((c) => c.message)).toEqual(['Armoire : monte à 2,70 m, plafond à 2,50 m à cet endroit.']);
  });

  it('the same wardrobe upslope: nothing', () => {
    const level = chambre();
    put(level, 'wardrobe', 100, 130, { rotation: 90 });
    expect(checks(level)).toEqual([]);
  });

  it('1 cm tolerance, elevation counted (flat ceiling, and upslope of a slope)', () => {
    const level = room();
    const ok = put(level, 'generic-rect', 100, 100, { height: 50, elevation: 200.9 });
    expect(checks(level)).toEqual([]);
    level.objects[ok.id] = { ...ok, elevation: 201.2 };
    expect(checks(level).map((c) => c.message)).toEqual(['Rectangle : monte à 2,51 m, plafond à 2,50 m à cet endroit.']);

    // with a slope on the level, the cheap lower bound (151) does not decide: the exact test does
    const sloped = chambre();
    const o = put(sloped, 'generic-rect', 100, 100, { height: 50, elevation: 190.9 });
    expect(checks(sloped)).toEqual([]);
    sloped.objects[o.id] = { ...o, elevation: 191.2 };
    expect(checks(sloped).map((c) => c.message)).toEqual(['Rectangle : monte à 2,41 m, plafond à 2,40 m à cet endroit.']);
  });

  it('fixed cupboard under the slope: error; ceiling mode: nothing', () => {
    const level = chambre();
    // right wall (410, -10) -> (410, 410): left = -x = room side; x 340..400 at its foot
    const c = addCupboard(level, findWall(level, 410, -10, 410, 410), 210, { doorType: 'sliding' });
    expect(summary(ofKind(level, 'height'))).toEqual([
      {
        kind: 'height',
        severity: 'error',
        message: 'Placard : monte à 2,20 m, plafond à 1,50 m à cet endroit.',
        targets: [{ kind: 'cupboard', id: c.id }],
      },
    ]);
    level.cupboards[c.id] = { ...c, heightMode: 'ceiling' };
    expect(ofKind(level, 'height')).toEqual([]);
  });

  it('a cupboard following the ceiling is never checked, even under a beam between its faces', () => {
    const level = room();
    // fixed beam y 24..36 at 200 cm: over the middle of the cupboard depth, not over its faces
    const beam = createBeam({ x: 0, y: 30 }, { x: 400, y: 30 }, { mode: 'fixed', bottom: 200 });
    level.beams[beam.id] = beam;
    const c = addCupboard(level, topWall(level), 220, { doorType: 'sliding', heightMode: 'ceiling' });
    expect(ofKind(level, 'height')).toEqual([]);
    level.cupboards[c.id] = { ...c, heightMode: 'fixed', height: 210 };
    expect(ofKind(level, 'height').map((x) => x.message)).toEqual(['Placard : monte à 2,10 m, plafond à 2,00 m à cet endroit.']);
  });
});

describe('cupboard top under its plinth (ruling V2-R36)', () => {
  /** Ceiling-mode cupboard x 150..270 on the top wall, y 0..60, plinth 10, gap 2. */
  function low(heightEnd: number): { level: Level; c: Cupboard } {
    const level = room();
    const c = addCupboard(level, topWall(level), 220, { doorType: 'sliding', heightMode: 'ceiling', plinth: 10, gap: 2, depth: 60 });
    // the ceiling goes down from 250 at y = 0 to heightEnd at y = 60 (the front of the cupboard)
    const s = createSlope({ x: -50, y: 0 }, { x: 450, y: 0 }, 'left', 60, 250, heightEnd);
    level.slopes[s.id] = s;
    return { level, c };
  }

  it('a slope added over a ceiling-mode cupboard leaves its top (6) under its plinth (10): error', () => {
    const { level, c } = low(8);
    expect(summary(ofKind(level, 'cupboardHeight'))).toEqual([
      {
        kind: 'cupboardHeight',
        severity: 'error',
        message: 'Placard : pas assez de hauteur sous le plafond.',
        targets: [{ kind: 'cupboard', id: c.id }],
      },
    ]);
    expect(checkSeverityByTarget(checks(level)).get(`cupboard:${c.id}`)).toBe('error');
  });

  it('top just above the plinth, a fixed cupboard or no slope: nothing', () => {
    const { level } = low(12.5); // top 10.5
    expect(ofKind(level, 'cupboardHeight')).toEqual([]);
    const { level: fixed, c: f } = low(8);
    fixed.cupboards[f.id] = { ...f, heightMode: 'fixed', height: 100 };
    expect(ofKind(fixed, 'cupboardHeight')).toEqual([]);
    const flat = room();
    addCupboard(flat, topWall(flat), 220, { doorType: 'sliding', heightMode: 'ceiling', plinth: 10, gap: 2, depth: 60 });
    expect(ofKind(flat, 'cupboardHeight')).toEqual([]);
  });

  it('a level height lowered under gap + plinth, or a beam: error, with the display name', () => {
    const level = room();
    addCupboard(level, topWall(level), 100, { doorType: 'sliding', heightMode: 'ceiling', plinth: 10, gap: 2 });
    addCupboard(level, topWall(level), 300, { doorType: 'sliding', heightMode: 'ceiling', plinth: 10, gap: 2 });
    level.height = 12;
    expect(ofKind(level, 'cupboardHeight').map((x) => x.message)).toEqual([
      'Placard (1) : pas assez de hauteur sous le plafond.',
      'Placard (2) : pas assez de hauteur sous le plafond.',
    ]);
    const beamed = room();
    const b = createBeam({ x: 0, y: 30 }, { x: 400, y: 30 }, { mode: 'fixed', bottom: 11 });
    beamed.beams[b.id] = b;
    addCupboard(beamed, topWall(beamed), 100, { id: 'beamed', doorType: 'sliding', heightMode: 'ceiling', plinth: 10, gap: 2 });
    expect(ofKind(beamed, 'cupboardHeight').map((x) => x.targets)).toEqual([[{ kind: 'cupboard', id: 'beamed' }]]);
  });
});

describe('collisions', () => {
  it('bed and desk overlapping: error', () => {
    const level = room();
    const bed = put(level, 'bed-90', 100, 200, { name: 'Lit' }); // x 55..145
    const desk = put(level, 'desk', 150, 200); // x 80..220
    expect(summary(checks(level))).toEqual([
      {
        kind: 'collision',
        severity: 'error',
        message: 'Lit et Bureau se chevauchent.',
        targets: [
          { kind: 'object', id: bed.id },
          { kind: 'object', id: desk.id },
        ],
      },
    ]);
  });

  it('bed and desk apart or only touching: nothing', () => {
    const level = room();
    put(level, 'bed-90', 100, 200);
    const desk = put(level, 'desk', 300, 200);
    expect(checks(level)).toEqual([]);
    level.objects[desk.id] = { ...desk, x: 215 }; // x 145..285: shares the edge x = 145
    expect(checks(level)).toEqual([]);
  });

  it('rug under a bed: nothing', () => {
    const level = room();
    put(level, 'rug-rect', 100, 200);
    put(level, 'bed-90', 100, 200);
    expect(checks(level)).toEqual([]);
  });

  it('two rugs on top of each other: error; apart: nothing', () => {
    const level = room();
    put(level, 'rug-rect', 100, 200);
    const round = put(level, 'rug-round', 150, 200);
    expect(checks(level).map((c) => c.message)).toEqual(['Tapis et Tapis rond se chevauchent.']);
    level.objects[round.id] = { ...round, x: 300 };
    expect(checks(level)).toEqual([]);
  });

  it('TV onTop on a TV unit: nothing', () => {
    const level = room();
    put(level, 'tv-unit', 200, 50);
    put(level, 'tv', 200, 50, { elevation: 50 });
    expect(checks(level)).toEqual([]);
  });

  it('chair under a desk: nothing; chair under a bed: error', () => {
    const level = room();
    put(level, 'desk', 200, 100); // y 65..135
    put(level, 'chair', 200, 130); // y 105..155
    expect(checks(level)).toEqual([]);

    const other = room();
    put(other, 'bed-90', 100, 200);
    put(other, 'chair', 100, 200);
    expect(summary(checks(other)).map((c) => [c.kind, c.severity, c.message])).toEqual([
      ['collision', 'error', 'Lit 90 et Chaise se chevauchent.'],
    ]);
  });

  it('wall TV at 110 over a low unit of 50: nothing; lowered to 40: error', () => {
    const level = room();
    put(level, 'tv-unit', 200, 22.5); // y 0..45, against the top wall
    const tv = put(level, 'tv-wall', 200, 4); // y 0..8, elevation 110 from the catalog
    expect(tv.elevation).toBe(110);
    expect(checks(level)).toEqual([]);
    level.objects[tv.id] = { ...tv, elevation: 40 };
    expect(checks(level).map((c) => c.message)).toEqual(['Meuble TV et TV murale se chevauchent.']);
  });

  it('a thin onTop object sunk into its support is not a collision with it', () => {
    const level = room();
    put(level, 'tv-unit', 200, 50); // top 50
    put(level, 'generic-rect', 200, 50, { width: 30, depth: 20, height: 1, pose: 'onTop', elevation: 49.4, name: 'Plateau' });
    expect(checks(level)).toEqual([]);
    // the same object posed on the floor overlaps the unit by 0.6 cm, more than half its 1 cm height
    const level2 = room();
    put(level2, 'tv-unit', 200, 50);
    put(level2, 'generic-rect', 200, 50, { width: 30, depth: 20, height: 1, pose: 'floor', elevation: 49.4, name: 'Plateau' });
    expect(checks(level2).map((c) => c.message)).toEqual(['Meuble TV et Plateau se chevauchent.']);
  });

  it('uses the real shape of a custom object (circles with overlapping boxes do not collide)', () => {
    const def: CustomObjectDef = { id: 'c1', name: 'Pot', shape: 'circle', width: 100, depth: 100, height: 80, color: '#ccc', lshape: null, pose: 'floor' };
    const custom = { c1: def };
    const level = room();
    const a = createObjectFromSize({ kind: 'custom', customObjectId: 'c1' }, 100, 100, def, 'Pot', '#ccc');
    const b = createObjectFromSize({ kind: 'custom', customObjectId: 'c1' }, 185, 185, def, 'Pot', '#ccc');
    level.objects[a.id] = a;
    level.objects[b.id] = b;
    expect(checks(level, custom)).toEqual([]);
    level.objects[b.id] = { ...b, x: 163, y: 163 }; // centers 89 apart: the disks overlap
    expect(checks(level, custom).map((c) => c.message)).toEqual(['Pot (1) et Pot (2) se chevauchent.']);
  });

  it('a cupboard collides with an object standing in it', () => {
    const level = room();
    const c = addCupboard(level, topWall(level), 220, { doorType: 'sliding' }); // x 150..270, y 0..60
    const d = put(level, 'dresser', 210, 50); // y 25..75
    const col = ofKind(level, 'collision');
    expect(summary(col)).toEqual([
      {
        kind: 'collision',
        severity: 'error',
        message: 'Commode et Placard se chevauchent.',
        targets: [
          { kind: 'object', id: d.id },
          { kind: 'cupboard', id: c.id },
        ],
      },
    ]);
  });
});

describe('wall overlap', () => {
  it('dresser in a wall: error', () => {
    const level = room();
    const d = put(level, 'dresser', 200, 10); // y -15..35: 15 cm into the top wall
    expect(summary(checks(level))).toEqual([
      { kind: 'wallOverlap', severity: 'error', message: 'Commode : empiète sur un mur.', targets: [{ kind: 'object', id: d.id }] },
    ]);
  });

  it('dresser against the wall face, a rug in the wall, an object outside: nothing', () => {
    const level = room();
    put(level, 'dresser', 200, 25); // y 0..50
    put(level, 'rug-rect', 200, 10);
    put(level, 'plant', 700, 700);
    expect(checks(level)).toEqual([]);
  });

  it('an object entirely inside the wall thickness: error', () => {
    const level = room();
    put(level, 'generic-rect', 200, -10, { width: 10, depth: 10, name: 'Cale' });
    expect(checks(level).map((c) => c.message)).toEqual(['Cale : empiète sur un mur.']);
  });
});

describe('door swing', () => {
  it('armchair in the arc of a single door: error', () => {
    const level = room();
    // offset 210 -> x 158.5..241.5, hinged at x = 158.5 on the room face y = 0, radius 83
    const door = addOpening(level, topWall(level), 'door', 210, { hinge: 'start', swing: 'left' });
    const a = put(level, 'armchair', 200, 60); // x 160..240, y 17.5..102.5
    expect(summary(checks(level))).toEqual([
      {
        kind: 'doorSwing',
        severity: 'error',
        message: "Fauteuil : gêne l'ouverture de la porte.",
        targets: [
          { kind: 'object', id: a.id },
          { kind: 'opening', id: door.id },
        ],
      },
    ]);
  });

  it('the leaf is hinged on the hinge side', () => {
    const level = room();
    const door = addOpening(level, topWall(level), 'door', 210, { hinge: 'start', swing: 'left' });
    // x 165..185, y 65..85: 65 from the start jamb (158.5, 0), 86 from the end jamb (241.5, 0)
    put(level, 'generic-rect', 175, 75, { width: 20, depth: 20, name: 'Caisse' });
    expect(checks(level).map((c) => c.message)).toEqual(["Caisse : gêne l'ouverture de la porte."]);
    level.openings[door.id] = { ...door, hinge: 'end' };
    expect(checks(level)).toEqual([]);
  });

  it('armchair beyond the arc, door opening outwards, sliding door, high or covering object: nothing', () => {
    const level = room();
    const door = addOpening(level, topWall(level), 'door', 210, { hinge: 'start', swing: 'left' });
    const a = put(level, 'armchair', 200, 160); // y from 117.5 > 83
    expect(checks(level)).toEqual([]);
    level.objects[a.id] = { ...a, y: 60 };
    level.openings[door.id] = { ...door, swing: 'right' };
    expect(checks(level)).toEqual([]);
    level.openings[door.id] = { ...door, variant: 'sliding' };
    expect(checks(level)).toEqual([]);
    level.openings[door.id] = door;
    level.objects[a.id] = { ...a, y: 60, elevation: 200 };
    expect(ofKind(level, 'doorSwing')).toEqual([]);
    delete level.objects[a.id];
    put(level, 'rug-rect', 200, 60);
    expect(checks(level)).toEqual([]);
  });

  it('double door: an object in the arc of the second leaf', () => {
    const level = room();
    // width 160 -> x 120..280; leaves of 80 hinged at x = 120 and x = 280
    const door = addOpening(level, topWall(level), 'door', 210, { variant: 'double', width: 160 });
    const p = put(level, 'pouf', 255, 30); // x 230..280, y 5..55
    expect(summary(checks(level)).map((c) => [c.kind, c.message, c.targets])).toEqual([
      [
        'doorSwing',
        "Pouf : gêne l'ouverture de la porte.",
        [
          { kind: 'object', id: p.id },
          { kind: 'opening', id: door.id },
        ],
      ],
    ]);
    // the same object with a single leaf hinged at the start: radius 160 from x = 120 still reaches it
    level.openings[door.id] = { ...door, variant: 'single' };
    expect(ofKind(level, 'doorSwing')).toHaveLength(1);
    // moved to the middle, it is out of both quarter circles of 80
    level.openings[door.id] = door;
    level.objects[p.id] = { ...p, x: 200, y: 110 }; // x 175..225, y 85..135: 101 from both hinges
    expect(ofKind(level, 'doorSwing')).toEqual([]);
  });

  it('hinged cupboard doors: an object in front of a door; sliding doors: nothing', () => {
    const level = room();
    // x 150..270, front y = 60, two doors of 60 hinged at x = 150 and x = 270
    const c = addCupboard(level, topWall(level), 220, { doorCount: 2, doorType: 'hinged' });
    const p = put(level, 'pouf', 185, 95); // x 160..210, y 70..120
    expect(summary(ofKind(level, 'doorSwing'))).toEqual([
      {
        kind: 'doorSwing',
        severity: 'error',
        message: "Pouf : gêne l'ouverture du placard.",
        targets: [
          { kind: 'object', id: p.id },
          { kind: 'cupboard', id: c.id },
        ],
      },
    ]);
    level.cupboards[c.id] = { ...c, doorType: 'sliding' };
    expect(ofKind(level, 'doorSwing')).toEqual([]);
  });
});

describe('cupboard in front of an opening', () => {
  it('in front of a door: error; of a window: warning', () => {
    const level = room();
    const wall = topWall(level);
    const c = addCupboard(level, wall, 220, { doorType: 'sliding' }); // wall interval 160..280
    const door = addOpening(level, wall, 'door', 210); // 168.5..251.5
    expect(summary(ofKind(level, 'cupboardOpening'))).toEqual([
      {
        kind: 'cupboardOpening',
        severity: 'error',
        message: 'Placard : devant une porte.',
        targets: [
          { kind: 'cupboard', id: c.id },
          { kind: 'opening', id: door.id },
        ],
      },
    ]);
    level.openings[door.id] = { ...door, kind: 'window', variant: 'single', width: 120, sillHeight: 90, height: 135 };
    expect(summary(ofKind(level, 'cupboardOpening')).map((x) => [x.severity, x.message])).toEqual([['warning', 'Placard : devant une fenêtre.']]);
  });

  it('opening elsewhere on the wall, or window above a low cupboard: nothing', () => {
    const level = room();
    const wall = topWall(level);
    const c = addCupboard(level, wall, 220, { doorType: 'sliding' });
    const w = addOpening(level, wall, 'window', 350); // 290..410
    expect(checks(level)).toEqual([]);
    level.openings[w.id] = { ...w, offset: 220 };
    level.cupboards[c.id] = { ...c, height: 80 }; // under the 90 sill
    expect(checks(level)).toEqual([]);
  });
});

describe('floating objects', () => {
  it('TV onTop in the air: warning', () => {
    const level = room();
    const tv = put(level, 'tv', 200, 200, { elevation: 70 });
    expect(summary(checks(level))).toEqual([
      { kind: 'floating', severity: 'warning', message: 'TV : aucun support en dessous.', targets: [{ kind: 'object', id: tv.id }] },
    ]);
  });

  it('above a support that is lower: warning; on the floor, on a wall shelf, on a fixed cupboard: nothing', () => {
    const level = room();
    put(level, 'tv-unit', 200, 200);
    const tv = put(level, 'tv', 200, 200, { elevation: 70 });
    expect(ofKind(level, 'floating')).toHaveLength(1);
    level.objects[tv.id] = { ...tv, elevation: 0, x: 200, y: 300 };
    expect(checks(level)).toEqual([]);

    const shelf = room();
    put(shelf, 'shelf-wall', 200, 12.5); // elevation 150, height 3
    put(shelf, 'bedside-lamp', 200, 12.5, { elevation: 153 });
    expect(checks(shelf)).toEqual([]);

    const top = room();
    const c = addCupboard(top, topWall(top), 220, { doorType: 'sliding', height: 150 }); // fixed
    const lamp = put(top, 'bedside-lamp', 210, 30, { elevation: 150.5 });
    expect(checks(top)).toEqual([]);

    // a cupboard following the ceiling (top 248 here) has no level top: it carries nothing
    top.cupboards[c.id] = { ...c, heightMode: 'ceiling' };
    top.objects[lamp.id] = { ...lamp, elevation: 248 };
    expect(ofKind(top, 'floating').map((x) => x.message)).toEqual(['Lampe de chevet : aucun support en dessous.']);
  });
});

describe('cupboard clearance', () => {
  /** Sliding cupboard x 150..270, front at y = 60, and a dresser whose back is at y = back. */
  function facing(back: number): { level: Level; c: Cupboard; d: PlacedObject } {
    const level = room();
    const c = addCupboard(level, topWall(level), 220, { doorType: 'sliding' });
    const d = put(level, 'dresser', 210, back + 25);
    return { level, c, d };
  }

  it('40 cm: warning', () => {
    const { level, c, d } = facing(100);
    expect(summary(checks(level))).toEqual([
      {
        kind: 'cupboardClearance',
        severity: 'warning',
        message: 'Placard : 40 cm de passage devant (60 cm conseillés).',
        targets: [
          { kind: 'cupboard', id: c.id },
          { kind: 'object', id: d.id },
        ],
      },
    ]);
  });

  it('20 cm: error', () => {
    const { level } = facing(80);
    expect(summary(checks(level)).map((x) => [x.kind, x.severity, x.message])).toEqual([
      ['cupboardClearance', 'error', 'Placard : 20 cm de passage devant (60 cm conseillés).'],
    ]);
  });

  it('an object entering the passage by less than 1 cm on a side does not count', () => {
    const level = room();
    addCupboard(level, topWall(level), 220, { doorType: 'sliding' }); // x 150..270
    const d = put(level, 'dresser', 100.5, 105); // x 50.5..150.5, back at y = 80
    expect(checks(level)).toEqual([]);
    level.objects[d.id] = { ...d, x: 101.5 }; // x 51.5..151.5: 1.5 cm into the passage
    expect(checks(level).map((c) => c.message)).toEqual(['Placard : 20 cm de passage devant (60 cm conseillés).']);
  });

  it('80 cm: nothing', () => {
    const { level } = facing(140);
    expect(checks(level)).toEqual([]);
  });

  it('the opposite wall counts; a wall touching the side, an object beside or a rug in front do not', () => {
    const narrow = levelFromWalls(rectRoom(-10, -10, 410, 110)); // interior depth 100
    const c = addCupboard(narrow, topWall(narrow), 220, { doorType: 'sliding' });
    expect(summary(checks(narrow))).toEqual([
      {
        kind: 'cupboardClearance',
        severity: 'warning',
        message: 'Placard : 40 cm de passage devant (60 cm conseillés).',
        targets: [{ kind: 'cupboard', id: c.id }],
      },
    ]);

    const level = room();
    addCupboard(level, topWall(level), 70, { doorType: 'sliding' }); // x 0..120, against the left wall face
    put(level, 'dresser', 170, 85); // x 120..220: beside the strip
    put(level, 'rug-rect', 60, 100);
    expect(checks(level)).toEqual([]);
  });
});

describe('names', () => {
  it('duplicate names get (1), (2); cupboards are "Placard"', () => {
    const level = room();
    const a = put(level, 'desk', 100, 100);
    const b = put(level, 'desk', 300, 300);
    const l = put(level, 'bed-90', 100, 300, { name: 'Lit' });
    const wall = topWall(level);
    const c1 = addCupboard(level, wall, 100);
    const c2 = addCupboard(level, wall, 300);
    const n = displayNames(level);
    expect([n.get(a.id), n.get(b.id), n.get(l.id), n.get(c1.id), n.get(c2.id)]).toEqual(['Bureau (1)', 'Bureau (2)', 'Lit', 'Placard (1)', 'Placard (2)']);
  });

  it('two desks overlapping: "Bureau (1)" and "Bureau (2)"', () => {
    const level = room();
    put(level, 'desk', 200, 100);
    put(level, 'desk', 220, 110);
    expect(checks(level).map((c) => c.message)).toEqual(['Bureau (1) et Bureau (2) se chevauchent.']);
  });
});

describe('memoization and severity map', () => {
  it('same level and custom objects: same result; a new level: recomputed', () => {
    const level = room();
    put(level, 'bed-90', 100, 200);
    put(level, 'desk', 150, 200);
    const custom = {};
    const first = computeChecks(level, deriveLevel(level), custom);
    expect(computeChecks(level, deriveLevel(level), custom)).toBe(first);
    const copy = { ...level };
    const again = computeChecks(copy, deriveLevel(copy), custom);
    expect(again).not.toBe(first);
    expect(again).toEqual(first);
    expect(computeChecks(level, deriveLevel(level), {})).not.toBe(first);
  });

  it('checkSeverityByTarget keeps the worst severity per target', () => {
    const level = room();
    const c = addCupboard(level, topWall(level), 220, { doorType: 'sliding' });
    addOpening(level, topWall(level), 'window', 210); // warning on the cupboard
    const d = put(level, 'dresser', 210, 105); // 20 cm in front: error on both
    const map = checkSeverityByTarget(checks(level));
    expect(map.get(`cupboard:${c.id}`)).toBe('error');
    expect(map.get(`object:${d.id}`)).toBe('error');
    const only = checkSeverityByTarget([
      { id: 'x', kind: 'floating', severity: 'warning', message: '', targets: [{ kind: 'object', id: 'o' }] },
    ]);
    expect([...only.entries()]).toEqual([['object:o', 'warning']]);
  });

  it('check ids are unique', () => {
    const level = room();
    put(level, 'bed-90', 100, 200);
    put(level, 'desk', 150, 200);
    put(level, 'chair', 120, 200);
    put(level, 'tv', 300, 300, { elevation: 80 });
    const out = checks(level);
    expect(out.length).toBeGreaterThan(2);
    expect(new Set(out.map((c) => c.id)).size).toBe(out.length);
  });
});

describe('overlap areas', () => {
  /** Deterministic PRNG (mulberry32). */
  function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it('clipping (clipConvex, convexParts for L shapes) gives the boolean.ts area (rects, circles, L shapes, wall shape)', () => {
    const rand = rng(42);
    const shapes = ['rect', 'circle', 'lshape'] as const;
    const random = (): PlacedObject =>
      createObjectFromSize({ kind: 'catalog', catalogId: 'generic-rect' }, rand() * 200, rand() * 200, { width: 20 + rand() * 150, depth: 20 + rand() * 150, height: 50 }, 'X', '#ccc', {
        rotation: rand() * 360,
        lshape: { notchWidth: 10 + rand() * 40, notchDepth: 10 + rand() * 40 },
        mirrored: rand() < 0.5,
      });
    let compared = 0;
    let overlapping = 0;
    for (let i = 0; i < 300; i++) {
      const a = objectFootprint(random(), shapes[i % 3]);
      const b = objectFootprint(random(), shapes[Math.floor(i / 3) % 3]);
      const exact = shapeArea(intersection([{ outer: a, holes: [] }], b));
      const fast = ringsOverlapArea(a, isConvexRing(a), b, isConvexRing(b));
      expect(Math.abs(fast - exact)).toBeLessThan(1e-6 * Math.max(1, exact));
      compared++;
      if (exact > 1) overlapping++;
    }
    expect(compared).toBe(300);
    expect(overlapping).toBeGreaterThan(50);
    const l = objectFootprint(random(), 'lshape');
    expect(isConvexRing(l)).toBe(false);
    expect(convexParts(l)).not.toBeNull(); // L shapes take the convexParts path, not the boolean fallback

    // the concave wall shape (with its room holes) against footprints, L shapes (convexParts) included
    const level = room();
    const walls = deriveLevel(level).shapeNoOpenings;
    for (let i = 0; i < 100; i++) {
      const f = objectFootprint({ ...random(), x: -40 + rand() * 480, y: -40 + rand() * 480 }, shapes[i % 3]);
      const exact = shapeArea(intersection(walls, f));
      expect(Math.abs(overlapArea(walls, f, isConvexRing(f)) - exact)).toBeLessThan(1e-6 * Math.max(1, exact));
    }
  });
});
