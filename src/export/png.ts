import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { deriveLevel } from '@/core/geometry/derived';
import type { Id, Level, Project } from '@/core/model/types';
import { PlanSvg, type DimMode } from '@/render/PlanSvg';
import { BLEED_PX, ERR_EMPTY_LEVEL, levelBounds, PNG_LINE_UNIT } from './pageLayout';

/** Chromium canvas limits (side and area); beyond them toBlob silently yields nothing. */
const MAX_SIDE_PX = 32767;
const MAX_AREA_PX = 268_435_456;
export const ERR_TOO_LARGE = 'Image trop grande : choisissez une résolution plus faible';

const LINE_UNIT = PNG_LINE_UNIT;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Rendu du plan impossible'));
    img.src = url;
  });
}

/**
 * The level as a PNG framed on its content (levelBounds plus the dimension text bleed), white
 * background, 1 px per cm at 1x, 2 or 4 px per cm at 2x and 4x (same drawing, more pixels).
 */
export async function exportPng(args: {
  project: Project;
  level: Level;
  resolution: 1 | 2 | 4;
  imageDataUrls: Record<Id, string>;
  /** Top views of the downloaded models (modelTopDataUrls); a missing one is drawn as its box. */
  modelImageUrls?: Record<string, string>;
  dimMode: DimMode;
}): Promise<Blob> {
  const { level, resolution } = args;
  const b = levelBounds(level, deriveLevel(level));
  if (!b) throw new Error(ERR_EMPTY_LEVEL);
  const bleed = BLEED_PX * LINE_UNIT;
  const viewBox = { x: b.minX - bleed, y: b.minY - bleed, width: b.maxX - b.minX + 2 * bleed, height: b.maxY - b.minY + 2 * bleed };
  const width = Math.ceil(viewBox.width * resolution);
  const height = Math.ceil(viewBox.height * resolution);
  if (width > MAX_SIDE_PX || height > MAX_SIDE_PX || width * height > MAX_AREA_PX) throw new Error(ERR_TOO_LARGE);

  const markup = renderToStaticMarkup(
    createElement(PlanSvg, {
      project: args.project,
      level,
      viewBox,
      lineUnit: LINE_UNIT,
      dimMode: args.dimMode,
      showGrid: false,
      mode: 'print',
      imageUrls: args.imageDataUrls,
      modelImageUrls: args.modelImageUrls ?? {},
      width,
      height,
    }),
  );
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Rendu du plan impossible');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error(ERR_TOO_LARGE);
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
