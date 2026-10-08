import { jsPDF } from 'jspdf';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { svg2pdf } from 'svg2pdf.js';
import { deriveLevel } from '@/core/geometry/derived';
import type { Id, Level, Project } from '@/core/model/types';
import { PlanSvg, type DimMode } from '@/render/PlanSvg';
import {
  ERR_EMPTY_LEVEL,
  fits,
  formatPrintDate,
  levelBounds,
  pageSizeMm,
  planPlacement,
  printLineUnit,
  scaleBarMeters,
  titleBlockRect,
  type PageSpec,
} from './pageLayout';

export const ERR_DOES_NOT_FIT = 'Le plan ne tient pas sur la page à cette échelle';

const FONT = 'helvetica'; // PDF core font, WinAnsi encoding: French accents and the superscript two
const FRAME_LINE_MM = 0.3;
const THIN_LINE_MM = 0.2;

/** Parses the static markup of the plan into a detached SVG element for svg2pdf. */
function parsePlanSvg(markup: string): Element {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Rendu du plan invalide');
  }
  return root;
}

/** Shortens a text with "..." until it fits maxWidth (mm) in the current font. */
function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && doc.getTextWidth(`${t}...`) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}

/** Frame with the project name, the level name, the scale and the date. */
function drawTitleBlock(doc: jsPDF, spec: PageSpec, projectName: string, levelName: string, date: Date): void {
  const r = titleBlockRect(spec);
  const pad = 3;
  const inner = r.width - 2 * pad;
  doc.setLineWidth(FRAME_LINE_MM);
  doc.setDrawColor(0);
  doc.setFillColor(255, 255, 255);
  doc.rect(r.x, r.y, r.width, r.height, 'FD');
  doc.setTextColor(0);

  doc.setFont(FONT, 'bold');
  doc.setFontSize(11);
  doc.text(fitText(doc, projectName, inner), r.x + pad, r.y + 7);

  doc.setFont(FONT, 'normal');
  doc.setFontSize(9);
  doc.text(fitText(doc, levelName, inner), r.x + pad, r.y + 12.5);

  doc.setLineWidth(THIN_LINE_MM);
  doc.line(r.x, r.y + 16, r.x + r.width, r.y + 16);

  doc.text(`Échelle 1/${spec.scale}`, r.x + pad, r.y + 22.5);
  doc.text(formatPrintDate(date), r.x + r.width - pad, r.y + 22.5, { align: 'right' });
}

/** Graphic scale bar, left of the title block: alternating black and white 1 m segments. */
function drawScaleBar(doc: jsPDF, spec: PageSpec): void {
  const tb = titleBlockRect(spec);
  const meters = scaleBarMeters(spec.scale);
  const segment = 1000 / spec.scale; // 1 m on paper, mm
  const barHeight = 2;
  const right = tb.x - 10;
  const left = right - meters * segment;
  const y = tb.y + tb.height - 8;

  doc.setLineWidth(THIN_LINE_MM);
  doc.setDrawColor(0);
  for (let i = 0; i < meters; i++) {
    if (i % 2 === 0) doc.setFillColor(0, 0, 0);
    else doc.setFillColor(255, 255, 255);
    doc.rect(left + i * segment, y, segment, barHeight, 'FD');
  }

  doc.setFont(FONT, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(0);
  for (let i = 0; i <= meters; i++) {
    doc.text(String(i), left + i * segment, y - 1.2, { align: 'center' });
  }
  doc.text('m', right + doc.getTextWidth(String(meters)) / 2 + 1, y - 1.2);
}

/**
 * The level as a vector PDF at exactly 1/scale: the print rendering of the plan (PlanSvg, lines
 * 0.25 mm, texts about 3 mm on paper) centered in the drawing area above the title block band
 * (planPlacement), with the scale bar and the title block in the bottom right corner. Rejects when
 * the plan does not fit the page.
 */
export async function exportPdf(args: {
  project: Project;
  level: Level;
  spec: PageSpec;
  imageDataUrls: Record<Id, string>;
  date: Date;
  dimMode: DimMode;
}): Promise<Blob> {
  const { project, level, spec } = args;
  const bounds = levelBounds(level, deriveLevel(level));
  if (!bounds) throw new Error(ERR_EMPTY_LEVEL);
  if (!fits(bounds, spec)) throw new Error(ERR_DOES_NOT_FIT);

  const place = planPlacement(bounds, spec);
  const markup = renderToStaticMarkup(
    createElement(PlanSvg, {
      project,
      level,
      viewBox: place.viewBox,
      lineUnit: printLineUnit(spec.scale),
      dimMode: args.dimMode,
      showGrid: false,
      mode: 'print',
      imageUrls: args.imageDataUrls,
    }),
  );

  const page = pageSizeMm(spec.format, spec.orientation);
  const doc = new jsPDF({
    unit: 'mm',
    format: [page.width, page.height],
    orientation: spec.orientation,
    compress: true,
  });
  doc.setProperties({ title: `${project.name} - ${level.name}`, creator: 'Plan Maison' });
  await svg2pdf(parsePlanSvg(markup), doc, { x: place.x, y: place.y, width: place.width, height: place.height });
  drawScaleBar(doc, spec);
  drawTitleBlock(doc, spec, project.name, level.name, args.date);
  return doc.output('blob');
}
