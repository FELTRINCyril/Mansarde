/**
 * Plan colors and sizes. Sizes are in display pixels: multiply by lineUnit (world cm per display
 * pixel) to get world units. No `vector-effect: non-scaling-stroke` anywhere (svg2pdf does not
 * support it, see spec 4): every stroke width and font size is a multiple of lineUnit.
 */
export const STYLE = {
  paper: '#ffffff',

  // walls
  wallFill: '#3a3a3a',
  ghostFill: '#d6d6d6', // lower level walls

  // grid
  gridMinor: '#eeeeee',
  gridMajor: '#d8d8d8',
  gridMinorWidth: 0.5,
  gridMajorWidth: 1,
  gridMinPx: 6, // minor grid hidden when its lines would be closer than this

  // rooms
  roomFill: '#f4efe6',
  roomFillOverImage: 0.55, // room fill opacity when a background image is shown
  roomText: '#3d3a35',
  text: 12, // room name
  areaText: 11,
  labelPadding: 4,

  // objects
  objectStroke: '#333333',
  objectFillOpacity: 0.35,
  objectLine: 1,

  // openings
  openingStroke: '#222222',
  leafWidth: 1.5,
  arcWidth: 1,
  frameWidth: 0.75,
  pocketStroke: '#ffffff', // dashed pocket drawn over the dark wall
  dash: [4, 3],

  // dimensions
  dimColor: '#4a4a4a',
  dimText: 11,
  dimLine: 0.75,
  dimTick: 6, // half length of the 45 degree end tick
  dimTickWidth: 1.25,
  dimExtGap: 3, // gap between the measured point and the extension line
  dimExtOvershoot: 4,
  dimTextGap: 3, // distance between the line and the text baseline

  // selection (screen only)
  selection: '#1e6fd9',
  selectionWidth: 2,
  selectionNodeRadius: 5,
} as const;

/** svg2pdf maps Helvetica to the PDF core font; browsers fall back to Arial / sans-serif. */
export const FONT_FAMILY = 'Helvetica, Arial, sans-serif';

/** Rough width of a text in the plan font (Helvetica average glyph width ~0.55 em). */
export function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.55;
}

/** Text angle in degrees within ]-90, 90]: a text is never drawn upside down. */
export function readableAngle(deg: number): number {
  let a = ((deg % 360) + 360) % 360; // [0, 360)
  if (a > 90 && a <= 270) a -= 180;
  else if (a > 270) a -= 360;
  return a;
}

/** Dash array in world units for a dash pattern in display pixels. */
export function dashArray(lineUnit: number, pattern: readonly number[] = STYLE.dash): string {
  return pattern.map((v) => v * lineUnit).join(' ');
}

/** Coordinate for SVG attributes: rounded to 1/100 cm, no "-0". Sizes derived from lineUnit stay unrounded. */
export function num(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}
