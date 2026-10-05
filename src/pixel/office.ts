import { AnimatedSprite, Container, Graphics, NineSliceSprite, Sprite, TilingSprite, type Texture } from 'pixi.js'
import { itemById } from '../data/catalog'
import type { OfficeState } from '../data/officeState'
import type { AgentStatus } from '../data/types'
import {
  BOARD, DESK_D, DESK_W, FURNITURE, OFFICE, WINDOWS, deskCenter, forward,
  type DeskSlot, type Furniture, type World,
} from '../world/layout'
import { cut, frames, sprite, stitch, type SpriteName } from './assets'
import { CAP, MAP_H, MAP_W, PPM, WALL_FACE, px, py } from './geom'
import { FAME_INNER, itemView } from './catalogArt'
import { buildWalls, type WallView } from './walls'

/*
 * Dựng văn phòng pixel từ bố cục ở world/layout.ts: một phòng lớn trống, cửa sổ và bảng ticket trên tường bắc,
 * bàn của agent. Bụi bẩn vẽ riêng ở dirt.ts (dọn chỗ nào thì gỡ chỗ đó, không dựng lại cả phòng).
 * - `floor`: sàn, tường bắc và mọi thứ treo trên đó (luôn nằm dưới nhân vật)
 * - `sorted`: đồ đạc đứng trên sàn, xếp lớp theo cạnh dưới (zIndex = y pixel của chân) cùng với nhân vật
 * - `top`: tường nam (luôn nằm trên cùng)
 */

export const OUTLINE = 0x2b2633
const GOLD = 0xf2c14e
/** Màu mặt bần của bảng LimeZu */
const CORK = 0xbe7149
export const CAP_FILL = 0xece8f1
export const CAP_SHADE = 0xc5bfd2
const OUTSIDE = 0x1c1a26

/** Gạch sàn: một ô 16×16 không có bóng tường (ô giữa hàng dưới của một khối 3×2 trong Room_Builder_Floors) */
const FLOOR: [number, number, number, number] = [16, 400, 16, 16]
/** Mặt tường bắc (vùng 48×32 trong Room_Builder_Walls) */
export const WALL: [number, number, number, number] = [16, 352, 16, 32]

/** Bàn cao bao nhiêu pixel (mặt trước bàn) */
const DESK_LIFT = 9

export interface Screen {
  slotId: string
  g: Graphics
  /** Vẽ lại màn hình theo trạng thái và thời gian */
  draw: (status: AgentStatus | null, t: number) => void
}

export interface OfficeView {
  floor: Container
  sorted: Container[]
  top: Container
  screens: Screen[]
  /** Vẽ lại bảng ticket trên tường (đếm ticket theo cột) */
  kanban: Graphics
  /** Vệt nắng qua cửa sổ (mờ đi khi trời tối) */
  sun: Graphics
  /** Kính cửa sổ (màu trời) và sao, đổi theo giờ */
  panes: Graphics
  stars: Graphics
  /** Nguồn sáng ban đêm (pixel gốc) */
  lights: Light[]
  /** Khung bảng ticket trên tường (pixel gốc), để bấm chuột */
  boards: { kanban: Rect }
  /** Vách tự xây, cửa (làm mờ / mở cửa mỗi khung hình) */
  walls: WallView
  /** uid đồ đã mua → khung bấm chuột (pixel gốc), để chọn khi trang trí */
  itemHits: Map<string, Rect>
  /** Bảng vinh danh (nếu đã mua): nội dung vẽ lại khi EXP đổi, khung để bấm / đứng gần bấm E */
  fame: { g: Graphics; rect: Rect; x: number } | null
}

export interface Rect { x: number; y: number; w: number; h: number }

/** Một nguồn sáng: đèn bàn / đèn cây (ấm), đèn trần (rộng, nhạt), màn hình (xanh, nhỏ) */
export interface Light {
  x: number
  y: number
  /** Bán kính (pixel gốc) */
  r: number
  kind: 'lamp' | 'ceiling' | 'screen'
  /** Kẹp quầng sáng trong phòng (pixel gốc), để không tràn qua vách kính / tường */
  clip?: { x: number; y: number; w: number; h: number }
}

export const sortAt = <T extends Container>(o: T, baseY: number): T => {
  o.zIndex = Math.round(baseY)
  return o
}

export function tiled(tex: Texture, x: number, y: number, w: number, h: number) {
  const t = new TilingSprite({ texture: tex, width: Math.round(w), height: Math.round(h) })
  t.position.set(Math.round(x), Math.round(y))
  return t
}

