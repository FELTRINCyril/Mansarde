import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Vector3, type Group, type MeshStandardMaterial, type Object3D } from 'three';
import { deriveLevel } from '@/core/geometry/derived';
import { buildLevelMeshes } from '@/core/mesh';
import { createBeam, createCupboard, createOpening, createSlope } from '@/core/model/factory';
import type { Level } from '@/core/model/types';
import { createEditorStore } from '@/editor/store';
import { boundsOf, ease, presetPose, REF_ASPECT } from '@/scene3d/camera';
import { buildLevelView, toGeometry } from '@/scene3d/levelMeshes';
import { COLORS, createMaterials, GLASS_OPACITY } from '@/scene3d/materials';
import { buildOpening, DOOR_OPEN_DEG } from '@/scene3d/openings';
import { drawParquet, PARQUET_PX } from '@/scene3d/textures';
import { findWall, levelFromWalls, rectRoom } from '../core/fixtures';
import { emptyProject } from '../core/helpers';

/** plan-chambre: interior 0..400 x 0..400, walls 20 cm, ceiling 240, slope from x = 197 towards +x down to 150, beam, cupboards. */
function chambre(): Level {
  const level = levelFromWalls(rectRoom(-10, -10, 410, 410));
  level.height = 240;
  for (const w of Object.values(level.walls)) w.height = 240;
  const s = createSlope({ x: 197, y: -50 }, { x: 197, y: 450 }, 'right', 203, 240, 150);
  level.slopes[s.id] = s;
  const b = createBeam({ x: 191, y: 0 }, { x: 191, y: 400 });
  level.beams[b.id] = b;
  const right = findWall(level, 410, -10, 410, 410);
  const c = createCupboard(right, 210, 'left', { width: 400, heightMode: 'ceiling' });
  level.cupboards[c.id] = c;
  return level;
}

const mats = () => createMaterials(null);

function meshes(o: Object3D): Mesh[] {
  const out: Mesh[] = [];
  o.traverse((n) => {
    if (n instanceof Mesh) out.push(n);
  });
  return out;
}

describe('store: view switch (ruling V2-R19)', () => {
  it("display.view defaults to 'plan', is changed by setDisplay and kept when another project opens", () => {
    const store = createEditorStore();
    expect(store.getState().display.view).toBe('plan');
    store.getState().openProject(emptyProject());
    store.getState().setDisplay({ view: 'split' });
    expect(store.getState().display.view).toBe('split');
    store.getState().closeProject();
    store.getState().openProject(emptyProject());
    expect(store.getState().display.view).toBe('split');
    expect(store.getState().display.splitRatio).toBe(0.5);
  });

  it('3D display options: labels shown, walls and lower levels not', () => {
    const d = createEditorStore().getState().display;
    expect([d.labels3d, d.hideWalls3d, d.lowerLevels3d]).toEqual([true, false, false]);
  });
});

describe('toGeometry', () => {
  it('copies positions, normals, uvs and indices of a core mesh', () => {
    const level = chambre();
    const lm = buildLevelMeshes(level, deriveLevel(level));
    const m = lm.walls[0]!.mesh;
    const g = toGeometry(m);
    expect(Array.from(g.getAttribute('position').array)).toEqual(m.positions.map((x) => Math.fround(x)));
    expect(g.getAttribute('normal').count).toBe(m.positions.length / 3);
    expect(g.getAttribute('uv').itemSize).toBe(2);
    expect(Array.from(g.getIndex()!.array)).toEqual(m.indices);
  });
});

