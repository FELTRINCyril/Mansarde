import type { JSX, ReactNode } from 'react';
import type { GenericShape, LShapeParams } from '../core/model/types';

/**
 * Parametric top-view symbols, drawn in centimeters, centered at (0,0) in the object's local axes.
 * The back side (the one placed against a wall) is -y, the front is +y. Stroke width is lineUnit.
 * No transform scale is used: every ellipse and radius is computed from w and d, and every
 * coordinate stays finite for any w, d > 0. The main body uses `fill` (the renderer applies it at
 * reduced opacity), detail lines use fill="none".
 */
export interface SymbolProps {
  w: number;
  d: number;
  lineUnit: number;
  stroke: string;
  fill: string;
  /** Rotation (degrees) and mirror the renderer applies to the symbol; only used to keep text labels readable. */
  rotation?: number;
  mirrored?: boolean;
}
export type SymbolComponent = (p: SymbolProps) => JSX.Element;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp v to [lo, max(lo, hi)] so that a collapsing range never yields a negative size. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}

function dash(lineUnit: number): string {
  return `${4 * lineUnit} ${3 * lineUnit}`;
}

/** Common stroked group: detail elements inherit stroke and have no fill unless they set one. */
function Sym({ p, children }: { p: SymbolProps; children: ReactNode }): JSX.Element {
  return (
    <g stroke={p.stroke} strokeWidth={p.lineUnit} strokeLinejoin="round" strokeLinecap="round" fill="none">
      {children}
    </g>
  );
}

/** Filled rectangle given by its top-left corner and size. */
function Box({ x, y, w, h, rx = 0, fill = 'none' }: { x: number; y: number; w: number; h: number; rx?: number; fill?: string }): JSX.Element {
  return <rect x={x} y={y} width={Math.max(w, 0)} height={Math.max(h, 0)} rx={Math.max(rx, 0)} fill={fill} />;
}

function Line({ x1, y1, x2, y2, dashed }: { x1: number; y1: number; x2: number; y2: number; dashed?: string }): JSX.Element {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} strokeDasharray={dashed} />;
}

/** Polyline arrow: the head is drawn on the last segment. Nothing for a degenerate path. */
function Arrow({ pts, head }: { pts: Array<[number, number]>; head: number }): JSX.Element | null {
  if (pts.length < 2) return null;
  const [x1, y1] = pts[pts.length - 2] as [number, number];
  const [x2, y2] = pts[pts.length - 1] as [number, number];
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (!(len > 1e-9)) return null;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const h = Math.min(head, len * 0.5);
  const bx = x2 - ux * h;
  const by = y2 - uy * h;
  const nx = -uy * h * 0.5;
  const ny = ux * h * 0.5;
  return (
    <g>
      <polyline points={pts.map(([x, y]) => `${x},${y}`).join(' ')} />
      <polyline points={`${bx + nx},${by + ny} ${x2},${y2} ${bx - nx},${by - ny}`} />
    </g>
  );
}

/**
 * Short centered text label. The font is 10 * lineUnit, shrunk to fit inside the box; the label is
 * skipped when it would be smaller than 6 * lineUnit (unreadable). The renderer's mirror is undone
 * and the text turned by 180 degrees when the symbol rotation would show it upside down. Full
 * opacity even inside the renderer's translucent fill group.
 */
function Label({ text, p }: { text: string; p: SymbolProps }): JSX.Element | null {
  const { w, d, lineUnit } = p;
  const byWidth = (0.85 * w) / (0.6 * text.length);
  const byDepth = 0.8 * d;
  const size = Math.min(10 * lineUnit, byWidth, byDepth);
  if (!(size >= 6 * lineUnit)) return null;
  const angle = (((p.rotation ?? 0) % 360) + 360) % 360;
  const upsideDown = angle > 90 && angle <= 270;
  const transform = [p.mirrored ? 'scale(-1 1)' : '', upsideDown ? 'rotate(180)' : ''].filter(Boolean).join(' ');
  return (
    <text
      x={0}
      y={0}
      dy={0.35 * size}
      fontSize={size}
      textAnchor="middle"
      fill={p.stroke}
      fillOpacity={1}
      stroke="none"
      fontFamily="Helvetica, Arial, sans-serif"
      transform={transform || undefined}
    >
      {text}
    </text>
  );
}