export function spr(name: SpriteName, cx: number, bottom: number, flip = false) {
  const s = new Sprite(sprite(name))
  s.anchor.set(0.5, 1)
  s.position.set(Math.round(cx), Math.round(bottom))
  if (flip) s.scale.x = -1
  return s
}

/** Hộp có viền tối kiểu LimeZu */
export function box(g: Graphics, x: number, y: number, w: number, h: number, fill: number, outline = OUTLINE) {
  g.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)).fill(outline)
  g.rect(Math.round(x) + 1, Math.round(y) + 1, Math.round(w) - 2, Math.round(h) - 2).fill(fill)
}

// ───────────────────────── Sàn, tường ─────────────────────────

/** Mép trên mặt tường bắc (pixel gốc) */
export const wallTop = () => py(OFFICE.minZ) - WALL_FACE

function buildFloor(c: Container) {
  const bg = new Graphics().rect(0, 0, MAP_W, MAP_H).fill(OUTSIDE)
  c.addChild(bg)
  const [x, y, w, h] = FLOOR
  c.addChild(tiled(cut('floors', x, y, w, h), px(OFFICE.minX), py(OFFICE.minZ), (OFFICE.maxX - OFFICE.minX) * PPM, (OFFICE.maxZ - OFFICE.minZ) * PPM))

  // Tường bắc: mặt tường + nắp + bóng đổ xuống sàn
  const top = wallTop()
  const [wx0, wy0, ww, wh] = WALL
  // Tường cao 3 ô: dải trên lặp phần giữa của viên tường LimeZu, 2 ô dưới là viên tường nguyên (có chân tường)
  const W = (OFFICE.maxX - OFFICE.minX) * PPM
  c.addChild(tiled(cut('walls', wx0, wy0 + 8, ww, WALL_FACE - wh), px(OFFICE.minX), top, W, WALL_FACE - wh))
  c.addChild(tiled(cut('walls', wx0, wy0, ww, wh), px(OFFICE.minX), top + WALL_FACE - wh, W, wh))
  const g = new Graphics()
  g.rect(px(OFFICE.minX), py(OFFICE.minZ), W, 4).fill({ color: 0x000000, alpha: 0.16 })
  g.rect(px(OFFICE.minX), py(OFFICE.minZ) + 4, W, 3).fill({ color: 0x000000, alpha: 0.07 })
  c.addChild(g)
}

/** Nắp tường nhìn từ trên: dải sáng có viền tối */
function capBand(g: Graphics, x: number, y: number, w: number, h: number) {
  box(g, x, y, w, h, CAP_FILL)
  if (w > h) g.rect(Math.round(x) + 1, Math.round(y + h) - 3, Math.round(w) - 2, 2).fill(CAP_SHADE)
  else g.rect(Math.round(x + w) - 3, Math.round(y) + 1, 2, Math.round(h) - 2).fill(CAP_SHADE)
}

function buildOuterWalls(floor: Container, top: Container) {
  const g = new Graphics()
  const yTop = wallTop() - CAP
  const x0 = px(OFFICE.minX) - CAP, x1 = px(OFFICE.maxX)
  capBand(g, x0, yTop, x1 - x0 + CAP, CAP)
  // Tường tây, đông: chỉ thấy nắp
  capBand(g, x0, yTop, CAP, py(OFFICE.maxZ) - yTop + CAP)
  capBand(g, x1, yTop, CAP, py(OFFICE.maxZ) - yTop + CAP)
  floor.addChild(g)
  // Tường nam (mặt quay ra ngoài): chỉ nắp, chừa cửa vào ở giữa
  const s = new Graphics()
  const door = [px(-1.1), px(1.1)]
  capBand(s, x0, py(OFFICE.maxZ), door[0] - x0, CAP)
  capBand(s, door[1], py(OFFICE.maxZ), x1 + CAP - door[1], CAP)
  // Ngưỡng cửa
  s.rect(door[0], py(OFFICE.maxZ), door[1] - door[0], CAP).fill(0x3a3546)
  s.rect(door[0] + 2, py(OFFICE.maxZ) + 2, door[1] - door[0] - 4, CAP - 4).fill(0x8a7f99)
  top.addChild(s)
}

// ───────────────────────── Đồ treo tường bắc ─────────────────────────

