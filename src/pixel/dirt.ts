import { Container, Graphics, Sprite, Texture } from 'pixi.js'
import { JOBS, PATCH_COLS, PATCH_ROWS, type CleanJob } from '../data/officeState'
import { BOARD, OFFICE, WINDOWS } from '../world/layout'
import { sprite, type SpriteName } from './assets'
import { PPM, WALL_FACE, px, py } from './geom'
import { PANES, boardBox, wallTop, windowBox, type Rect } from './office'
import { ticks, type Tick } from './stage'

/**
 * Bụi bẩn của văn phòng mới dọn vào. Mỗi việc dọn (src/data/officeState.ts) là một nhóm hình riêng:
 * trả Xu dọn chỗ nào thì gỡ nhóm đó (mờ nhanh, loé sáng, lấp lánh), không dựng lại cả phòng.
 *
 * Hình có sẵn của LimeZu: mạng nhện, nhện, vết ố (gói Halloween); vệt mốc, chuột, đống giấy (gói Jail);
 * giấy rơi, sách vở vương vãi (gói Classroom); thùng carton (gói Generic).
 * Phần vẽ bằng code chỉ là lớp ố: chấm pixel 2 px hai màu theo ma trận Bayer (không loang mịn), đậm sát tường,
 * nhạt giữa phòng, vệt chảy dọc trên tường. Đồ rác gom thành vài đống (góc trong, cạnh cửa), lối đi giữa để trống.
 * Mọi chi tiết rải theo số ngẫu nhiên cố định theo id (mở lại vẫn y như cũ).
 */

export interface DirtView {
  /** Bụi trên sàn / tường (nằm dưới người): thêm vào cuối lớp sàn */
  floor: Container
  /** Thùng carton đứng trên sàn: xếp lớp theo chân cùng người */
  sorted: Container[]
  /** id việc dọn → các nhóm hình của nó */
  parts: Map<string, Container[]>
}