// ---------------------------------------------------------------------------
// Symbol factories
// ---------------------------------------------------------------------------

function bed(pillows: 1 | 2): SymbolComponent {
  return (p) => {
    const { w, d } = p;
    const hw = w / 2;
    const hd = d / 2;
    const m = Math.min(w, d) * 0.05;
    const ph = Math.min(d * 0.16, 35);
    const gap = m;
    const pw = pillows === 1 ? Math.min(w * 0.6, 60) : Math.min((w - 2 * m - gap) / 2, 70);
    const py = -hd + m;
    const rx = Math.min(pw, ph) * 0.3;
    const yf = py + ph + 2 * m;
    const fold = Math.min(d * 0.15, w * 0.3);
    return (
      <Sym p={p}>
        <Box x={-hw} y={-hd} w={w} h={d} fill={p.fill} />
        {pillows === 1 ? (
          <Box x={-pw / 2} y={py} w={pw} h={ph} rx={rx} />
        ) : (
          <>
            <Box x={-gap / 2 - pw} y={py} w={pw} h={ph} rx={rx} />
            <Box x={gap / 2} y={py} w={pw} h={ph} rx={rx} />
          </>
        )}
        <Line x1={-hw} y1={yf + fold} x2={hw} y2={yf} />
      </Sym>
    );
  };
}

const Nightstand: SymbolComponent = (p) => {
  const { w, d } = p;
  const e = Math.min(w, d) * 0.15;
  return (
    <Sym p={p}>
      <Box x={-w / 2} y={-d / 2} w={w} h={d} fill={p.fill} />
      <Box x={-w / 2 + e} y={-d / 2 + e} w={w - 2 * e} h={d - 2 * e} />
    </Sym>
  );
};

const Wardrobe: SymbolComponent = (p) => {
  const { w, d, lineUnit } = p;
  const hw = w / 2;
  const hd = d / 2;
  const e = Math.min(d * 0.3, 18); // door leaf depth: ticks stay readable at plan scale
  const doors = Math.max(1, Math.round(w / 60));
  const lines: JSX.Element[] = [];
  for (let i = 1; i < doors; i++) {
    const x = -hw + (i * w) / doors;
    lines.push(<Line key={i} x1={x} y1={hd - e} x2={x} y2={hd} />);
  }
  return (
    <Sym p={p}>
      <Box x={-hw} y={-hd} w={w} h={d} fill={p.fill} />
      <Line x1={-hw} y1={hd - e} x2={hw} y2={hd - e} />
      {lines}
      <Line x1={-hw} y1={-hd} x2={hw} y2={hd} dashed={dash(lineUnit)} />
      <Line x1={hw} y1={-hd} x2={-hw} y2={hd} dashed={dash(lineUnit)} />
    </Sym>
  );
};

/** Drawer lines run across the full width, spread over the depth. */
const Dresser: SymbolComponent = (p) => {
  const { w, d } = p;
  const hw = w / 2;
  const hd = d / 2;
  const lines: JSX.Element[] = [];
  for (let i = 1; i <= 3; i++) {
    const y = -hd + (i * d) / 4;
    lines.push(<Line key={i} x1={-hw} y1={y} x2={hw} y2={y} />);
  }
  return (
    <Sym p={p}>
      <Box x={-hw} y={-hd} w={w} h={d} fill={p.fill} />
      {lines}
    </Sym>
  );
};