/** Đồ treo tường (cửa sổ, tranh, bảng) hạ xuống giữa mặt tường cao 3 ô */
export const WALL_SHIFT = 10
const onWall = (s: Sprite, x: number, fromTop: number) => {
  s.anchor.set(0.5, 0)
  s.position.set(Math.round(px(x)), wallTop() + WALL_SHIFT + fromTop)
  return s
}

/** Hai ô kính trong hình cửa sổ LimeZu (25×20): x 2–10 và 14–22, y 3–15 */
export const PANES = [[2, 3, 9, 13], [14, 3, 9, 13]] as const

/** Khung hình cửa sổ ở toạ độ x (mét) trên tường bắc (pixel gốc) */
export function windowBox(x: number): Rect {
  const t = sprite('window')
  return { x: Math.round(px(x) - t.width / 2), y: wallTop() + WALL_SHIFT + 6, w: t.width, h: t.height }
}

function buildWallDecor(floor: Container) {
  // Nắng xiên qua cửa sổ: vệt sáng nhạt trên sàn
  const sun = new Graphics()
  const y0 = py(OFFICE.minZ)
  for (const x of WINDOWS) {
    const cx = px(x)
    sun.poly([cx - 12, y0, cx + 12, y0, cx + 22, y0 + 44, cx - 2, y0 + 44]).fill({ color: 0xfff1c9, alpha: 0.2 })
  }
  floor.addChild(sun)
  // Kính phủ màu trời (trong suốt ban ngày) và vài ngôi sao ban đêm, vẽ đè lên ô kính
  const panes = new Graphics()
  const stars = new Graphics()
  for (const x of WINDOWS) {
    floor.addChild(onWall(new Sprite(sprite('window')), x, 6))
    const { x: left, y: top } = windowBox(x)
    for (const [dx, dy, pw, ph] of PANES) panes.rect(left + dx, top + dy, pw, ph).fill(0xffffff)
    for (const [dx, dy] of [[4, 5], [8, 11], [16, 7], [20, 13], [18, 4]]) stars.rect(left + dx, top + dy, 1, 1).fill(0xfff6d0)
  }
  floor.addChild(panes, stars)
  return { sun, panes, stars }
}

/** Khung bảng ticket trên tường bắc (pixel gốc, chưa tính bóng đổ) */
export function boardBox(): Rect {
  const w = Math.round(BOARD.w * PPM), h = 26
  return { x: Math.round(px(BOARD.x) - w / 2), y: wallTop() + WALL_SHIFT + 3, w, h }
}

/** Khung bảng treo tường bắc, trả về Graphics để vẽ nội dung */
function wallBoard(floor: Container, frame: 'corkboard' | 'chalkWall', inner?: number) {
  const { x, y, w, h } = boardBox()
  const g = new Graphics()
  g.rect(x + 1, y + h, w - 2, 2).fill({ color: 0x000000, alpha: 0.22 })
  floor.addChild(g)
  const bd = new Sprite(stitch(frame, w, h, 4, 4, 4, 5))
  bd.position.set(x, y)
  floor.addChild(bd)
  // Bảng ticket: phủ lại mặt bần trơn để các mẩu giấy là dữ liệu thật
  if (inner !== undefined) floor.addChild(new Graphics().rect(x + 3, y + 3, w - 6, h - 7).fill(inner))
  const content = new Graphics()
  content.position.set(x + 4, y + 4)
  floor.addChild(content)
  return { content, w: w - 8, h: h - 9, rect: { x, y, w, h: h + 2 } }
}

let kanbanBox = { w: 0, h: 0 }

const MEDAL = [0xf2c14e, 0xc9ced8, 0xd08a4e]

/** Bảng vinh danh: 3 agent nhiều EXP nhất, mỗi người một dòng (huy chương, thanh EXP theo màu áo) */
export function drawFame(g: Graphics, top: { color: number; exp: number }[]) {
  g.clear()
  const max = Math.max(1, ...top.map((t) => t.exp))
  const { w } = FAME_INNER
  top.slice(0, 3).forEach((t, k) => {
    const y = k * 5
    g.rect(0, y, 3, 3).fill(MEDAL[k])
    g.rect(5, y, 3, 3).fill(t.color)
    g.rect(10, y + 1, Math.max(2, Math.round(((w - 12) * t.exp) / max)), 1).fill({ color: 0xf4f1e8, alpha: 0.85 })
  })
}

