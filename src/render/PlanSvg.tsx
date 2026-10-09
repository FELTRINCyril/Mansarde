import type { JSX, ReactNode } from 'react';
import type { CheckSeverity } from '@/core/checks/types';
import { deriveLevel, deriveVolumes } from '@/core/geometry/derived';
import { objectCorners } from '@/core/geometry/objects';
import { bbox } from '@/core/geometry/polygon';
import type { Id, Level, Project } from '@/core/model/types';
import type { SelectionItem } from '@/editor/selection';
import { AlertsLayer } from './layers/AlertsLayer';
import { BackgroundLayer } from './layers/BackgroundLayer';
import { BeamsLayer } from './layers/BeamsLayer';
import { CupboardsLayer } from './layers/CupboardsLayer';
import { DimensionsLayer, type DimMode } from './layers/DimensionsLayer';
import { GridLayer, type ViewBox } from './layers/GridLayer';
import { LowerLevelLayer } from './layers/LowerLevelLayer';
import { ObjectsLayer } from './layers/ObjectsLayer';
import { OpeningsLayer } from './layers/OpeningsLayer';
import { RoomLabelsLayer } from './layers/RoomLabelsLayer';
import { RoomsLayer } from './layers/RoomsLayer';
import { SelectionLayer } from './layers/SelectionLayer';
import { SlopesLayer } from './layers/SlopesLayer';
import { WallsLayer } from './layers/WallsLayer';
import { roomLabelBox } from './roomLabelLayout';
import { num, STYLE } from './style';

export type { DimMode, ViewBox };

export interface PlanSvgProps {
  project: Project;
  level: Level;
  lowerLevel?: Level | null; // ghost
  viewBox: ViewBox; // world cm
  lineUnit: number; // world cm per display pixel
  dimMode: DimMode;
  showGrid: boolean;
  mode: 'screen' | 'print';
  imageUrls: Record<Id, string>; // background imageId -> URL (object URL on screen, data URL in export)
  selection?: SelectionItem[]; // screen only, highlights
  /** Screen only: worst check severity per target, keyed `${kind}:${id}` (checkSeverityByTarget). */
  alerts?: ReadonlyMap<string, CheckSeverity>;
  overlay?: ReactNode; // screen only, rendered last
  width?: number | string;
  height?: number | string;
}

const NO_IDS: ReadonlySet<string> = new Set();

/**
 * The plan as an SVG whose user unit is the centimeter. Layers, bottom to top (spec 8, V2 spec
 * 7.3): paper, background image, lower level ghost, grid, rooms, roof slopes, cupboards and
 * objects, walls, openings, beams, dimensions, room labels, then alerts, selection and overlay on
 * screen. Room labels sit above the furniture, the beams and the dimensions so that nothing hides
 * a room name (ruling R21). The print mode drops the grid, the alerts, the selection (and the
 * cupboard clearance it shows) and the overlay; everything else is identical, so the export reuses
 * the screen rendering.
 */
export function PlanSvg(p: PlanSvgProps): JSX.Element {
  const { level, lineUnit, viewBox: vb } = p;
  const derived = deriveLevel(level);
  const volumes = deriveVolumes(level);
  const screen = p.mode === 'screen';
  // room names are drawn above the slopes and beams, the furniture (rugs aside) and cupboards
  // above the slopes: the labels of slopes and beams keep clear of them
  const roomNames = derived.rooms.map((r) => roomLabelBox(r, lineUnit));
  const overSlopes = {
    hiding: roomNames,
    covering:
      Object.keys(level.slopes).length === 0
        ? []
        : [
            ...Object.values(level.objects)
              .filter((o) => o.pose !== 'covering')
              .map((o) => bbox(objectCorners(o))!),
            ...[...volumes.cupboardFootprints.values()].map((r) => bbox(r)!),
          ],
  };
  const selectedCupboards = screen && p.selection ? new Set(p.selection.filter((i) => i.kind === 'cupboard').map((i) => i.id)) : NO_IDS;
  const selectedKeys = screen && p.selection ? new Set(p.selection.map((i) => `${i.kind}:${i.id}`)) : NO_IDS;
  const bg = level.background;
  const imageShown = !!bg && bg.visible && !!p.imageUrls[bg.imageId];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${num(vb.x)} ${num(vb.y)} ${num(vb.width)} ${num(vb.height)}`}
      width={p.width}
      height={p.height}
      data-kind="plan"
      data-id={level.id}
    >
      <rect data-kind="paper" x={num(vb.x)} y={num(vb.y)} width={num(vb.width)} height={num(vb.height)} fill={STYLE.paper} />
      <BackgroundLayer background={bg} imageUrls={p.imageUrls} />
      <LowerLevelLayer level={p.lowerLevel} />
      {screen && p.showGrid && <GridLayer viewBox={vb} gridStep={p.project.settings.gridStep} lineUnit={lineUnit} />}
      <RoomsLayer rooms={derived.rooms} translucent={imageShown} />
      <SlopesLayer slopes={level.slopes} labelObstacles={overSlopes} lineUnit={lineUnit} />
      <CupboardsLayer level={level} footprints={volumes.cupboardFootprints} selectedIds={selectedCupboards} lineUnit={lineUnit} />
      <ObjectsLayer objects={level.objects} customObjects={p.project.customObjects} lineUnit={lineUnit} />
      <WallsLayer shape={derived.shapeWithOpenings} degraded={derived.degraded} />
      <OpeningsLayer level={level} lineUnit={lineUnit} />
      <BeamsLayer level={level} footprints={volumes.beamFootprints} labelObstacles={roomNames} lineUnit={lineUnit} />
      <DimensionsLayer level={level} derived={derived} dimMode={p.dimMode} lineUnit={lineUnit} />
      <RoomLabelsLayer rooms={derived.rooms} lineUnit={lineUnit} />
      {screen && p.alerts && (
        <AlertsLayer alerts={p.alerts} selected={selectedKeys} level={level} volumes={volumes} customObjects={p.project.customObjects} lineUnit={lineUnit} />
      )}
      {screen && p.selection && (
        <SelectionLayer selection={p.selection} level={level} derived={derived} customObjects={p.project.customObjects} lineUnit={lineUnit} />
      )}
      {screen && p.overlay}
    </svg>
  );
}