const Crib: SymbolComponent = (p) => {
  const { w, d } = p;
  const e = Math.min(w, d) * 0.1;
  const bars = clamp(Math.round(d / 10), 2, 40);
  const lines: JSX.Element[] = [];
  for (let i = 1; i < bars; i++) {
    const y = -d / 2 + (i * d) / bars;
    lines.push(<Line key={i} x1={-w / 2} y1={y} x2={-w / 2 + e} y2={y} />);
    lines.push(<Line key={`r${i}`} x1={w / 2 - e} y1={y} x2={w / 2} y2={y} />);
  }
  return (
    <Sym p={p}>
      <Box x={-w / 2} y={-d / 2} w={w} h={d} fill={p.fill} />
      <Box x={-w / 2 + e} y={-d / 2 + e} w={w - 2 * e} h={d - 2 * e} />
      {lines}
    </Sym>
  );
};

function sofa(seats: number, corner = false): SymbolComponent {
  return (p) => {
    const { w, d } = p;
    const hw = w / 2;
    const hd = d / 2;
    const bt = Math.min(d * 0.25, 25); // back thickness
    const at = Math.min(w * 0.1, 18); // armrest thickness
    const rx = Math.min(w, d) * 0.04;
    const seatTop = -hd + bt;
    const dividers: JSX.Element[] = [];
    if (corner) {
      const sx0 = -hw + bt;
      const sx1 = hw - at;
      const xdiv = sx0 + (sx1 - sx0) * 0.4;
      const ymid = seatTop + (hd - seatTop) * 0.5;
      dividers.push(<Line key="v" x1={xdiv} y1={seatTop} x2={xdiv} y2={hd} />);
      dividers.push(<Line key="h" x1={sx0} y1={ymid} x2={xdiv} y2={ymid} />);
      return (
        <Sym p={p}>
          <Box x={-hw} y={-hd} w={w} h={d} rx={rx} fill={p.fill} />
          <Box x={-hw} y={-hd} w={w} h={bt} rx={rx} />
          <Box x={-hw} y={seatTop} w={bt} h={hd - seatTop} rx={rx} />
          <Box x={hw - at} y={seatTop} w={at} h={hd - seatTop} rx={rx} />
          {dividers}
        </Sym>
      );
    }
    const sx0 = -hw + at;
    const seatW = w - 2 * at;
    for (let i = 1; i < seats; i++) {
      const x = sx0 + (i * seatW) / seats;
      dividers.push(<Line key={i} x1={x} y1={seatTop} x2={x} y2={hd} />);
    }
    return (
      <Sym p={p}>
        <Box x={-hw} y={-hd} w={w} h={d} rx={rx} fill={p.fill} />
        <Box x={-hw} y={-hd} w={w} h={bt} rx={rx} />
        <Box x={-hw} y={seatTop} w={at} h={hd - seatTop} rx={rx} />
        <Box x={hw - at} y={seatTop} w={at} h={hd - seatTop} rx={rx} />
        {dividers}
      </Sym>
    );
  };
}

/** Plain framed top: coffee table, rectangular table. */
const Table: SymbolComponent = (p) => (
  <Sym p={p}>
    <Box x={-p.w / 2} y={-p.d / 2} w={p.w} h={p.d} fill={p.fill} />
  </Sym>
);

const RoundTable: SymbolComponent = (p) => (
  <Sym p={p}>
    <ellipse cx={0} cy={0} rx={p.w / 2} ry={p.d / 2} fill={p.fill} />
  </Sym>
);

/** Screen drawn as a thick strip along the back, shelf line at the front. */
const TvUnit: SymbolComponent = (p) => {
  const { w, d } = p;
  const e = Math.min(d * 0.15, 6);
  const sw = w * 0.6;
  const sh = Math.min(d * 0.15, 6);
  return (
    <Sym p={p}>
      <Box x={-w / 2} y={-d / 2} w={w} h={d} fill={p.fill} />
      <Box x={-sw / 2} y={-d / 2 + e} w={sw} h={sh} fill={p.stroke} />
      <Line x1={-w / 2} y1={d / 2 - e} x2={w / 2} y2={d / 2 - e} />
    </Sym>
  );
};