describe('buildLevelView', () => {
  it('chambre: one group per wall, floor, sloped ceiling, beam and cupboard in their materials', () => {
    const level = chambre();
    const d = deriveLevel(level);
    const m = mats();
    const v = buildLevelView(level, d, m);
    expect([...v.wallGroups.keys()].sort()).toEqual(Object.keys(level.walls).sort());
    for (const [id, g] of v.wallGroups) {
      expect(g.userData.wallId).toBe(id);
      expect(meshes(g)[0]!.material).toBe(m.wall);
    }
    expect(meshes(v.floors).map((x) => x.material)).toEqual([m.floor]);
    expect(meshes(v.ceilings).map((x) => x.material)).toEqual([m.ceiling]);
    expect(meshes(v.beams).map((x) => x.material)).toEqual([m.beam]);
    const cup = meshes(v.cupboards);
    expect(cup.filter((x) => x.material === m.cupboard(COLORS.cupboard)).length).toBe(1 + 7); // body + doors (400 / 55 -> 7)
    expect(cup.some((x) => x.material === m.handle)).toBe(true);
    // the whole level stays within its walls (meters) and under 2.40 m
    const box = new Box3().setFromObject(v.root);
    expect(box.min.x).toBeCloseTo(-0.2, 6);
    expect(box.max.x).toBeCloseTo(4.2, 6);
    expect(box.max.y).toBeCloseTo(2.4, 6);
    expect(box.min.y).toBeCloseTo(-0.102, 6); // slab
    // the low wall stops at 1.50 m under the slope
    const right = v.wallGroups.get(findWall(level, 410, -10, 410, 410))!;
    expect(new Box3().setFromObject(right).max.y).toBeCloseTo(1.5, 6);
  });

  it('the level elevation lifts the whole view; walls, ceilings and beams cast no shadow', () => {
    const level = { ...chambre(), elevation: 280 };
    const v = buildLevelView(level, deriveLevel(level), mats());
    expect(v.root.position.y).toBeCloseTo(2.8, 9);
    for (const g of v.wallGroups.values()) expect(g.children[0]).toBeInstanceOf(Mesh);
    for (const g of v.wallGroups.values()) expect((g.children[0] as Mesh).castShadow).toBe(false);
    for (const g of [v.ceilings, v.beams]) expect(meshes(g).some((x) => x.castShadow)).toBe(false);
    expect(meshes(v.floors).every((x) => x.receiveShadow)).toBe(true);
  });

  it('lower level: walls, floors and slab only, in the see-through materials', () => {
    const level = chambre();
    const lower = createMaterials(null, 0.6);
    const v = buildLevelView(level, deriveLevel(level), lower, { lower: true });
    expect(meshes(v.ceilings)).toHaveLength(0);
    expect(meshes(v.beams)).toHaveLength(0);
    expect(meshes(v.cupboards)).toHaveLength(0);
    expect(meshes(v.walls).length).toBe(4);
    expect(lower.wall.opacity).toBe(0.6);
    expect(lower.wall.transparent).toBe(true);
  });

  it('empty level and open walls: no error, empty or partial view (review focus 4)', () => {
    const empty = levelFromWalls([]);
    const v = buildLevelView(empty, deriveLevel(empty), mats());
    expect(meshes(v.root)).toHaveLength(0);
    const open = levelFromWalls([
      [0, 0, 300, 0],
      [300, 0, 300, 200],
    ]);
    const o = createOpening(findWall(open, 0, 0, 300, 0), 'window', 150);
    open.openings[o.id] = o;
    const w = buildLevelView(open, deriveLevel(open), mats());
    expect(w.wallGroups.size).toBe(2);
    expect(meshes(w.floors)).toHaveLength(0);
    expect(meshes(w.slab)).toHaveLength(1);
  });

  it('dispose releases every geometry and detaches the view', () => {
    const level = chambre();
    const v = buildLevelView(level, deriveLevel(level), mats());
    const parent = new Mesh();
    parent.add(v.root);
    let disposed = 0;
    for (const m of meshes(v.root)) m.geometry.addEventListener('dispose', () => disposed++);
    const count = meshes(v.root).length;
    v.dispose();
    expect(disposed).toBe(count);
    expect(v.root.parent).toBeNull();
  });
});