/** Bảng ticket: 5 cột, mỗi ticket một mẩu giấy màu (tối đa 8 mẩu mỗi cột) */
export function drawKanban(g: Graphics, counts: { color: string; n: number }[]) {
  g.clear()
  const { w, h } = kanbanBox
  const cw = w / counts.length
  counts.forEach((c, i) => {
    const x = Math.round(i * cw)
    g.rect(x + 1, 0, Math.round(cw) - 2, 2).fill(c.color)
    const n = Math.min(c.n, 8)
    for (let k = 0; k < n; k++) {
      const col = k % 2, row = Math.floor(k / 2)
      g.rect(x + 2 + col * Math.floor((cw - 3) / 2), 4 + row * 3, Math.floor((cw - 6) / 2), 2).fill(c.color)
    }
    if (i) g.rect(x, 3, 1, h - 4).fill({ color: 0x000000, alpha: 0.12 })
  })
}

// ───────────────────────── Bàn làm việc ─────────────────────────

/** Màn hình nhìn ngang (bàn quay ngang: người ngồi quay sang phải) */
function monitorSide(g: Graphics, x: number, bottom: number) {
  const y = Math.round(bottom - 13)
  g.rect(x, y, 3, 10).fill(0x2b2f3a)
  g.rect(x + 3, bottom - 3, 3, 1).fill(0x2b2f3a)
  g.rect(x + 1, bottom - 3, 1, 3).fill(0x2b2f3a)
  return { x: x - 1, y: y + 1, w: 1, h: 8 }
}

/**
 * Mặt bàn: bàn văn phòng LimeZu (Modern Office), giữ mép và chân bàn, lặp phần giữa cho đủ kích thước.
 * `gold`: viền vàng (đồ trên bàn, mua ở cửa hàng ở đợt sau).
 */
function deskTop(x: number, y: number, w: number, d: number, gold: boolean) {
  const X = Math.round(x), Y = Math.round(y), W = Math.round(w), D = Math.round(d)
  const c = new Container()
  c.addChild(new Graphics().rect(X + 2, Y + D + DESK_LIFT - 2, W - 1, 3).fill({ color: 0x000000, alpha: 0.2 }))
  const t = new Sprite(stitch('moDesk', W, D + DESK_LIFT, 3, 4, 4, 7))
  t.position.set(X, Y)
  c.addChild(t)
  if (gold) {
    const g = new Graphics()
    g.rect(X, Y, W, 1).fill(GOLD)
    g.rect(X, Y + D + 1, W, 1).fill(GOLD)
    g.rect(X, Y, 1, D + 2).fill(GOLD)
    g.rect(X + W - 1, Y, 1, D + 2).fill(GOLD)
    c.addChild(g)
  }
  return c
}

const SCREEN_BG: Record<AgentStatus, number> = {
  running: 0x0f1d17, idle: 0x14203a, paused: 0x07090d, error: 0x3a0d0d, terminated: 0x050608,
}

/** Màn hình sống: đang chạy thì chữ chạy, rảnh thì màn chờ, lỗi thì nháy đỏ */
function liveScreen(slotId: string, r: { x: number; y: number; w: number; h: number }, phase: number): Screen {
  const g = new Graphics()
  const draw = (st: AgentStatus | null, t: number) => {
    g.clear()
    if (r.w < 3 || r.h < 3) {
      // Mặt sau / nhìn ngang: chỉ một vệt sáng hắt ra
      const col = !st || st === 'paused' || st === 'terminated' ? 0x1a1e26 : st === 'error' ? 0xef5a4c : st === 'running' ? 0x3ccf6e : 0x6c8ed8
      g.rect(r.x, r.y, r.w, r.h).fill(col)
      return
    }
    g.rect(r.x, r.y, r.w, r.h).fill(st ? SCREEN_BG[st] : 0x07090d)
    if (st === 'running') {
      const shift = Math.floor(t * 3 + phase) % 4
      for (let row = 0; row < r.h; row += 2) {
        const len = 2 + ((row * 7 + shift * 5 + Math.floor(phase)) % (r.w - 2))
        g.rect(r.x + 1, r.y + row + (shift % 2), Math.min(len, r.w - 2), 1).fill(row % 4 ? 0x3ccf6e : 0x9be7b4)
      }
    } else if (st === 'idle') {
      const k = Math.floor(t * 0.8 + phase) % (r.w - 2)
      g.rect(r.x + 1 + k, r.y + 1 + (k % (r.h - 2)), 2, 1).fill(0x6c8ed8)
    } else if (st === 'error') {
      if (Math.floor(t * 2 + phase) % 2) g.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2).fill(0xb3261e)
      g.rect(r.x + Math.floor(r.w / 2) - 1, r.y + 1, 2, r.h - 3).fill(0xffd6d1)
    }
  }
  return { slotId, g, draw }
}