/** Frame + shelves; the display cabinet adds a glazed double line on the front side. */
function shelves(glazed: boolean): SymbolComponent {
  return (p) => {
    const { w, d } = p;
    const hw = w / 2;
    const hd = d / 2;
    const e = Math.min(d * 0.12, 4);
    const n = clamp(Math.round(w / 33), 1, 60);
    const lines: JSX.Element[] = [];
    for (let i = 1; i < n; i++) {
      const x = -hw + (i * w) / n;
      lines.push(<Line key={i} x1={x} y1={-hd} x2={x} y2={glazed ? hd - 2 * e : hd} />);
    }
    return (
      <Sym p={p}>
        <Box x={-hw} y={-hd} w={w} h={d} fill={p.fill} />
        {lines}
        {glazed ? (
          <>
            <Line x1={-hw} y1={hd - e} x2={hw} y2={hd - e} />
            <Line x1={-hw} y1={hd - 2 * e} x2={hw} y2={hd - 2 * e} />
          </>
        ) : null}
      </Sym>
    );
  };
}

const Desk: SymbolComponent = (p) => {
  const { w, d, lineUnit } = p;
  const cw = Math.min(w * 0.4, 50);
  const cd = Math.min(d * 0.6, 45);
  return (
    <Sym p={p}>
      <Box x={-w / 2} y={-d / 2} w={w} h={d} fill={p.fill} />
      <g strokeDasharray={dash(lineUnit)}>
        <Box x={-cw / 2} y={d / 2 - cd} w={cw} h={cd} />
      </g>
    </Sym>
  );
};

const Chair: SymbolComponent = (p) => {
  const { w, d } = p;
  const bk = d * 0.2;
  const rx = Math.min(w, d) * 0.08;
  return (
    <Sym p={p}>
      <Box x={-w / 2} y={-d / 2 + bk} w={w} h={d - bk} rx={rx} fill={p.fill} />
      <Box x={-w / 2} y={-d / 2} w={w} h={bk} rx={rx} fill={p.fill} />
    </Sym>
  );
};

/** Worktop: thin back line (splashback) and a joint between each 60 cm cabinet module. */
const Counter: SymbolComponent = (p) => {
  const { w, d } = p;
  const hw = w / 2;
  const hd = d / 2;
  const e = Math.min(d * 0.1, 4);
  const modules = clamp(Math.round(w / 60), 1, 60);
  const joints: JSX.Element[] = [];
  for (let i = 1; i < modules; i++) {
    const x = -hw + (i * w) / modules;
    joints.push(<Line key={i} x1={x} y1={-hd + e} x2={x} y2={hd} />);
  }
  return (
    <Sym p={p}>
      <Box x={-hw} y={-hd} w={w} h={d} fill={p.fill} />
      <Line x1={-hw} y1={-hd + e} x2={hw} y2={-hd + e} />
      {joints}
    </Sym>
  );
};

const Sink: SymbolComponent = (p) => {
  const { w, d } = p;
  const bw = w * 0.7;
  const by = -d / 2 + d * 0.22;
  const bh = d * 0.68;
  const tapR = Math.min(w, d) * 0.04;
  const tapY = -d / 2 + d * 0.11;
  return (
    <Sym p={p}>
      <Box x={-w / 2} y={-d / 2} w={w} h={d} fill={p.fill} />
      <Box x={-bw / 2} y={by} w={bw} h={bh} rx={Math.min(bw, bh) * 0.25} />
      <circle cx={0} cy={tapY} r={tapR} />
      <Line x1={0} y1={tapY} x2={0} y2={by} />
    </Sym>
  );
};

const Cooktop: SymbolComponent = (p) => {
  const { w, d } = p;
  const r = Math.min(w, d) * 0.16;
  const ox = w / 4;
  const oy = d / 4;
  return (
    <Sym p={p}>
      <Box x={-w / 2} y={-d / 2} w={w} h={d} fill={p.fill} />
      <circle cx={-ox} cy={-oy} r={r} />
      <circle cx={ox} cy={-oy} r={r} />
      <circle cx={-ox} cy={oy} r={r} />
      <circle cx={ox} cy={oy} r={r} />
    </Sym>
  );
};

