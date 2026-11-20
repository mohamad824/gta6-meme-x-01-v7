// gta6-meme-x-01 v7 — "STATE OF LEONIDA DRIVER LICENCE"
// A fake DMV licence for one very patient gamer. Drawn entirely in code:
// vector shapes + a 5x7 bitmap font, pure-JS PNG encoding, stdlib only.
// Deterministic: no clock, no network, no files outside the repository.
// Run: mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- PNG encode
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function pngEncode(rgb: Uint8Array, w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- framebuffer
type RGB = [number, number, number];
const fb = new Uint8Array(W * H * 3);
function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  fb[i] = c[0];
  fb[i + 1] = c[1];
  fb[i + 2] = c[2];
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) setPx(xx, yy, c);
  }
}
function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  const rr = Math.round(r);
  for (let dy = -rr; dy <= rr; dy++) {
    const dx = Math.floor(Math.sqrt(rr * rr - dy * dy));
    fillRect(cx - dx, cy + dy, dx * 2 + 1, 1, c);
  }
}
function roundRect(x: number, y: number, w: number, h: number, r: number, c: RGB): void {
  fillRect(x + r, y, w - 2 * r, h, c);
  fillRect(x, y + r, w, h - 2 * r, c);
  fillCircle(x + r, y + r, r, c);
  fillCircle(x + w - r, y + r, r, c);
  fillCircle(x + r, y + h - r, r, c);
  fillCircle(x + w - r, y + h - r, r, c);
}
function line(x0: number, y0: number, x1: number, y1: number, c: RGB, wd: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  const rad = Math.max(1, Math.round(wd / 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillCircle(Math.round(x0 + dx * t), Math.round(y0 + dy * t), rad, c);
  }
}
function fillPoly(pts: Array<[number, number]>, c: RGB): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      fillRect(Math.ceil(xs[i]), y, Math.floor(xs[i + 1]) - Math.ceil(xs[i]) + 1, 1, c);
    }
  }
}
function strokePoly(pts: Array<[number, number]>, closed: boolean, c: RGB, wd: number): void {
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    line(x0, y0, x1, y1, c, wd);
  }
}
// Four-pointed sparkle (the ghost's eyes, and small accents).
function sparkle(cx: number, cy: number, r: number, c: RGB): void {
  const k = 0.26;
  const pts: Array<[number, number]> = [
    [cx, cy - r],
    [cx + r * k, cy - r * k],
    [cx + r, cy],
    [cx + r * k, cy + r * k],
    [cx, cy + r],
    [cx - r * k, cy + r * k],
    [cx - r, cy],
    [cx - r * k, cy - r * k],
  ];
  fillPoly(pts, c);
}
// Five-pointed star (the magenta coin).
function star5(cx: number, cy: number, ro: number, ri: number, c: RGB): void {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  fillPoly(pts, c);
}

// ---------------------------------------------------------------- bitmap font
// 5x7 glyphs, rows as '0'/'1' strings. Uppercase + digits + punctuation +
// the lowercase letters needed for "make.fun".
const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '00000', '01100', '01000'],
  ':': ['00000', '01100', '00000', '00000', '00000', '01100', '00000'],
  ';': ['00000', '01100', '00000', '00000', '00000', '01100', '01000'],
  "'": ['00100', '00100', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  $: ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '*': ['00000', '10101', '01110', '11111', '01110', '10101', '00000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
  '@': ['01110', '10001', '10111', '10101', '10110', '10000', '01110'],
  '"': ['01010', '01010', '00000', '00000', '00000', '00000', '00000'],
  '•': ['00000', '00000', '01100', '01100', '00000', '00000', '00000'],
  _: ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
  a: ['00000', '00000', '01110', '00001', '01111', '10001', '01111'],
  b: ['10000', '10000', '11110', '10001', '10001', '10001', '11110'],
  c: ['00000', '00000', '01110', '10001', '10000', '10001', '01110'],
  d: ['00001', '00001', '01111', '10001', '10001', '10001', '01111'],
  e: ['00000', '00000', '01110', '10001', '11111', '10000', '01110'],
  f: ['00110', '01000', '01000', '11110', '01000', '01000', '01000'],
  g: ['00000', '01111', '10001', '10001', '01111', '00001', '01110'],
  h: ['10000', '10000', '11110', '10001', '10001', '10001', '10001'],
  i: ['00100', '00000', '01100', '00100', '00100', '00100', '01110'],
  k: ['10000', '10000', '10010', '10100', '11000', '10100', '10010'],
  l: ['01100', '00100', '00100', '00100', '00100', '00100', '01110'],
  m: ['00000', '00000', '11010', '10101', '10101', '10101', '10101'],
  n: ['00000', '00000', '11110', '10001', '10001', '10001', '10001'],
  o: ['00000', '00000', '01110', '10001', '10001', '10001', '01110'],
  p: ['00000', '00000', '11110', '10001', '11110', '10000', '10000'],
  r: ['00000', '00000', '10110', '11001', '10000', '10000', '10000'],
  s: ['00000', '00000', '01111', '10000', '01110', '00001', '11110'],
  t: ['01000', '01000', '11110', '01000', '01000', '01000', '00110'],
  u: ['00000', '00000', '10001', '10001', '10001', '10011', '01101'],
  w: ['00000', '00000', '10001', '10101', '10101', '10101', '01010'],
  y: ['00000', '00000', '10001', '10001', '01111', '00001', '01110'],
};
function textWidth(s: string, scale: number, gap = 1): number {
  return s.length * (5 + gap) * scale - gap * scale;
}
function drawText(
  s: string,
  x: number,
  y: number,
  scale: number,
  c: RGB,
  align: 'left' | 'center' | 'right' = 'left',
  gap = 1,
): void {
  const w = textWidth(s, scale, gap);
  let cx = x;
  if (align === 'center') cx = x - Math.floor(w / 2);
  if (align === 'right') cx = x - w;
  for (let i = 0; i < s.length; i++) {
    const g = GLYPHS[s[i]] ?? GLYPHS['?'];
    const gx = cx + i * (5 + gap) * scale;
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (g[row][col] === '1') fillRect(gx + col * scale, y + row * scale, scale, scale, c);
      }
    }
  }
}