/** Số giả ngẫu nhiên cố định theo chuỗi */
export function seeded(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

/** Nhiễu mịn (value noise) cố định theo hạt giống: f(x, y) ∈ [0, 1] */
function noise(seed: string, scale: number) {
  const cache = new Map<number, number>()
  const base = seeded(seed)()
  const at = (i: number, j: number) => {
    const k = i * 7919 + j * 104729
    let v = cache.get(k)
    if (v === undefined) {
      v = seeded(`${seed}:${i}:${j}:${base}`)()
      cache.set(k, v)
    }
    return v
  }
  const fade = (t: number) => t * t * (3 - 2 * t)
  return (x: number, y: number) => {
    const fx = x / scale, fy = y / scale
    const i = Math.floor(fx), j = Math.floor(fy)
    const u = fade(fx - i), v = fade(fy - j)
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
}

// ───────────────────────── Lớp ố chấm pixel ─────────────────────────

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map((r) => r.map((v) => (v + 0.5) / 16))
/** Hai màu ố (nhạt, đậm), cùng một độ trong */
const GRIME_LIGHT = [0x6b, 0x53, 0x38]
const GRIME_DARK = [0x4a, 0x3a, 0x28]
const GRIME_A = Math.round(0.42 * 255)

/**
 * Lớp ố của vùng `r` (pixel gốc), vẽ một lần ra texture. `density(x, y)` ∈ [0, 1] theo toạ độ bản đồ;
 * ô 2 px bật/tắt theo ma trận Bayer, chỗ đậm dùng màu sẫm. `mask` loại thêm ô (viền mềm giữa các mảng).
 */
function dither(r: Rect, density: (x: number, y: number) => number, mask?: (x: number, y: number) => boolean): Sprite {
  const W = Math.max(2, Math.round(r.w)), H = Math.max(2, Math.round(r.h))
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const img = g.createImageData(W, H)
  const d = img.data
  for (let by = 0; by < H; by += 2) {
    for (let bx = 0; bx < W; bx += 2) {
      const X = r.x + bx, Y = r.y + by
      const v = density(X, Y)
      if (v <= 0) continue
      const t = BAYER[(Y >> 1) & 3][(X >> 1) & 3]
      // Lõi cụm (đậm hẳn) tô liền màu; Bayer chỉ làm mép lởm chởm
      if ((v < 0.75 && v < t) || (mask && !mask(X, Y))) continue
      const col = v > 0.92 && t > 0.5 ? GRIME_DARK : v >= 0.75 ? GRIME_LIGHT : v > t + 0.38 ? GRIME_DARK : GRIME_LIGHT
      for (let yy = by; yy < Math.min(by + 2, H); yy++) {
        for (let xx = bx; xx < Math.min(bx + 2, W); xx++) {
          const k = (yy * W + xx) * 4
          d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = GRIME_A
        }
      }
    }
  }
  g.putImageData(img, 0, 0)
  const s = new Sprite(Texture.from(c))
  s.position.set(Math.round(r.x), Math.round(r.y))
  return s
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

// ───────────────────────── Hình LimeZu ─────────────────────────

/** Đặt một hình LimeZu nằm trên sàn (tâm ở x, y pixel gốc), lật ngẫu nhiên */
function lying(c: Container, name: SpriteName, x: number, y: number, rnd: () => number, tint = 0xffffff, alpha = 1) {
  const s = new Sprite(sprite(name))
  s.anchor.set(0.5)
  s.position.set(Math.round(x), Math.round(y))
  if (rnd() < 0.5) s.scale.x = -1
  s.tint = tint
  s.alpha = alpha
  c.addChild(s)
  return s
}

const LITTER: SpriteName[] = ['paperSheet', 'paperSheet', 'booksSmall1', 'booksSmall2', 'booksMess']
const RATS: SpriteName[] = ['rat1', 'rat2', 'rat3', 'rat4']
const STAINS: SpriteName[] = ['stain1', 'stain2', 'stain3', 'stain4']
const WEBS: SpriteName[] = ['webTop1', 'webTop2', 'webTop3', 'webTop4']
const DRIPS: SpriteName[] = ['drip1', 'drip2', 'drip3', 'drip4']
/** Giấy, sách cũ ngả màu */
const OLD = 0xd8ccb4

/** Mạng nhện treo từ mép trên (x = mép trái, pixel gốc). Tơ LimeZu rất nhạt: nhuộm sẫm cho nổi trên tường be. */
function web(c: Container, x: number, y: number, rnd: () => number, flip = false) {
  const s = new Sprite(sprite(WEBS[Math.floor(rnd() * WEBS.length)]))
  s.position.set(Math.round(x + (flip ? 16 : 0)), Math.round(y))
  if (flip) s.scale.x = -1
  s.tint = 0x8f8a99
  c.addChild(s)
}

/** Thùng carton đứng (tâm chân ở mét x, z) */
function cardboard(name: SpriteName, x: number, z: number): Container {
  const c = new Container()
  c.addChild(new Graphics().ellipse(Math.round(px(x)), Math.round(py(z)) - 1, 8, 2).fill({ color: 0x000000, alpha: 0.18 }))
  const s = new Sprite(sprite(name))
  s.anchor.set(0.5, 1)
  s.position.set(Math.round(px(x)), Math.round(py(z)))
  c.addChild(s)
  c.zIndex = Math.round(py(z))
  return c
}

// ───────────────────────── Khung từng việc ─────────────────────────

const rectOf = (j: CleanJob): Rect => {
  const r = j.rect!
  const x0 = Math.round(px(r.minX)), y0 = Math.round(py(r.minZ))
  return { x: x0, y: y0, w: Math.round(px(r.maxX)) - x0, h: Math.round(py(r.maxZ)) - y0 }
}

/** Khung pixel của từng việc dọn (để vẽ khung chọn và bấm chuột trong chế độ dọn dẹp) */
export function jobBox(j: CleanJob): Rect {
  if (j.kind === 'floor') return rectOf(j)
  if (j.kind === 'window') return windowBox(j.x!)
  if (j.kind === 'board') return boardBox()
  return { x: px(OFFICE.minX), y: wallTop(), w: (OFFICE.maxX - OFFICE.minX) * PPM, h: WALL_FACE }
}

// ───────────────────────── Sàn ─────────────────────────

/** Viền mềm: dải 8 px mỗi bên cạnh chung giữa hai mảng. Hai mảng kề nhau dùng hai nửa bàn cờ bù nhau,
 *  nên khi cả hai còn bẩn thì liền mạch, dọn một bên thì bên kia để lại mép răng cưa pixel. */
const FRINGE = 8

function floorDirt(j: CleanJob): { flat: Container; standing: Container[] } {
  const r = rectOf(j)
  const R = j.rect!
  const rnd = seeded(j.id)
  const flat = new Container()
  const col = Math.round((R.minX - OFFICE.minX) / ((OFFICE.maxX - OFFICE.minX) / PATCH_COLS))
  const row = Math.round((R.minZ - OFFICE.minZ) / ((OFFICE.maxZ - OFFICE.minZ) / PATCH_ROWS))
  const left = col > 0, right = col < PATCH_COLS - 1, top = row > 0, bottom = row < PATCH_ROWS - 1
  const ext: Rect = {
    x: r.x - (left ? FRINGE : 0), y: r.y - (top ? FRINGE : 0),
    w: r.w + (left ? FRINGE : 0) + (right ? FRINGE : 0), h: r.h + (top ? FRINGE : 0) + (bottom ? FRINGE : 0),
  }

  // Sàn cũ xỉn màu đều cả mảng: dọn xong thấy sáng hẳn lên
  flat.addChild(new Graphics().rect(r.x, r.y, r.w, r.h).fill({ color: 0x5a4630, alpha: 0.2 }))

  const clump = noise(`${j.id}:clump`, 28), fine = noise(`${j.id}:fine`, 9)
  const wallY = py(OFFICE.minZ), wl = px(OFFICE.minX), wr = px(OFFICE.maxX), wb = py(OFFICE.maxZ)
  const T = 2 * 16 // 2 ô
  // Bụi thành từng cụm (không phủ đều như lưới): giữa phòng ~10–15% diện tích, sát tường ~50%
  const density = (x: number, y: number) => {
    const near = Math.max(0, 1 - (y - wallY) / T, 1 - (x - wl) / T, 1 - (wr - x) / T, 1 - (wb - y) / (T * 0.7))
    const v = 0.72 * clump(x, y) + 0.28 * fine(x, y) + near * 0.32
    // Ngưỡng cụm: dưới thì sạch hẳn, trên thì dày dần (Bayer chỉ làm mép cụm lởm chởm)
    return clamp01((v - 0.6) * 3.2)
  }
  // Ô thuộc dải viền: chỉ giữ nửa bàn cờ của mảng này (bên trái / trên = chẵn, bên phải / dưới = lẻ)
  const parity = (x: number, y: number) => ((x >> 1) + (y >> 1)) & 1
  const mask = (x: number, y: number) => {
    let best = Infinity, want = -1
    const check = (on: boolean, dist: number, p: number) => { if (on && Math.abs(dist) < FRINGE && Math.abs(dist) < best) { best = Math.abs(dist); want = p } }
    check(left, x - r.x, 1)
    check(right, r.x + r.w - x, 0)
    check(top, y - r.y, 1)
    check(bottom, r.y + r.h - y, 0)
    return want < 0 || parity(x, y) === want
  }
  flat.addChild(dither(ext, density, mask))

  // Hạt bụi sẫm 1 px rải thưa
  const g = new Graphics()
  for (let k = 0; k < 18; k++) g.rect(Math.floor(r.x + rnd() * r.w), Math.floor(r.y + rnd() * r.h), 1, 1).fill(0x3a2c1e)
  flat.addChild(g)

  // Vết ố (gói Halloween): lật, xoay 90° ngẫu nhiên cho đỡ lặp
  const stainAt = (x: number, y: number) => {
    const s = lying(flat, STAINS[Math.floor(rnd() * STAINS.length)], x, y, rnd, 0x9a8c74, 0.6)
    if (rnd() < 0.5) s.rotation = Math.PI / 2
    if (rnd() < 0.5) s.scale.y = -1
  }
  /** Vài vết ố quanh một đống rác (mét) */
  const stainsAround = (x: number, z: number, n: number) => {
    for (let k = 0; k < n; k++) stainAt(px(x + (rnd() - 0.5) * 2.2), py(z + 0.3 + rnd() * 1.2))
  }
  stainAt(r.x + 20 + rnd() * (r.w - 40), r.y + 20 + rnd() * (r.h - 40))

  // Rác gom sát tường (trong khoảng 1,5 m), lối đi giữa phòng để trống
  const standing: Container[] = []
  const nearN = R.minZ === OFFICE.minZ, nearW = R.minX === OFFICE.minX, nearE = R.maxX === OFFICE.maxX
  const blocked = (x: number) => WINDOWS.some((w) => Math.abs(w - x) < 1.2) || Math.abs(x - BOARD.x) < BOARD.w / 2 + 0.5
  const along = (n: number) => {
    for (let k = 0; k < n; k++) {
      const spots: [number, number][] = []
      if (nearN) spots.push([R.minX + 0.8 + rnd() * (R.maxX - R.minX - 1.6), OFFICE.minZ + 0.7 + rnd() * 0.8])
      if (nearW) spots.push([OFFICE.minX + 0.6 + rnd() * 0.8, R.minZ + 1 + rnd() * (R.maxZ - R.minZ - 2)])
      if (nearE) spots.push([OFFICE.maxX - 0.6 - rnd() * 0.8, R.minZ + 1 + rnd() * (R.maxZ - R.minZ - 2)])
      if (!spots.length) return
      const [x, z] = spots[Math.floor(rnd() * spots.length)]
      lying(flat, LITTER[Math.floor(rnd() * LITTER.length)], px(x), py(z), rnd, OLD)
    }
  }
  along(1 + Math.floor(rnd() * 2))

  // Góc trong (tây bắc, đông bắc): đống thùng carton, giấy, chuột
  const corner = nearN && (nearW || nearE)
  if (corner) {
    const sx = nearW ? 1 : -1
    const cx = nearW ? OFFICE.minX : OFFICE.maxX
    standing.push(cardboard('boxStack', cx + sx * 0.45, OFFICE.minZ + 0.55))
    standing.push(cardboard('boxPile', cx + sx * 0.95, OFFICE.minZ + 0.6))
    standing.push(cardboard('boxSmall', cx + sx * 0.45, OFFICE.minZ + 1.15))
    lying(flat, 'booksMess', px(cx + sx * 1.7), py(OFFICE.minZ + 1.0), rnd, OLD)
    lying(flat, 'paperSheet', px(cx + sx * 2.2), py(OFFICE.minZ + 1.4), rnd, OLD)
    // Chuột rúc cạnh đống thùng
    lying(flat, RATS[Math.floor(rnd() * RATS.length)], px(cx + sx * 0.95), py(OFFICE.minZ + 1.05), rnd)
    stainsAround(cx + sx * 1.3, OFFICE.minZ + 0.6, 6)
  } else if (nearW || nearE) {
    // Dọc tường bên: một thùng lẻ, đôi khi một con chuột
    const cx = nearW ? OFFICE.minX + 0.4 : OFFICE.maxX - 0.4
    const z = R.minZ + 1.2 + rnd() * (R.maxZ - R.minZ - 2.4)
    if (rnd() < 0.7) standing.push(cardboard(rnd() < 0.5 ? 'boxSmall' : 'boxPile', cx, z))
    if (rnd() < 0.4) lying(flat, RATS[Math.floor(rnd() * RATS.length)], px(cx + (nearW ? 0.7 : -0.7)), py(z + 0.4), rnd)
  } else if (nearN) {
    // Tường bắc giữa: một thùng dựa tường (tránh cửa sổ, bảng)
    for (let k = 0; k < 6; k++) {
      const x = R.minX + 0.6 + rnd() * (R.maxX - R.minX - 1.2)
      if (!blocked(x)) { if (rnd() < 0.6) standing.push(cardboard('boxSmall', x, OFFICE.minZ + 0.5)); break }
    }
  }
  // Cạnh cửa vào (bên trái cửa, tránh sảnh chờ của ứng viên bên phải): giấy, sách vứt lại
  if (R.minX < 0 && R.maxX > 0 && R.maxZ === OFFICE.maxZ) {
    lying(flat, 'booksMess', px(-2.0), py(OFFICE.maxZ - 0.55), rnd, OLD)
    lying(flat, 'paperSheet', px(-1.5), py(OFFICE.maxZ - 0.9), rnd, OLD)
    lying(flat, 'booksSmall1', px(-2.7), py(OFFICE.maxZ - 0.75), rnd, OLD)
    stainsAround(-2.2, OFFICE.maxZ - 1.6, 4)
  }
  return { flat, standing }
}

// ───────────────────────── Tường, cửa sổ, bảng ─────────────────────────

function wallDirt(j: CleanJob): Container {
  const c = new Container()
  const rnd = seeded(j.id)
  const top = wallTop()
  const W = px(OFFICE.maxX) - px(OFFICE.minX)
  const r: Rect = { x: px(OFFICE.minX), y: top, w: W, h: WALL_FACE }
  // Cửa sổ và bảng dọn riêng: không phủ ố lên
  const wins = WINDOWS.map((x) => windowBox(x))
  const skip = [...wins, boardBox()]
  const inSkip = (x: number, y: number) => skip.some((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
  // Tường xỉn đều một lớp mỏng; chỉ vài vệt chảy rõ: từ trần, và dưới bậu cửa sổ
  c.addChild(new Graphics().rect(r.x, r.y, r.w, r.h).fill({ color: 0x5a4630, alpha: 0.1 }))
  const streaks: { x: number; w: number; y0: number; len: number }[] = []
  for (let k = 0; k < 12 && streaks.length < 4; k++) {
    const x = Math.floor(r.x + 30 + rnd() * (W - 60))
    if (skip.some((s) => x >= s.x - 6 && x <= s.x + s.w + 6)) continue
    streaks.push({ x, w: 2 + 2 * Math.floor(rnd() * 2), y0: top, len: 12 + rnd() * 12 })
  }
  for (const s of [wins[1], wins[2]]) streaks.push({ x: s.x + 4 + Math.floor(rnd() * (s.w - 10)), w: 2, y0: s.y + s.h, len: 8 + rnd() * 6 })
  const density = (x: number, y: number) => {
    if (inSkip(x, y)) return 0
    let v = 0
    for (const s of streaks) {
      if (x >= s.x && x < s.x + s.w && y >= s.y0 && y < s.y0 + s.len) v = Math.max(v, 0.95 * (1 - (y - s.y0) / s.len))
    }
    return v
  }
  c.addChild(dither(r, density))
  // Vệt mốc (gói Jail) bám ngay mép trần
  for (let k = 0; k < 12; k++) {
    const x = Math.floor(r.x + 8 + rnd() * (W - 24))
    if (skip.some((s) => x + 16 > s.x && x < s.x + s.w)) continue
    const s = new Sprite(sprite(DRIPS[Math.floor(rnd() * DRIPS.length)]))
    s.position.set(x, top)
    s.tint = 0xb8a888
    c.addChild(s)
  }
  // Mạng nhện: hai góc trần (ghép 3 mảnh cho to), trên cửa sổ ngoài cùng hai bên; nhện thả tơ ở góc trái
  for (const [dx, dy] of [[0, 0], [14, 0], [3, 7]]) {
    web(c, r.x + dx, top + dy, rnd)
    web(c, r.x + r.w - 16 - dx, top + dy, rnd, true)
  }
  web(c, wins[0].x + 4, top, rnd)
  web(c, wins[wins.length - 1].x + 4, top, rnd, true)
  const sp = new Sprite(sprite('spider'))
  sp.position.set(r.x + 30, top + 6)
  c.addChild(sp)
  return c
}

function windowDirt(j: CleanJob): Container {
  const c = new Container()
  const rnd = seeded(j.id)
  const b = windowBox(j.x!)
  const g = new Graphics()
  for (const [dx, dy, pw, ph] of PANES) g.rect(b.x + dx, b.y + dy, pw, ph).fill({ color: 0x6e5a3e, alpha: 0.38 })
  c.addChild(g)
  const n = noise(`${j.id}:glass`, 6)
  const inPane = (x: number, y: number) => PANES.some(([dx, dy, pw, ph]) => x >= b.x + dx && x < b.x + dx + pw && y >= b.y + dy && y < b.y + dy + ph)
  c.addChild(dither(b, (x, y) => (inPane(x, y) ? clamp01(0.25 + (y - b.y) / b.h * 0.5 + (n(x, y) - 0.5) * 0.5) : 0)))
  web(c, b.x - 3, b.y - 1, rnd)
  return c
}

function boardDirt(j: CleanJob): Container {
  const c = new Container()
  const rnd = seeded(j.id)
  const b = boardBox()
  const inner: Rect = { x: b.x + 2, y: b.y + 2, w: b.w - 4, h: b.h - 5 }
  const film = new Graphics().rect(inner.x, inner.y, inner.w, inner.h).fill({ color: 0x7a7366, alpha: 0.5 })
  // Bụi đọng trên mép trên khung bảng
  film.rect(b.x + 1, b.y, b.w - 2, 1).fill(0xa89f8c)
  c.addChild(film)
  const n = noise(`${j.id}:board`, 10)
  c.addChild(dither(inner, (x, y) => clamp01(0.2 + (n(x, y) - 0.5) * 0.8)))
  web(c, b.x + b.w - 15, b.y - 2, rnd, true)
  return c
}

/** Dựng bụi bẩn cho mọi chỗ chưa dọn */
export function buildDirt(isClean: (id: string) => boolean): DirtView {
  const floor = new Container()
  const sorted: Container[] = []
  const parts = new Map<string, Container[]>()
  // Thứ tự lớp: sàn trước, rồi tường, cửa sổ, bảng (đè lên ố tường)
  for (const j of JOBS) {
    if (isClean(j.id) || j.kind !== 'floor') continue
    const { flat, standing } = floorDirt(j)
    floor.addChild(flat)
    sorted.push(...standing)
    parts.set(j.id, [flat, ...standing])
  }
  for (const j of JOBS) {
    if (isClean(j.id) || j.kind === 'floor') continue
    const c = j.kind === 'wall' ? wallDirt(j) : j.kind === 'window' ? windowDirt(j) : boardDirt(j)
    floor.addChild(c)
    parts.set(j.id, [c])
  }
  return { floor, sorted, parts }
}

// ───────────────────────── Dọn xong ─────────────────────────

/** Ngôi sao lấp lánh 5×5 */
function twinkle(): Graphics {
  const g = new Graphics()
  g.rect(2, 0, 1, 5).fill(0xfffbe6)
  g.rect(0, 2, 5, 1).fill(0xfffbe6)
  g.rect(2, 2, 1, 1).fill(0xffe27a)
  g.pivot.set(2, 2)
  return g
}

/**
 * Gỡ bụi một chỗ vừa dọn: loé sáng một khung, bụi mờ hết trong 0,35 giây, lấp lánh rải trên vùng đó
 * (lớp `fx`, trên cả ngày/đêm).
 */
export function wipe(view: DirtView, id: string, area: Rect, fx: Container | null) {
  const list = view.parts.get(id)
  if (!list) return
  view.parts.delete(id)
  const stars: { g: Graphics; at: number; vy: number }[] = []
  const rnd = seeded(`${id}:wipe`)
  let flash: Graphics | null = null
  if (fx) {
    flash = new Graphics().rect(area.x, area.y, area.w, area.h).fill({ color: 0xffffff, alpha: 0.25 })
    fx.addChild(flash)
    const n = Math.max(6, Math.min(14, Math.round((area.w * area.h) / 1800)))
    for (let k = 0; k < n; k++) {
      const g = twinkle()
      g.position.set(Math.round(area.x + 6 + rnd() * (area.w - 12)), Math.round(area.y + 6 + rnd() * (area.h - 12)))
      g.alpha = 0
      fx.addChild(g)
      stars.push({ g, at: rnd() * 0.4, vy: 5 + rnd() * 6 })
    }
  }
  let t = 0
  const tick: Tick = (dt) => {
    t += dt
    if (flash && t > 0.06) { flash.removeFromParent(); flash.destroy(); flash = null }
    const k = Math.min(1, t / 0.35)
    for (const c of list) c.alpha = 1 - k
    for (const s of stars) {
      const u = (t - s.at) / 0.8
      s.g.alpha = u <= 0 || u >= 1 ? 0 : Math.sin(u * Math.PI)
      if (u > 0) s.g.y -= s.vy * dt
    }
    if (t > 1.3) {
      ticks.delete(tick)
      for (const c of list) { c.removeFromParent(); c.destroy({ children: true }) }
      for (const s of stars) { s.g.removeFromParent(); s.g.destroy() }
    }
  }
  ticks.add(tick)
}