function appliance(text: string): SymbolComponent {
  return (p) => (
    <Sym p={p}>
      <Box x={-p.w / 2} y={-p.d / 2} w={p.w} h={p.d} fill={p.fill} />
      <Label text={text} p={p} />
    </Sym>
  );
}

const Wc: SymbolComponent = (p) => {
  const { w, d } = p;
  const tw = w * 0.75;
  const th = d * 0.28;
  const bowlTop = -d / 2 + th;
  const bowlH = d - th;
  return (
    <Sym p={p}>
      <Box x={-tw / 2} y={-d / 2} w={tw} h={th} rx={Math.min(tw, th) * 0.15} fill={p.fill} />
      <ellipse cx={0} cy={bowlTop + bowlH / 2} rx={w * 0.45} ry={bowlH / 2} fill={p.fill} />
      <ellipse cx={0} cy={bowlTop + bowlH / 2} rx={w * 0.3} ry={bowlH * 0.34} />
    </Sym>
  );
};

const Washbasin: SymbolComponent = (p) => {
  const { w, d } = p;
  const tapR = Math.min(w, d) * 0.04;
  const tapY = -d / 2 + d * 0.12;
  return (
    <Sym p={p}>
      <Box x={-w / 2} y={-d / 2} w={w} h={d} fill={p.fill} />
      <ellipse cx={0} cy={d * 0.08} rx={w * 0.38} ry={d * 0.34} />
      <circle cx={0} cy={tapY} r={tapR} />
    </Sym>
  );
};

const Shower: SymbolComponent = (p) => {
  const { w, d } = p;
  const r = Math.min(w, d) * 0.04;
  return (
    <Sym p={p}>
      <Box x={-w / 2} y={-d / 2} w={w} h={d} fill={p.fill} />
      <Line x1={-w / 2} y1={-d / 2} x2={w / 2} y2={d / 2} />
      <Line x1={w / 2} y1={-d / 2} x2={-w / 2} y2={d / 2} />
      <circle cx={0} cy={0} r={r} fill={p.fill} />
    </Sym>
  );
};

const Bathtub: SymbolComponent = (p) => {
  const { w, d } = p;
  const e = Math.min(w, d) * 0.1;
  const iw = w - 2 * e;
  const ih = d - 2 * e;
  const drainR = Math.min(w, d) * 0.03;
  return (
    <Sym p={p}>
      <Box x={-w / 2} y={-d / 2} w={w} h={d} fill={p.fill} />
      <Box x={-w / 2 + e} y={-d / 2 + e} w={iw} h={ih} rx={Math.min(iw, ih) * 0.35} />
      <circle cx={-w / 2 + e + Math.min(iw, ih) * 0.3} cy={0} r={drainR} />
    </Sym>
  );
};

/** Distances of step lines from the start of a run of length `len`: every 25 cm, capped to ~80 lines. */
function stepOffsets(len: number): number[] {
  const step = Math.max(25, len / 80);
  const out: number[] = [];
  for (let k = 1; k * step < len - 1e-6; k++) out.push(k * step);
  return out;
}

const StairsStraight: SymbolComponent = (p) => {
  const { w, d } = p;
  const hw = w / 2;
  const hd = d / 2;
  const m = Math.min(w, d) * 0.1;
  const head = Math.min(w * 0.25, 20);
  return (
    <Sym p={p}>
      <Box x={-hw} y={-hd} w={w} h={d} fill={p.fill} />
      {stepOffsets(d).map((o) => (
        <line key={o} data-step="" x1={-hw} y1={-hd + o} x2={hw} y2={-hd + o} />
      ))}
      <Arrow
        pts={[
          [0, hd - m],
          [0, -hd + m],
        ]}
        head={head}
      />
    </Sym>
  );
};