describe('openings', () => {
  const room = () => levelFromWalls(rectRoom(-10, -10, 410, 310));

  /** The leaf of a door and its pivot (the hinge), in world space. */
  function leafOf(g: Group, m: ReturnType<typeof mats>): { angleDeg: number; hinge: Vector3 } {
    const leafMesh = meshes(g).find((x) => x.material === m.door)!;
    expect((leafMesh.material as MeshStandardMaterial).color.getHexString()).toBe(COLORS.door.slice(1));
    g.updateMatrixWorld(true);
    const hinge = new Vector3().setFromMatrixPosition(leafMesh.parent!.matrixWorld);
    const x = new Vector3(1, 0, 0).applyMatrix4(leafMesh.parent!.matrixWorld).sub(hinge);
    return { angleDeg: (Math.atan2(x.z, x.x) * 180) / Math.PI, hinge };
  }

  it('single door open at 70 degrees towards its swing side, hinged on its hinge side', () => {
    const level = room();
    const top = findWall(level, -10, -10, 410, -10); // dir +x, normal (0, 1) = +y = into the room
    for (const [hinge, swing, expected] of [
      ['start', 'left', DOOR_OPEN_DEG], // closes towards +x, opens towards +y: angle +70
      ['end', 'left', 180 - DOOR_OPEN_DEG],
      ['start', 'right', -DOOR_OPEN_DEG],
    ] as const) {
      const o = { ...createOpening(top, 'door', 200), hinge, swing };
      const m = mats();
      const g = buildOpening(level, o, deriveLevel(level).rooms, m)!;
      const { angleDeg, hinge: h } = leafOf(g, m);
      expect(angleDeg).toBeCloseTo(expected, 6);
      // the hinge on the hinge jamb, on the face of the swing side
      expect(h.x).toBeCloseTo((-10 + 200 + (hinge === 'start' ? -41.5 : 41.5)) / 100, 6);
      expect(h.z).toBeCloseTo((-10 + (swing === 'left' ? 10 : -10)) / 100, 6);
    }
  });

  it('window: frame, glass at 55 % and a sill board on the room side only', () => {
    const level = room();
    const top = findWall(level, -10, -10, 410, -10);
    const o = createOpening(top, 'window', 200);
    const m = mats();
    const g = buildOpening(level, o, deriveLevel(level).rooms, m)!;
    const glass = meshes(g).filter((x) => x.material === m.glass);
    expect(glass).toHaveLength(1);
    expect(m.glass.opacity).toBe(GLASS_OPACITY);
    expect(meshes(g).filter((x) => x.material === m.frame).length).toBeGreaterThanOrEqual(4);
    const sills = meshes(g).filter((x) => x.material === m.windowSill);
    expect(sills).toHaveLength(1);
    g.updateMatrixWorld(true);
    const c = new Box3().setFromObject(sills[0]!).getCenter(new Vector3());
    expect(c.z).toBeGreaterThan(-0.1); // inside the room (y > -10 cm)
    // glass between the sill (90) and the head (225)
    const gb = new Box3().setFromObject(glass[0]!);
    expect(gb.min.y).toBeCloseTo(0.9, 6);
    expect(gb.max.y).toBeCloseTo(2.25, 6);
  });

  it('passage and opening on a missing wall: nothing', () => {
    const level = room();
    const top = findWall(level, -10, -10, 410, -10);
    expect(buildOpening(level, createOpening(top, 'passage', 200), [], mats())).toBeNull();
    expect(buildOpening(level, createOpening('nope', 'door', 200), [], mats())).toBeNull();
  });
});