/** Ghế nhìn từ trước (ghế hội nghị LimeZu): bậc 3+ nhuộm nâu da */
const CHAIR_TINT = [0xffffff, 0xffffff, 0xffffff, 0xb07a5a, 0xb07a5a]

/**
 * Bàn của một chỗ ngồi + ghế. `tier` = đồ trên bàn (0 = bàn cơ bản miễn phí; cây, màn thứ hai, đèn và ghế da,
 * cúp và viền vàng sẽ mua ở cửa hàng ở đợt sau).
 * Bàn quay về nam (người ngồi phía bắc, nhìn về camera), về bắc (người ngồi quay lưng), hoặc về đông.
 */
function buildDesk(s: DeskSlot, tier: number, sorted: Container[], screens: Screen[], lights: Light[], phase: number) {
  const c = deskCenter(s)
  const f = forward(s.yaw)
  const side = Math.abs(f.x) > 0.5
  const g = new Graphics()
  const deco: Sprite[] = []
  let scr: { x: number; y: number; w: number; h: number }
  let base: number
  let top: Container

  if (!side) {
    const x = px(c.x - DESK_W / 2), y = py(c.z - DESK_D / 2) - DESK_LIFT
    const w = DESK_W * PPM, d = DESK_D * PPM
    base = py(c.z + DESK_D / 2)
    top = deskTop(x, y, w, d, tier >= 4)
    const facingCam = f.z > 0 // người ngồi phía bắc bàn, nhìn về camera
    const cx = px(c.x)
    if (facingCam) {
      // Màn hình gần mép nam (phía xa người ngồi): thấy mặt sau (Modern Office). Đèn trạng thái ở chân màn.
      const m = spr('moMonBack', cx, y + d - 1)
      deco.push(m)
      scr = { x: cx - 2, y: Math.round(y + d - 3), w: 4, h: 1 }
      g.rect(cx - 6, y + 3, 12, 3).fill(0xd8dbe2)
      if (tier >= 2) deco.push(spr('moMonBack', cx + 15, y + d - 2))
    } else {
      // Người ngồi quay lưng về camera: thấy mặt màn hình (Modern Office), màn sống vẽ đè lên vùng màn
      const bottom = y + 16
      deco.push(spr('moMonFront', cx, bottom))
      scr = { x: cx - 6, y: Math.round(bottom - 13), w: 12, h: 7 }
      g.rect(cx - 6, y + d - 6, 12, 3).fill(0xd8dbe2)
      g.rect(cx + 9, y + d - 6, 3, 3).fill(0xd8dbe2)
      if (tier >= 2) {
        deco.push(spr('moMonFront', cx + 16, bottom))
        screens.push(liveScreen(s.id, { x: cx + 10, y: Math.round(bottom - 13), w: 12, h: 7 }, phase + 2.3))
      }
    }
    // Cốc
    g.rect(px(c.x) - 18, y + 5, 3, 3).fill(0xe0784f)
    if (tier >= 1) deco.push(spr('plantDesk', px(c.x + 0.52), y + d - 1))
    if (tier >= 3) {
      deco.push(spr('moLamp', px(c.x - 0.5), y + d - 1))
      lights.push({ x: px(c.x - 0.5), y: y + d - 12, r: 30, kind: 'lamp' })
    }
    if (tier >= 4) deco.push(spr('trophy', px(c.x - 0.26), y + d - 3))
  } else {
    // Bàn dọc phía đông người ngồi
    const x = px(c.x - DESK_D / 2), y = py(c.z - DESK_W / 2) - DESK_LIFT
    const w = DESK_D * PPM, d = DESK_W * PPM
    base = py(c.z + DESK_W / 2)
    top = deskTop(x, y, w, d, tier >= 4)
    scr = monitorSide(g, Math.round(x + w / 2), Math.round(py(c.z) - DESK_LIFT + 4))
    g.rect(Math.round(x + 3), Math.round(py(c.z) - DESK_LIFT - 4), 3, 10).fill(0xd8dbe2)
    if (tier >= 2) monitorSide(g, Math.round(x + w / 2), Math.round(py(c.z - 0.42) - DESK_LIFT + 4))
    if (tier >= 1) deco.push(spr('plantDesk', px(c.x), py(c.z + 0.55) - DESK_LIFT))
    if (tier >= 3) {
      deco.push(spr('deskLamp', px(c.x), py(c.z - 0.5) - DESK_LIFT + 1))
      lights.push({ x: px(c.x), y: py(c.z - 0.5) - DESK_LIFT - 10, r: 30, kind: 'lamp' })
    }
    if (tier >= 4) deco.push(spr('trophy', px(c.x + 0.05), py(c.z + 0.25) - DESK_LIFT))
  }

  const desk = new Container()
  desk.addChild(top, g)
  for (const d of deco) desk.addChild(d)
  // Bàn dọc phía tây người ngồi (bạn đã xoay bàn): lật gương cả bàn quanh tâm bàn
  const west = side && f.x < 0
  if (west) {
    desk.scale.x = -1
    desk.x = 2 * Math.round(px(c.x))
  }
  const sx = west ? 2 * Math.round(px(c.x)) - (scr.x + scr.w / 2) : scr.x + scr.w / 2
  lights.push({ x: sx, y: scr.y + scr.h / 2, r: 14, kind: 'screen' })
  const live = liveScreen(s.id, scr, phase)
  desk.addChild(live.g)
  screens.push(live)
  // Màn thứ hai (bậc 2+) đã thêm vào screens: đưa lên trên hình màn hình
  for (const sc of screens) if (sc.slotId === s.id && sc !== live && !sc.g.parent) desk.addChild(sc.g)
  sorted.push(sortAt(desk, base))

  // Ghế
  const seatX = px(s.seat.x), seatY = py(s.seat.z)
  const tint = CHAIR_TINT[tier] ?? 0xffffff
  if (side) {
    const ch = spr('chairFront', seatX + (f.x < 0 ? 2 : -2), seatY + 2)
    ch.tint = tint
    sorted.push(sortAt(ch, seatY - 2))
  } else if (f.z > 0) {
    // Ghế xoay Modern Office nhìn từ trước (sau lưng người ngồi); bậc 3+ ghế cam
    const ch = spr(tier >= 3 ? 'moChairFrontL' : 'moChairFront', seatX, seatY + 3)
    sorted.push(sortAt(ch, seatY - 1))
  } else {
    // Ghế nhìn từ sau: lưng ghế che hông người ngồi
    const back = spr(tier >= 3 ? 'moChairBackL' : 'moChairBack', seatX, seatY + 4)
    sorted.push(sortAt(back, seatY + 1))
  }
}

