import { newId } from './ids';
import type { Anchor, Id, Level, Project } from './types';

interface CloneMaps {
  customObjects?: Map<Id, Id>;
}

function cloneLevel(level: Level, maps: CloneMaps, imageIdMap?: Map<Id, Id>): Level {
  const nodeMap = new Map<Id, Id>();
  const wallMap = new Map<Id, Id>();
  const objectMap = new Map<Id, Id>();
  for (const id of Object.keys(level.nodes)) nodeMap.set(id, newId());
  for (const id of Object.keys(level.walls)) wallMap.set(id, newId());
  for (const id of Object.keys(level.objects)) objectMap.set(id, newId());
  // Dangling references stay as they are: the clone is as valid as the source.
  const mapOr = (m: Map<Id, Id>, id: Id): Id => m.get(id) ?? id;

  const remapAnchor = (a: Anchor): Anchor => {
    if (a.kind === 'node') return { ...a, nodeId: mapOr(nodeMap, a.nodeId) };
    if (a.kind === 'objectCorner') return { ...a, objectId: mapOr(objectMap, a.objectId) };
    return { ...a };
  };

  const out: Level = {
    ...structuredClone(level),
    id: newId(),
    nodes: {},
    walls: {},
    openings: {},
    objects: {},
    dimensions: {},
    slopes: {},
    beams: {},
    cupboards: {},
    roomLabels: level.roomLabels.map((l) => ({ ...structuredClone(l), id: newId() })),
  };
  if (level.background) {
    const bg = structuredClone(level.background);
    out.background = { ...bg, imageId: imageIdMap?.get(bg.imageId) ?? bg.imageId };
  }
  for (const n of Object.values(level.nodes)) {
    const id = nodeMap.get(n.id)!;
    out.nodes[id] = { ...n, id };
  }
  for (const w of Object.values(level.walls)) {
    const id = wallMap.get(w.id)!;
    out.walls[id] = {
      ...w,
      id,
      startNodeId: mapOr(nodeMap, w.startNodeId),
      endNodeId: mapOr(nodeMap, w.endNodeId),
    };
  }
  for (const o of Object.values(level.openings)) {
    const id = newId();
    out.openings[id] = { ...o, id, wallId: mapOr(wallMap, o.wallId) };
  }
  for (const o of Object.values(level.objects)) {
    const id = objectMap.get(o.id)!;
    const source =
      o.source.kind === 'custom'
        ? { ...o.source, customObjectId: maps.customObjects?.get(o.source.customObjectId) ?? o.source.customObjectId }
        : { ...o.source };
    out.objects[id] = { ...structuredClone(o), id, source };
  }
  for (const d of Object.values(level.dimensions)) {
    const id = newId();
    out.dimensions[id] = { ...d, id, a: remapAnchor(d.a), b: remapAnchor(d.b) };
  }
  for (const s of Object.values(level.slopes)) {
    const id = newId();
    out.slopes[id] = { ...structuredClone(s), id };
  }
  for (const b of Object.values(level.beams)) {
    const id = newId();
    out.beams[id] = { ...structuredClone(b), id };
  }
  for (const c of Object.values(level.cupboards)) {
    const id = newId();
    out.cupboards[id] = { ...c, id, wallId: mapOr(wallMap, c.wallId) };
  }
  return out;
}

/**
 * Deep copy of a level where every id (level, nodes, walls, openings, objects, dimensions, labels,
 * slopes, beams, cupboards) is new.
 */
export function cloneLevelWithNewIds(level: Level): Level {
  return cloneLevel(level, {});
}

/**
 * Deep copy of a project where every id is new: project, levels, elements, custom objects.
 * Background image ids are translated through imageIdMap when provided (kept otherwise).
 */
export function cloneProjectWithNewIds(p: Project, imageIdMap?: Map<Id, Id>): Project {
  const customMap = new Map<Id, Id>();
  const customObjects: Project['customObjects'] = {};
  for (const def of Object.values(p.customObjects)) {
    const id = newId();
    customMap.set(def.id, id);
    customObjects[id] = { ...structuredClone(def), id };
  }
  return {
    ...structuredClone(p),
    id: newId(),
    levels: p.levels.map((l) => cloneLevel(l, { customObjects: customMap }, imageIdMap)),
    customObjects,
  };
}