describe('camera presets', () => {
  // plan-chambre's room spans 4.30 m with its 15 cm walls: same extent -> its very poses
  const ref = { minX: -0.15, maxX: 4.15, minZ: -0.15, maxZ: 4.15 };

  it("overview and top are plan-chambre's poses for its room", () => {
    const o = presetPose('overview', ref);
    [-1.7, 4.6, 6.1].forEach((v, i) => expect(o.pos[i]).toBeCloseTo(v, 9));
    [2, 0.6, 2].forEach((v, i) => expect(o.tgt[i]).toBeCloseTo(v, 9));
    const t = presetPose('top', ref);
    [2, 9.5, 2.6].forEach((v, i) => expect(t.pos[i]).toBeCloseTo(v, 9));
    [2, 0, 2].forEach((v, i) => expect(t.tgt[i]).toBeCloseTo(v, 9));
  });

  it('moved back from the target in a view narrower than plan-chambre, by the ratio of the aspects', () => {
    const wide = presetPose('overview', ref, null, REF_ASPECT * 2);
    expect(wide).toEqual(presetPose('overview', ref));
    const narrow = presetPose('overview', ref, null, REF_ASPECT / 2);
    expect(narrow.tgt).toEqual(wide.tgt);
    [-3.7, 4.0, 4.1].forEach((d, i) => expect(narrow.pos[i]! - narrow.tgt[i]!).toBeCloseTo(2 * d, 9));
  });

  it('scaled to a level twice as large, centered on it', () => {
    const b = { minX: 0, maxX: 8.6, minZ: 0, maxZ: 4 };
    const t = presetPose('top', b);
    expect(t.pos[1]).toBeCloseTo(19, 9);
    expect(t.tgt[0]).toBeCloseTo(4.3, 9);
    expect(t.tgt[2]).toBeCloseTo(2, 9);
  });

  it('room: eye at 1.60 m inside the room, looking at its center; overview without a room', () => {
    const level = chambre();
    const room = deriveLevel(level).rooms[0]!;
    const p = presetPose('room', boundsOf([room.ring]), room);
    expect(p.pos[1]).toBeCloseTo(1.6, 9);
    expect(p.pos[0]).toBeGreaterThan(0);
    expect(p.pos[0]).toBeLessThan(4);
    expect(p.pos[2]).toBeGreaterThan(0);
    expect(p.pos[2]).toBeLessThan(4);
    expect(p.tgt[0]).toBeCloseTo(room.labelPoint.x / 100, 9);
    expect(presetPose('room', ref, null)).toEqual(presetPose('overview', ref));
  });

  it('bounds of nothing: a 4 m square; ease goes from 0 to 1 symmetrically', () => {
    expect(boundsOf([])).toEqual({ minX: 0, maxX: 4, minZ: 0, maxZ: 4 });
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5, 12);
    expect(ease(0.25) + ease(0.75)).toBeCloseTo(1, 12);
  });
});

describe('parquet texture', () => {
  it('boards of 16 cm (40 px rows) over the whole 1024 px texture, same drawing on every run', () => {
    const calls: Array<[number, number, number, number]> = [];
    const styles: string[] = [];
    const ctx = {
      fillRect: (x: number, y: number, w: number, h: number) => calls.push([x, y, w, h]),
      strokeRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      bezierCurveTo: () => {},
      stroke: () => {},
      arc: () => {},
      fill: () => {},
      lineTo: () => {},
      closePath: () => {},
      lineWidth: 1,
      strokeStyle: '',
      set fillStyle(v: string) {
        styles.push(v);
      },
      get fillStyle() {
        return styles.at(-1) ?? '';
      },
    };
    drawParquet(ctx as unknown as CanvasRenderingContext2D);
    expect(calls.every(([, , , h]) => Math.abs(h - 0.16 * (PARQUET_PX / 4)) < 1e-9)).toBe(true);
    expect(new Set(calls.map(([, y]) => y)).size).toBe(Math.ceil(PARQUET_PX / 40.96));
    const covered = calls.filter(([, y]) => y === 0).reduce((s, [, , w]) => s + w, 0) + Math.min(...calls.filter(([, y]) => y === 0).map(([x]) => x));
    expect(covered).toBeGreaterThanOrEqual(PARQUET_PX);
    const first = JSON.stringify(calls);
    calls.length = 0;
    drawParquet(ctx as unknown as CanvasRenderingContext2D);
    expect(JSON.stringify(calls)).toBe(first);
    expect(styles.every((s) => /^hsl\(3\d\.?\d*, \d+\.?\d*%, \d+\.?\d*%\)$/.test(s))).toBe(true);
  });
});