// ───────────────────────── Đồ cố định của phòng (FURNITURE trong layout.ts; đồ mua ở cửa hàng vẽ ở catalogArt.ts) ─────────────────────────

export function rug(f: Furniture) {
  const blue = f.color === '#7a8fb8' || f.color === '#4f9d94'
  const tex = sprite(blue ? 'rugBlue' : 'rugRed')
  const r = new NineSliceSprite({ texture: tex, leftWidth: 14, rightWidth: 14, topHeight: 12, bottomHeight: 12 })
  r.width = Math.round((f.w ?? 2) * PPM)
  r.height = Math.round((f.d ?? 2) * PPM)
  r.position.set(Math.round(px(f.x) - r.width / 2), Math.round(py(f.z) - r.height / 2))
  return r
}

/** Bàn họp: bàn hội nghị LimeZu (13_Conference_Hall), lặp phần giữa cho đủ 3,2 m; laptop trên bàn */
function meetingTable(f: Furniture) {
  const w = Math.round((f.w ?? 3.2) * PPM), d = Math.round((f.d ?? 1.4) * PPM)
  const c = new Container()
  const t = new Sprite(stitch('meetingTable', w, d + DESK_LIFT, 10, 12, 6, 12))
  t.position.set(Math.round(px(f.x) - w / 2), Math.round(py(f.z) - d / 2 - DESK_LIFT))
  c.addChild(t)
  if (!f.w) c.addChild(spr('laptopBack', px(f.x) + 22, py(f.z) - DESK_LIFT + 4))
  return sortAt(c, py(f.z + (f.d ?? 1.4) / 2))
}

/**
 * Dãy bếp LimeZu (12_Kitchen) nhìn chính diện, từ tây sang đông: tủ bếp có máy pha cà phê (vẽ riêng),
 * bồn rửa, bếp nấu, tủ bếp có lò vi sóng, tủ lạnh đứng. Chân các món thẳng hàng ở mép nam.
 */
