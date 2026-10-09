import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

/** Size of the parquet texture (px) and the length it covers (m): 256 px per meter, as plan-chambre. */
export const PARQUET_PX = 1024;
export const PARQUET_METERS = 4;
const PX_PER_M = PARQUET_PX / PARQUET_METERS;
/** Width of a board (m). */
const BOARD = 0.16;

/** Park-Miller generator of plan-chambre: the same boards on every run (fixed seed). */
function seeded(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

type Ctx = Pick<
  CanvasRenderingContext2D,
  'fillStyle' | 'strokeStyle' | 'lineWidth' | 'fillRect' | 'strokeRect' | 'beginPath' | 'moveTo' | 'bezierCurveTo' | 'stroke' | 'arc' | 'fill' | 'lineTo' | 'closePath'
>;

/**
 * Parquet of plan-chambre (floorTexture): rows of 16 cm boards of random lengths (0.9 to 1.9 m),
 * light wood hues, a few grain lines and dark joints.
 */
export function drawParquet(g: Ctx): void {
  const rnd = seeded(7);
  const pw = BOARD * PX_PER_M;
  for (let y = 0; y < PARQUET_PX; y += pw) {
    let x = -rnd() * PX_PER_M;
    while (x < PARQUET_PX) {
      const len = (0.9 + rnd() * 1.0) * PX_PER_M;
      const l = 60 + rnd() * 10;
      g.fillStyle = `hsl(${30 + rnd() * 6}, ${32 + rnd() * 8}%, ${l}%)`;
      g.fillRect(x, y, len, pw);
      g.strokeStyle = 'rgba(90,60,30,.10)';
      g.lineWidth = 1;
      for (let k = 0; k < 5; k++) {
        const yy = y + 4 + rnd() * (pw - 8);
        g.beginPath();
        g.moveTo(x, yy);
        g.bezierCurveTo(x + len * 0.3, yy + 2, x + len * 0.7, yy - 2, x + len, yy);
        g.stroke();
      }
      g.strokeStyle = 'rgba(60,40,20,.35)';
      g.strokeRect(x + 0.5, y + 0.5, len - 1, pw - 1);
      x += len;
    }
  }
}

/** Rug pattern of plan-chambre (rugTexture): 680 x 480 px, or 680 x 680 px when round. */
export function drawRug(g: Ctx, round: boolean): { width: number; height: number } {
  const W = 680;
  const H = round ? 680 : 480;
  if (round) {
    const r = W / 2;
    const disc = (radius: number, color: string) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(r, r, radius, 0, Math.PI * 2);
      g.fill();
    };
    disc(r, '#b5643f');
    disc(r - 22, '#eadbc4');
    g.strokeStyle = '#2f4f7a';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(r, r, r - 46, 0, Math.PI * 2);
    g.stroke();
    disc(r * 0.35, '#d8c3a2');
  } else {
    g.fillStyle = '#eadbc4';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#b5643f';
    g.fillRect(24, 24, W - 48, H - 48);
    g.fillStyle = '#eadbc4';
    g.fillRect(44, 44, W - 88, H - 88);
    g.strokeStyle = '#2f4f7a';
    g.lineWidth = 4;
    g.strokeRect(62, 62, W - 124, H - 124);
    g.fillStyle = '#d8c3a2';
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 4; j++) {
        const cx = 120 + i * 74;
        const cy = 120 + j * 80;
        g.beginPath();
        g.moveTo(cx, cy - 26);
        g.lineTo(cx + 22, cy);
        g.lineTo(cx, cy + 26);
        g.lineTo(cx - 22, cy);
        g.closePath();
        g.fill();
      }
    }
  }
  return { width: W, height: H };
}

function canvas(width: number, height: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d');
  if (!g) throw new Error('canvas 2d unavailable');
  return { c, g };
}

/**
 * Parquet texture (browser only), repeated every PARQUET_METERS: the floor UVs are in meters, so
 * the repeat is 1 / PARQUET_METERS.
 */
export function createParquetTexture(): Texture {
  const { c, g } = canvas(PARQUET_PX, PARQUET_PX);
  drawParquet(g);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.repeat.set(1 / PARQUET_METERS, 1 / PARQUET_METERS);
  return t;
}

/** Rug texture (browser only), stretched over the rug (furniture, task 12). */
export function createRugTexture(round: boolean): Texture {
  const { c, g } = canvas(680, round ? 680 : 480);
  drawRug(g, round);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
