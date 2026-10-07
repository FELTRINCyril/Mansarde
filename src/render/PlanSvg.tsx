import type { JSX, ReactNode } from 'react';
import { deriveLevel } from '@/core/geometry/derived';
import type { Id, Level, Project } from '@/core/model/types';
import type { SelectionItem } from '@/editor/selection';
import { BackgroundLayer } from './layers/BackgroundLayer';
import { DimensionsLayer, type DimMode } from './layers/DimensionsLayer';
import { GridLayer, type ViewBox } from './layers/GridLayer';
import { LowerLevelLayer } from './layers/LowerLevelLayer';
import { ObjectsLayer } from './layers/ObjectsLayer';
import { OpeningsLayer } from './layers/OpeningsLayer';
import { RoomLabelsLayer } from './layers/RoomLabelsLayer';
import { RoomsLayer } from './layers/RoomsLayer';
import { SelectionLayer } from './layers/SelectionLayer';
import { WallsLayer } from './layers/WallsLayer';
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
  overlay?: ReactNode; // screen only, rendered last
  width?: number | string;
  height?: number | string;
}

/**
 * The plan as an SVG whose user unit is the centimeter. Layers, bottom to top (spec 8): paper,
 * background image, lower level ghost, grid, rooms, objects, room labels, walls, openings,
 * dimensions, then selection and overlay on screen. Room labels sit above the objects so that
 * furniture never hides a room name. The print mode drops the grid, the selection and the overlay;
 * everything else is identical, so the export reuses the screen rendering.
 */
export function PlanSvg(p: PlanSvgProps): JSX.Element {
  const { level, lineUnit, viewBox: vb } = p;
  const derived = deriveLevel(level);
  const screen = p.mode === 'screen';
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
      <ObjectsLayer objects={level.objects} customObjects={p.project.customObjects} lineUnit={lineUnit} />
      <RoomLabelsLayer rooms={derived.rooms} lineUnit={lineUnit} />
      <WallsLayer shape={derived.shapeWithOpenings} />
      <OpeningsLayer level={level} lineUnit={lineUnit} />
      <DimensionsLayer level={level} derived={derived} dimMode={p.dimMode} lineUnit={lineUnit} />
      {screen && p.selection && (
        <SelectionLayer selection={p.selection} level={level} derived={derived} customObjects={p.project.customObjects} lineUnit={lineUnit} />
      )}
      {screen && p.overlay}
    </svg>
  );
}