const StairsQuarter: SymbolComponent = (p) => {
  const { w, d } = p;
  const hw = w / 2;
  const hd = d / 2;
  const s = Math.min(w, d); // depth of the winder landing at the back
  const yb = -hd + s; // bottom edge of the landing
  const run = d - s; // straight run length, from yb to the front
  const head = Math.min(w * 0.3, 25);
  const m = Math.min(w, d) * 0.1;
  const ay = -hd + s * 0.25; // the arrow turns near the outer (back) edge, away from the pivot
  const winders: JSX.Element[] = [];
  for (let k = 1; k <= 3; k++) {
    const theta = (Math.PI / 2) * (k / 4);
    const c = Math.cos(theta);
    const sn = Math.sin(theta);
    const t = Math.min(w / c, s / sn);
    winders.push(<line key={`w${k}`} data-step="" x1={-hw} y1={yb} x2={-hw + c * t} y2={yb - sn * t} />);
  }
  return (
    <Sym p={p}>
      <Box x={-hw} y={-hd} w={w} h={d} fill={p.fill} />
      <Line x1={-hw} y1={yb} x2={hw} y2={yb} />
      {stepOffsets(run).map((o) => (
        <line key={o} data-step="" x1={-hw} y1={yb + o} x2={hw} y2={yb + o} />
      ))}
      {winders}
      <Arrow
        pts={[
          [hw / 2, hd - m],
          [hw / 2, ay],
          [-hw + m, ay],
        ]}
        head={head}
      />
    </Sym>
  );
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Key = catalog id. Generic shapes are drawn by GenericSymbol instead. */
export const SYMBOLS: Record<string, SymbolComponent> = {
  'bed-90': bed(1),
  'bed-140': bed(2),
  'bed-160': bed(2),
  'bed-180': bed(2),
  nightstand: Nightstand,
  wardrobe: Wardrobe,
  dresser: Dresser,
  crib: Crib,
  'sofa-2': sofa(2),
  'sofa-3': sofa(3),
  'sofa-corner': sofa(0, true),
  armchair: sofa(1),
  'coffee-table': Table,
  'tv-unit': TvUnit,
  bookcase: shelves(false),
  'display-cabinet': shelves(true),
  desk: Desk,
  chair: Chair,
  'table-rect': Table,
  'table-round': RoundTable,
  counter: Counter,
  sink: Sink,
  cooktop: Cooktop,
  fridge: appliance('Frigo'),
  dishwasher: appliance('LV'),
  wc: Wc,
  washbasin: Washbasin,
  shower: Shower,
  bathtub: Bathtub,
  'washing-machine': appliance('LL'),
  'stairs-straight': StairsStraight,
  'stairs-quarter': StairsQuarter,
};

/**
 * Generic rectangle, ellipse or L. The L removes its notch at the local (+x, +y) corner, matching
 * objectFootprint; `mirrored` is handled by the renderer's transform, not here. A null `lshape`
 * falls back to a plain rectangle, like objectFootprint.
 */
export function GenericSymbol(p: SymbolProps & { shape: GenericShape; lshape: LShapeParams | null }): JSX.Element {
  const { w, d } = p;
  const hw = w / 2;
  const hd = d / 2;
  if (p.shape === 'circle') {
    return (
      <Sym p={p}>
        <ellipse cx={0} cy={0} rx={hw} ry={hd} fill={p.fill} />
      </Sym>
    );
  }
  if (p.shape === 'lshape' && p.lshape) {
    const nw = clamp(p.lshape.notchWidth, 0, w);
    const nd = clamp(p.lshape.notchDepth, 0, d);
    const pts: Array<[number, number]> = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd - nd],
      [hw - nw, hd - nd],
      [hw - nw, hd],
      [-hw, hd],
    ];
    return (
      <Sym p={p}>
        <polygon points={pts.map(([x, y]) => `${x},${y}`).join(' ')} fill={p.fill} />
      </Sym>
    );
  }
  return (
    <Sym p={p}>
      <Box x={-hw} y={-hd} w={w} h={d} fill={p.fill} />
    </Sym>
  );
}