// ---------------------------------------------------------------- palette
const NAVY: RGB = [20, 38, 78];
const NAVY_LT: RGB = [44, 74, 124];
const MAGENTA: RGB = [230, 0, 126];
const MAGENTA_DK: RGB = [196, 0, 102];
const CREAM: RGB = [255, 246, 227];
const INK: RGB = [22, 22, 30];
const WHITE: RGB = [255, 255, 255];
const YELLOW: RGB = [255, 199, 0];
const PINK_LT: RGB = [255, 94, 168];
const BLACK: RGB = [12, 12, 16];

// ---------------------------------------------------------------- background
// Leonida sunset: deep purple -> magenta -> orange, full canvas.
const STOPS: Array<[number, RGB]> = [
  [0, [30, 11, 59]],
  [0.5, [142, 27, 94]],
  [1, [243, 114, 44]],
];
for (let y = 0; y < H; y++) {
  const t = y / (H - 1);
  let a = STOPS[0];
  let b = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (t >= STOPS[i][0] && t <= STOPS[i + 1][0]) {
      a = STOPS[i];
      b = STOPS[i + 1];
      break;
    }
  }
  const f = (t - a[0]) / Math.max(1e-9, b[0] - a[0]);
  const c: RGB = [
    Math.round(a[1][0] + (b[1][0] - a[1][0]) * f),
    Math.round(a[1][1] + (b[1][1] - a[1][1]) * f),
    Math.round(a[1][2] + (b[1][2] - a[1][2]) * f),
  ];
  fillRect(0, y, W, 1, c);
}

// ---------------------------------------------------------------- the card
// Drop shadow, then the cream licence card with a navy border.
roundRect(36, 38, 964, 964, 26, [16, 6, 34]);
roundRect(30, 30, 964, 964, 26, NAVY);
roundRect(38, 38, 948, 948, 20, CREAM);

// Header band: navy, "STATE OF LEONIDA" + "DRIVER LICENCE".
roundRect(44, 44, 936, 128, 14, NAVY);
drawText('STATE OF LEONIDA', 512, 58, 4, WHITE, 'center', 2);
drawText('DRIVER LICENCE', 512, 94, 8, WHITE, 'center');

// Magenta strip: the issuing office is make.fun (functional mention #1).
roundRect(44, 180, 936, 46, 10, MAGENTA);
drawText('DEPT. OF WAITING • NO. 000013 • ISSUED BY make.fun', 512, 192, 3, WHITE, 'center', 0);