function kitchen(f: Furniture) {
  const c = new Container()
  const base = py(f.z + (f.d ?? 0.7) / 2)
  let x = Math.round(px(f.x - (f.w ?? 3.4) / 2))
  for (const name of ['kitCounter2', 'kitSink', 'kitStove', 'kitCounter', 'kitCounter2', 'kitFridge', 'kitFridge'] as const) {
    const t = sprite(name)
    const s = new Sprite(t)
    s.position.set(x, base - t.height)
    c.addChild(s)
    if (name === 'kitCounter') c.addChild(spr('microwave', x + 15, base - t.height + 3))
    x += t.width
  }
  return sortAt(c, base)
}

/** Nhiều mảnh ghép sát nhau theo chiều ngang, căn giữa tại cx, chân ở bottom */
function row(names: SpriteName[], cx: number, bottom: number) {
  const c = new Container()
  const total = names.reduce((w, n) => w + sprite(n).width, 0)
  let x = Math.round(cx - total / 2)
  for (const n of names) {
    const t = sprite(n)
    const s = new Sprite(t)
    s.position.set(x, Math.round(bottom - t.height))
    c.addChild(s)
    x += t.width
  }
  return c
}

/** Bóng đổ nhạt sát chân đồ đạc (hình LimeZu không kèm bóng) */
export function withShadow(o: Container) {
  const b = o.getBounds()
  const g = new Graphics()
  g.ellipse(Math.round(b.x + b.width / 2), Math.round(b.y + b.height - 1), Math.max(4, Math.round(b.width * 0.46)), 3).fill({ color: 0x000000, alpha: 0.2 })
  const c = new Container()
  c.addChild(g, o)
  c.zIndex = o.zIndex
  return c
}

export function furniture(f: Furniture): Container | null {
  const bottom = (dz: number) => py(f.z + dz)
  switch (f.kind) {
    case 'plant': {
      const kind = f.color === 'palm' ? 'plantPalm' : f.color === 'tree' ? 'plantTree' : 'plantBig'
      return sortAt(spr(kind, px(f.x), bottom(0.25)), bottom(0.25))
    }
    case 'arcade': return sortAt(spr(f.color === '2' ? 'arcade2' : 'arcade1', px(f.x), bottom(0.25)), bottom(0.25))
    case 'plantSmall': return sortAt(spr('plantSmall', px(f.x), bottom(0.2)), bottom(0.2))
    case 'bookshelf': return sortAt(spr('bookshelf', px(f.x), bottom(0.25)), bottom(0.25))
    case 'sofa': return sortAt(spr('sofaV', px(f.x), bottom(0.95), true), bottom(0.95))
    case 'coffeeTable': return sortAt(spr('coffeeTable', px(f.x), bottom(0.3)), bottom(0.3))
    case 'foosball': return sortAt(spr('pingpongBig', px(f.x), bottom(0.8)), bottom(0.8))
    case 'kitchen': return kitchen(f)
    case 'tvStand': return sortAt(row(['tvStand', 'tvStand2'], px(f.x), bottom(0.3)), bottom(0.3))
    case 'sofaBack': return sortAt(row(['sofaBackL', 'sofaBackM', 'sofaBackR'], px(f.x), bottom(0.4)), bottom(0.4))
    case 'floorLamp': return sortAt(spr('floorLamp', px(f.x), bottom(0.15)), bottom(0.15))
    case 'chalkboard': return sortAt(spr('chalkboard', px(f.x), bottom(0.15)), bottom(0.15))
    case 'bench': return sortAt(spr('bench', px(f.x), bottom(0.25)), bottom(0.25))
    case 'bookshelfWide': return sortAt(spr('bookshelfWide', px(f.x), bottom(0.2)), bottom(0.2))
    // Đĩa trái cây đặt trên bàn cao: vẽ sau bàn
    case 'fruitBowl': return sortAt(spr('fruitBowl', px(f.x), bottom(0) - 6), bottom(0.6) + 1)
    case 'coffeeMachine': {
      const a = new AnimatedSprite(frames('coffee', 16, 32))
      a.anchor.set(0.5, 1)
      a.position.set(Math.round(px(f.x)), Math.round(bottom(0.35) - 4))
      a.animationSpeed = 0.08
      a.play()
      // Đặt trên mặt tủ bếp: vẽ sau dãy bếp
      return sortAt(a, bottom(0.35) + 1)
    }
    case 'fridge': {
      const s = spr('fridge', px(f.x) - 4, bottom(0.35))
      return sortAt(s, bottom(0.35))
    }
    case 'highTable': return sortAt(spr('highTable', px(f.x), bottom(0.3)), bottom(0.3))
    case 'stool': return sortAt(spr('stool', px(f.x), bottom(0.15)), bottom(0.15))
    case 'meetingTable': return meetingTable(f)
    case 'meetingChair': {
      const turned = Math.abs(Math.sin(f.yaw ?? 0)) > 0.5
      if (!turned && Math.cos(f.yaw ?? 0) < 0) {
        const c = new Container()
        c.addChild(spr('chairFront', px(f.x), bottom(0.05)), spr('chairBack', px(f.x), bottom(0.2)))
        return sortAt(c, bottom(0.2))
      }
      return sortAt(spr('chairFront', px(f.x), bottom(0.15)), bottom(-0.1))
    }
    case 'waterCooler': return sortAt(spr(f.color === 'jug' ? 'moCooler' : 'vending', px(f.x), bottom(0.25)), bottom(0.25))
    // Máy in đặt trên tủ hồ sơ (cùng toạ độ với tủ): vẽ sau tủ
    case 'printer': return sortAt(spr('moPrinter', px(f.x), bottom(0.3) - 18), bottom(0.3) + 1)
    case 'cabinet': return sortAt(spr('cabinet', px(f.x), bottom(0.3)), bottom(0.3))
    case 'whiteboard': return sortAt(spr('whiteboard', px(f.x), bottom(0.15)), bottom(0.15))
    case 'beanbag': return sortAt(spr('armchair', px(f.x), bottom(0.35)), bottom(0.35))
    // TV treo tường, thảm, cửa: vẽ riêng
    default: return null
  }
}

