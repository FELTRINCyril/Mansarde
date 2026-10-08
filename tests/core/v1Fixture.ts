// Frozen V1 data (format version 1), written by hand: it must NOT be built with the current
// factories, which produce V2 data.

/** Raw V1 document: loosely typed on purpose (it does not match the current model). */
export type V1Data = { formatVersion: number } & Record<string, any>;

/** V1 placed object (no pose). */
function v1Object(id: string, source: Record<string, string>, name: string, x: number): Record<string, unknown> {
  return {
    id, source, x, y: 100, rotation: 0, width: 50, depth: 50, height: 80, elevation: 0,
    name, color: '#dddddd', mirrored: false, lshape: null,
  };
}

/**
 * A V1 project: one rectangular room 400 x 300, a chair from the catalog, two generic rectangles
 * named "Tapis salon" and "Table", an object of the custom definition "Tapis berbere" and an
 * object with an unknown catalog id.
 */
export function v1Project(): V1Data {
  const nodes: Record<string, unknown> = {
    n1: { id: 'n1', x: 0, y: 0 },
    n2: { id: 'n2', x: 400, y: 0 },
    n3: { id: 'n3', x: 400, y: 300 },
    n4: { id: 'n4', x: 0, y: 300 },
  };
  const walls: Record<string, unknown> = {
    w1: { id: 'w1', startNodeId: 'n1', endNodeId: 'n2', thickness: 20, height: 250 },
    w2: { id: 'w2', startNodeId: 'n2', endNodeId: 'n3', thickness: 20, height: 250 },
    w3: { id: 'w3', startNodeId: 'n3', endNodeId: 'n4', thickness: 20, height: 250 },
    w4: { id: 'w4', startNodeId: 'n4', endNodeId: 'n1', thickness: 20, height: 250 },
  };
  return {
    formatVersion: 1,
    id: 'p1',
    name: 'Maison V1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    settings: { defaultWallThickness: 20, partitionThickness: 7, defaultCeilingHeight: 250, gridStep: 10 },
    levels: [
      {
        id: 'l1', name: 'RDC', elevation: 0, height: 250, background: null,
        nodes, walls, openings: {},
        objects: {
          chair: v1Object('chair', { kind: 'catalog', catalogId: 'chair' }, 'Chaise', 50),
          rug: v1Object('rug', { kind: 'catalog', catalogId: 'generic-rect' }, 'Tapis salon', 120),
          table: v1Object('table', { kind: 'catalog', catalogId: 'generic-rect' }, 'Table', 190),
          berber: v1Object('berber', { kind: 'custom', customObjectId: 'c1' }, 'Tapis berbère', 260),
          ghost: v1Object('ghost', { kind: 'catalog', catalogId: 'no-such-entry' }, 'Inconnu', 330),
        },
        dimensions: {},
        roomLabels: [{ id: 'r1', name: 'Séjour', anchor: { x: 200, y: 150 } }],
      },
    ],
    customObjects: {
      c1: { id: 'c1', name: 'Tapis berbère', shape: 'rect', width: 50, depth: 50, height: 80, color: '#aa8866', lshape: null },
      c2: { id: 'c2', name: 'Piano', shape: 'rect', width: 150, depth: 60, height: 100, color: '#222222', lshape: null },
    },
  };
}

/** V1 export file around v1Project(). */
export function v1Export(): V1Data {
  return { app: 'plan-maison', formatVersion: 1, project: v1Project(), images: {} };
}