// ---------------------------------------------------------------- photo box
// The ghost as the BIG licence photo: the central visual anchor.
roundRect(56, 244, 364, 456, 18, BLACK);
roundRect(60, 248, 356, 448, 15, MAGENTA);
drawText('LICENCE PHOTO', 238, 260, 4, WHITE, 'center');
// Ghost body: dome + straight sides + scalloped sheet bottom.
const GCX = 238;
const GTOP = 298;
const GR = 130;
const GBASE = 596;
const GDEPTH = 44;
const ghostPts: Array<[number, number]> = [];
for (let a = 180; a >= 0; a -= 5) {
  const rad = (a * Math.PI) / 180;
  ghostPts.push([GCX + GR * Math.cos(rad), GTOP + GR - GR * Math.sin(rad)]);
}
ghostPts.push([GCX + GR, GBASE]);
const SC = 4;
const sw = (2 * GR) / SC;
for (let i = 0; i < SC; i++) {
  const x0 = GCX + GR - (i + 1) * sw;
  const x1 = GCX + GR - i * sw;
  const mid = (x0 + x1) / 2;
  for (let a = 0; a <= 180; a += 12) {
    const rad = (a * Math.PI) / 180;
    ghostPts.push([mid + (sw / 2) * Math.cos(rad), GBASE + GDEPTH * Math.sin(rad)]);
  }
}
ghostPts.push([GCX - GR, GBASE]);
fillPoly(ghostPts, WHITE);
strokePoly(ghostPts, true, BLACK, 7);
// Sparkle eyes, no mouth — the official press-kit mark. Sized large so
// they still read as sparkles at 480x480.
sparkle(GCX - 52, 440, 30, BLACK);
sparkle(GCX + 52, 440, 30, BLACK);
// The magenta star coin, held in the ghost's little round hand.
fillCircle(352, 575, 45, BLACK);
fillCircle(352, 575, 41, MAGENTA);
star5(352, 575, 27, 11, WHITE);
fillCircle(322, 600, 18, BLACK);
fillCircle(322, 600, 14, WHITE);
// Agent on file: make.fun (functional mention #2).
drawText('AGENT: make.fun', 238, 656, 4, WHITE, 'center', 0);

// ---------------------------------------------------------------- fields
const FX = 452;
const ROWS: Array<{ label: string; value: string; vscale: number }> = [
  { label: 'NAME', value: 'ONE PATIENT GAMER', vscale: 5 },
  { label: 'ISSUED', value: '17 SEP 2013', vscale: 5 },
  { label: 'EXPIRES', value: 'NEVER (STILL WAITING)', vscale: 4 },
  { label: 'RESTRICTIONS', value: 'MUST WAIT 13 YEARS', vscale: 4 },
  { label: 'EYES', value: 'TIRED FROM WAITING', vscale: 4 },
  { label: 'HEIGHT', value: '4,811 DAYS', vscale: 5 },
  { label: 'WEIGHT', value: 'ONE CHILDHOOD', vscale: 5 },
];
ROWS.forEach((row, i) => {
  const ly = 252 + i * 66;
  drawText(row.label, FX, ly, 3, NAVY_LT, 'left', 0);
  drawText(row.value, FX, ly + 24, row.vscale, INK, 'left', 0);
});

// Endorsements strip: carries the 214 GB / 2 delays / $79.99 facts.
drawText('ENDORSEMENTS: GTA VI • 214 GB • 2 DELAYS • FEE $79.99', 512, 724, 3, NAVY, 'center', 0);

// ---------------------------------------------------------------- killer line
// The climax field: the licence is valid from launch day — but the
// childhood it cost already expired 4,811 days ago.
roundRect(44, 786, 936, 86, 14, MAGENTA);
drawText('VALID FROM 19 NOV 2026.', 512, 796, 5, WHITE, 'center', 0);
drawText('MY CHILDHOOD EXPIRED 4,811 DAYS AGO.', 512, 834, 4, WHITE, 'center', 0);

// ---------------------------------------------------------------- payout band
// The punchline IS the make.fun payout (functional mention #3):
// the agent won $250 on make.fun while the holder waited.
roundRect(44, 884, 936, 84, 14, NAVY);
const segs: Array<{ t: string; c: RGB }> = [
  { t: 'MY AGENT ON ', c: WHITE },
  { t: 'make.fun', c: WHITE },
  { t: ' WON ', c: WHITE },
  { t: '$250', c: YELLOW },
  { t: ' WHILE I WAITED', c: WHITE },
];
const totalW = segs.reduce((n, s) => n + textWidth(s.t, 4, 0), 0);
let sx = Math.floor((W - totalW) / 2);
const sy = 884 + Math.floor((84 - 28) / 2);
for (const s of segs) {
  drawText(s.t, sx, sy, 4, s.c, 'left', 0);
  sx += textWidth(s.t, 4, 0);
}

// ---------------------------------------------------------------- output
mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(BOT_DIR, 'meme-v7.png'), pngEncode(fb, W, H));
try {
  copyFileSync(join(BOT_DIR, 'POST.json'), join(OUTPUT_DIR, 'POST.json'));
} catch (err) {
  console.error(`POST.json could not be copied from ${BOT_DIR}: ${(err as Error).message}`);
  process.exit(1);
}