export function buildOffice(world: World, office: OfficeState): OfficeView {
  const floor = new Container()
  const top = new Container()
  const sorted: Container[] = []
  const screens: Screen[] = []

  buildFloor(floor)
  const { sun, panes, stars } = buildWallDecor(floor)
  const kb = wallBoard(floor, 'corkboard', CORK)
  kanbanBox = { w: kb.w, h: kb.h }
  buildOuterWalls(floor, top)

  for (const f of FURNITURE) {
    const o = furniture(f)
    if (o) sorted.push(f.kind === 'fruitBowl' || f.kind === 'coffeeMachine' || f.kind === 'printer' ? o : withShadow(o))
  }
  const lights: Light[] = []
  // Bàn cơ bản miễn phí cho mỗi agent (đồ trên bàn mua ở cửa hàng, đợt sau)
  world.slots.forEach((s, i) => buildDesk(s, 0, sorted, screens, lights, i * 1.7))
  // Đèn trần trên mỗi cụm bàn (ánh sáng tràn nhẹ ra ngoài), đèn cửa vào.
  // Chỗ khác sáng nhờ đèn có thật: màn hình, và (sau này) đèn cây, đèn bàn mua ở cửa hàng.
  for (const p of world.pods) lights.push({ x: px(p.x), y: py(p.z), r: 3.3 * PPM, kind: 'ceiling' })
  for (const f of FURNITURE) {
    if (f.kind === 'door') lights.push({ x: px(f.x), y: py(f.z) - 12, r: 1.5 * PPM, kind: 'lamp' })
  }

  // Đồ mua ở cửa hàng: thảm nằm dưới cùng (ngay trên sàn), đồ treo trên tường bắc, đồ đứng xếp lớp cùng người
  const rugs = new Container()
  const hung = new Container()
  floor.addChild(rugs, hung)
  const itemHits = new Map<string, Rect>()
  let fame: OfficeView['fame'] = null
  for (const p of office.items) {
    const i = itemById.get(p.item)
    if (!i || p.stored || i.mount === 'door') continue
    const fg = i.id === 'fame' ? new Graphics() : undefined
    const v = itemView(i, p.c, p.r, p.rot, fg)
    if (v.layer === 'floor') (i.mount === 'rug' ? rugs : hung).addChild(v.node)
    else sorted.push(v.node)
    if (v.light) lights.push(v.light)
    itemHits.set(p.uid, v.hit)
    if (fg) fame = { g: fg, rect: v.hit, x: v.hit.x + v.hit.w / 2 }
  }
  const walls = buildWalls(office)
  sorted.push(...walls.sorted)

  return { floor, sorted, top, screens, kanban: kb.content, sun, panes, stars, lights, boards: { kanban: kb.rect }, walls, itemHits, fame }
}
