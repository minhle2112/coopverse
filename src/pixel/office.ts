import { AnimatedSprite, Container, Graphics, NineSliceSprite, Sprite, TilingSprite, type Texture } from 'pixi.js'
import type { AgentStatus } from '../data/types'
import {
  BOARD, DESK_D, DESK_W, FAME, FURNITURE, LEAD_ROOM, MEET_ROOM, OFFICE, deskCenter, forward,
  type DeskSlot, type Furniture, type World,
} from '../world/layout'
import { cut, frames, sprite, stitch, type SpriteName } from './assets'
import { CAP, MAP_H, MAP_W, PPM, WALL_FACE, px, py } from './geom'

/*
 * Dựng văn phòng pixel từ cùng bố cục với bản 3D (world/layout.ts).
 * - `floor`: sàn, thảm, tường bắc và mọi thứ treo trên đó (luôn nằm dưới nhân vật)
 * - `sorted`: đồ đạc đứng trên sàn, xếp lớp theo cạnh dưới (zIndex = y pixel của chân) cùng với nhân vật
 * - `top`: tường nam (luôn nằm trên cùng)
 */

const OUTLINE = 0x2b2633
const GOLD = 0xf2c14e
/** Màu mặt bần của bảng LimeZu */
const CORK = 0xbe7149
const CAP_FILL = 0xece8f1
const CAP_SHADE = 0xc5bfd2
const OUTSIDE = 0x1c1a26

/** Gạch sàn của từng khu: một ô 16×16 không có bóng tường (ô giữa hàng dưới của mỗi khối 3×2 trong Room_Builder_Floors) */
const FLOOR: Record<string, [number, number, number, number]> = {
  open: [16, 400, 16, 16],
  lead: [16, 464, 16, 16],
  meet: [144, 272, 16, 16],
  pantry: [208, 496, 16, 16],
  lounge: [16, 336, 16, 16],
}
/** Mặt tường bắc (vùng 48×32 trong Room_Builder_Walls) */
const WALL: [number, number, number, number] = [16, 352, 16, 32]

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
  fame: Graphics
  /** Vệt nắng qua cửa sổ (mờ đi khi trời tối) */
  sun: Graphics
  /** Kính cửa sổ (màu trời) và sao, đổi theo giờ */
  panes: Graphics
  stars: Graphics
  /** Nguồn sáng ban đêm (pixel gốc) */
  lights: Light[]
}

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

const sortAt = <T extends Container>(o: T, baseY: number): T => {
  o.zIndex = Math.round(baseY)
  return o
}

function tiled(tex: Texture, x: number, y: number, w: number, h: number) {
  const t = new TilingSprite({ texture: tex, width: Math.round(w), height: Math.round(h) })
  t.position.set(Math.round(x), Math.round(y))
  return t
}

function spr(name: SpriteName, cx: number, bottom: number, flip = false) {
  const s = new Sprite(sprite(name))
  s.anchor.set(0.5, 1)
  s.position.set(Math.round(cx), Math.round(bottom))
  if (flip) s.scale.x = -1
  return s
}

/** Hộp có viền tối kiểu LimeZu */
function box(g: Graphics, x: number, y: number, w: number, h: number, fill: number, outline = OUTLINE) {
  g.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)).fill(outline)
  g.rect(Math.round(x) + 1, Math.round(y) + 1, Math.round(w) - 2, Math.round(h) - 2).fill(fill)
}

// ───────────────────────── Sàn, tường ─────────────────────────

function buildFloor(c: Container) {
  const bg = new Graphics().rect(0, 0, MAP_W, MAP_H).fill(OUTSIDE)
  c.addChild(bg)
  const zone = (k: keyof typeof FLOOR, x1: number, z1: number, x2: number, z2: number) => {
    const [x, y, w, h] = FLOOR[k]
    c.addChild(tiled(cut('floors', x, y, w, h), px(x1), py(z1), (x2 - x1) * PPM, (z2 - z1) * PPM))
  }
  zone('open', OFFICE.minX, OFFICE.minZ, OFFICE.maxX, OFFICE.maxZ)
  zone('lead', LEAD_ROOM.minX, LEAD_ROOM.minZ, LEAD_ROOM.maxX, LEAD_ROOM.maxZ)
  zone('meet', MEET_ROOM.minX, MEET_ROOM.minZ, MEET_ROOM.maxX, MEET_ROOM.maxZ)
  zone('lounge', OFFICE.minX, LEAD_ROOM.maxZ, LEAD_ROOM.maxX, OFFICE.maxZ)
  zone('pantry', MEET_ROOM.minX, MEET_ROOM.maxZ, OFFICE.maxX, OFFICE.maxZ)
  // Nẹp giữa các khu không có vách
  const seam = new Graphics()
  seam.rect(px(LEAD_ROOM.maxX) - 1, py(LEAD_ROOM.maxZ), 2, py(OFFICE.maxZ) - py(LEAD_ROOM.maxZ)).fill({ color: 0x000000, alpha: 0.18 })
  seam.rect(px(MEET_ROOM.minX) - 1, py(MEET_ROOM.maxZ), 2, py(OFFICE.maxZ) - py(MEET_ROOM.maxZ)).fill({ color: 0x000000, alpha: 0.18 })
  c.addChild(seam)

  // Tường bắc: mặt tường + nắp + bóng đổ xuống sàn
  const top = py(OFFICE.minZ) - WALL_FACE
  const [wx0, wy0, ww, wh] = WALL
  // Tường cao 3 ô: dải trên lặp phần giữa của viên tường LimeZu, 2 ô dưới là viên tường nguyên (có chân tường)
  const W = (OFFICE.maxX - OFFICE.minX) * PPM
  c.addChild(tiled(cut('walls', wx0, wy0 + 8, ww, WALL_FACE - wh), px(OFFICE.minX), top, W, WALL_FACE - wh))
  c.addChild(tiled(cut('walls', wx0, wy0, ww, wh), px(OFFICE.minX), top + WALL_FACE - wh, W, wh))
  const g = new Graphics()
  g.rect(px(OFFICE.minX), py(OFFICE.minZ), (OFFICE.maxX - OFFICE.minX) * PPM, 4).fill({ color: 0x000000, alpha: 0.16 })
  g.rect(px(OFFICE.minX), py(OFFICE.minZ) + 4, (OFFICE.maxX - OFFICE.minX) * PPM, 3).fill({ color: 0x000000, alpha: 0.07 })
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
  const yTop = py(OFFICE.minZ) - WALL_FACE - CAP
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

/** Vách kính: phòng Lead và phòng họp */
function buildGlass(floor: Container, sorted: Container[]) {
  const H = 26
  // Vách dọc: chỉ thấy nắp (khung nhôm + kính)
  const v = new Graphics()
  for (const x of [LEAD_ROOM.maxX, MEET_ROOM.minX]) {
    const sx = px(x) - 3
    const y0 = py(OFFICE.minZ) - 2, y1 = py(LEAD_ROOM.maxZ)
    v.rect(sx, y0, 6, y1 - y0).fill(0x7d8597)
    v.rect(sx + 1, y0, 4, y1 - y0).fill(0xbfe3ee)
    v.rect(sx + 2, y0, 1, y1 - y0).fill(0xeaf7fb)
  }
  floor.addChild(v)

  // Vách ngang (mặt kính quay về phía nam): người trong phòng bị kính phủ lên, người ngoài đứng trước kính
  const pane = (x1: number, x2: number) => {
    if (x2 - x1 < 0.05) return
    const g = new Graphics()
    const sx = px(x1), w = (x2 - x1) * PPM, base = py(LEAD_ROOM.maxZ)
    g.rect(sx, base - H, w, H).fill({ color: 0xbfe6f2, alpha: 0.32 })
    // Vệt sáng chéo
    for (let k = 10; k < w - 6; k += 37) g.poly([sx + k, base - 2, sx + k + 6, base - 2, sx + k + 14, base - H + 2, sx + k + 8, base - H + 2]).fill({ color: 0xffffff, alpha: 0.22 })
    // Khung: nắp trên, chân, đố dọc mỗi mét
    g.rect(sx, base - H - 4, w, 4).fill(0x7d8597)
    g.rect(sx, base - H - 3, w, 1).fill(0xd8dee8)
    g.rect(sx, base - 2, w, 2).fill(0x5d6575)
    for (let m = Math.ceil(x1); m <= Math.floor(x2); m++) g.rect(px(m) - 1, base - H, 2, H).fill(0x7d8597)
    sorted.push(sortAt(g, base + 1))
  }
  pane(LEAD_ROOM.minX, LEAD_ROOM.door[0])
  pane(LEAD_ROOM.door[1], LEAD_ROOM.maxX)
  pane(MEET_ROOM.minX, MEET_ROOM.door[0])
  pane(MEET_ROOM.door[1], MEET_ROOM.maxX)
}

// ───────────────────────── Đồ treo tường bắc ─────────────────────────

/** Đồ treo tường (cửa sổ, tranh, bảng) hạ xuống giữa mặt tường cao 3 ô */
const WALL_SHIFT = 10
const onWall = (s: Sprite, x: number, fromTop: number) => {
  s.anchor.set(0.5, 0)
  s.position.set(Math.round(px(x)), py(OFFICE.minZ) - WALL_FACE + WALL_SHIFT + fromTop)
  return s
}

/** Hai ô kính trong hình cửa sổ LimeZu (25×20): x 2–10 và 14–22, y 3–15 */
const PANES = [[2, 3, 9, 13], [14, 3, 9, 13]] as const

function buildWallDecor(floor: Container) {
  const wins = [-12.3, -1.5, 1.5]
  // Nắng xiên qua cửa sổ: vệt sáng nhạt trên sàn
  const sun = new Graphics()
  const y0 = py(OFFICE.minZ)
  for (const x of wins) {
    const cx = px(x)
    sun.poly([cx - 12, y0, cx + 12, y0, cx + 22, y0 + 44, cx - 2, y0 + 44]).fill({ color: 0xfff1c9, alpha: 0.2 })
  }
  floor.addChild(sun)
  // Kính phủ màu trời (trong suốt ban ngày) và vài ngôi sao ban đêm, vẽ đè lên ô kính
  const panes = new Graphics()
  const stars = new Graphics()
  for (const x of wins) {
    const w = onWall(new Sprite(sprite('window')), x, 6)
    floor.addChild(w)
    const left = Math.round(w.x - w.width / 2), top = Math.round(w.y)
    for (const [dx, dy, pw, ph] of PANES) panes.rect(left + dx, top + dy, pw, ph).fill(0xffffff)
    for (const [dx, dy] of [[4, 5], [8, 11], [16, 7], [20, 13], [18, 4]]) stars.rect(left + dx, top + dy, 1, 1).fill(0xfff6d0)
  }
  floor.addChild(panes, stars)
  floor.addChild(onWall(new Sprite(sprite('painting2')), -9.4, 9))
  floor.addChild(onWall(new Sprite(sprite('painting3')), -6.85, 9))
  floor.addChild(onWall(new Sprite(sprite('painting1')), 6.85, 9))
  // TV và bảng biểu đồ (Modern Office) phòng họp
  floor.addChild(onWall(new Sprite(sprite('tv')), 10.0, 7))
  floor.addChild(onWall(new Sprite(sprite('moChart2')), 12.3, 4))
  // Đồng hồ cúc cu (động)
  const clock = new AnimatedSprite(frames('clock', 16, 32))
  clock.anchor.set(0.5, 0)
  clock.position.set(Math.round(px(0)), py(OFFICE.minZ) - WALL_FACE)
  clock.animationSpeed = 0.06
  clock.play()
  floor.addChild(clock)
  return { sun, panes, stars }
}

/** Khung bảng treo tường bắc, trả về Graphics để vẽ nội dung */
function wallBoard(floor: Container, b: { x: number; w: number }, frame: 'corkboard' | 'chalkWall', inner?: number) {
  const w = Math.round(b.w * PPM), h = 26
  const x = Math.round(px(b.x) - w / 2), y = py(OFFICE.minZ) - WALL_FACE + WALL_SHIFT + 3
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
  return { content, w: w - 8, h: h - 9 }
}

let kanbanBox = { w: 0, h: 0 }
let fameBox = { w: 0, h: 0 }

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

/** Bảng vàng: dải tiêu đề vàng + top 3 (cột cao thấp theo EXP) */
export function drawFame(g: Graphics, top: { color: string; frac: number }[]) {
  g.clear()
  const { w } = fameBox
  g.rect(0, 0, w, 4).fill(GOLD)
  g.rect(Math.round(w / 2) - 4, 1, 8, 2).fill(0xfff3c4)
  const medal = [GOLD, 0xc9d1db, 0xd68a4c]
  top.slice(0, 3).forEach((t, i) => {
    const y = 6 + i * 4
    g.rect(2, y, 2, 3).fill(medal[i])
    g.rect(6, y, 3, 3).fill(t.color)
    g.rect(11, y + 1, Math.max(2, Math.round((w - 14) * t.frac)), 1).fill(medal[i])
  })
}

// ───────────────────────── Bàn làm việc ─────────────────────────

/** Màn hình nhìn ngang (bàn Lead: người ngồi quay sang phải) */
function monitorSide(g: Graphics, x: number, bottom: number) {
  const y = Math.round(bottom - 13)
  g.rect(x, y, 3, 10).fill(0x2b2f3a)
  g.rect(x + 3, bottom - 3, 3, 1).fill(0x2b2f3a)
  g.rect(x + 1, bottom - 3, 1, 3).fill(0x2b2f3a)
  return { x: x - 1, y: y + 1, w: 1, h: 8 }
}

/**
 * Mặt bàn: bàn gỗ mật ong của LimeZu (1_Generic), giữ mép và chân bàn, lặp vân gỗ cho đủ kích thước.
 * Bậc cao nhất thêm viền vàng.
 */
function deskTop(x: number, y: number, w: number, d: number, gold: boolean) {
  const X = Math.round(x), Y = Math.round(y), W = Math.round(w), D = Math.round(d)
  const c = new Container()
  c.addChild(new Graphics().rect(X + 2, Y + D + DESK_LIFT - 2, W - 1, 3).fill({ color: 0x000000, alpha: 0.2 }))
  // Bàn văn phòng của gói LimeZu Modern Office (giữ mép, lặp phần giữa cho vừa kích thước)
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
 * Bàn của một chỗ ngồi + ghế + đồ trang trí theo bậc (cây, màn thứ hai, đèn và ghế da, cúp và viền vàng).
 * Bàn quay về nam (người ngồi phía bắc, nhìn về camera), về bắc (người ngồi quay lưng), hoặc về đông (bàn Lead).
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
  lights.push({ x: scr.x + scr.w / 2, y: scr.y + scr.h / 2, r: 14, kind: 'screen' })
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
    const ch = spr('chairFront', seatX - 2, seatY + 2)
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

// ───────────────────────── Đồ đạc ─────────────────────────

function rug(f: Furniture) {
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
function withShadow(o: Container) {
  const b = o.getBounds()
  const g = new Graphics()
  g.ellipse(Math.round(b.x + b.width / 2), Math.round(b.y + b.height - 1), Math.max(4, Math.round(b.width * 0.46)), 3).fill({ color: 0x000000, alpha: 0.2 })
  const c = new Container()
  c.addChild(g, o)
  c.zIndex = o.zIndex
  return c
}

function furniture(f: Furniture): Container | null {
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

export function buildOffice(world: World, tierOfSlot: Map<string, number>): OfficeView {
  const floor = new Container()
  const top = new Container()
  const sorted: Container[] = []
  const screens: Screen[] = []

  buildFloor(floor)
  const all = [...FURNITURE, ...world.extras]
  for (const f of all) if (f.kind === 'rug') floor.addChild(rug(f))
  // Thảm xanh dưới mỗi cụm bàn: chia open space thành từng góc làm việc
  for (const p of world.pods) {
    const w = Math.round(6.0 * PPM), h = Math.round(3.7 * PPM)
    const r = new Sprite(stitch('rugGrey', w, h, 16, 16, 13, 13))
    r.position.set(Math.round(px(p.x) - w / 2), Math.round(py(p.z) - h / 2))
    floor.addChild(r)
  }
  const { sun, panes, stars } = buildWallDecor(floor)
  const kb = wallBoard(floor, BOARD, 'corkboard', CORK)
  kanbanBox = { w: kb.w, h: kb.h }
  const fb = wallBoard(floor, FAME, 'chalkWall')
  fameBox = { w: fb.w, h: fb.h }
  buildOuterWalls(floor, top)
  buildGlass(floor, sorted)

  for (const f of all) {
    const o = furniture(f)
    if (o) sorted.push(f.kind === 'fruitBowl' || f.kind === 'coffeeMachine' || f.kind === 'printer' ? o : withShadow(o))
  }
  const lights: Light[] = []
  world.slots.forEach((s, i) => buildDesk(s, tierOfSlot.get(s.id) ?? 0, sorted, screens, lights, i * 1.7))
  // Đèn cây: bóng đèn ở đỉnh (~1,4 m, tức 45 px phía trên chân)
  for (const f of all) if (f.kind === 'floorLamp') lights.push({ x: px(f.x), y: py(f.z) - 40, r: 44, kind: 'lamp' })
  // Đèn trần chỉ ở chỗ làm việc (mỗi cụm bàn, phòng Lead, phòng họp). Phòng kính thì kẹp trong phòng;
  // cụm bàn không có vách nên ánh sáng tràn nhẹ ra ngoài thảm.
  // Chỗ khác sáng nhờ đèn có thật: đèn cây, đèn bàn, màn hình, đèn dưới tủ bếp, TV, máy game, đèn cửa.
  for (const p of world.pods) lights.push({ x: px(p.x), y: py(p.z), r: 3.3 * PPM, kind: 'ceiling' })
  for (const r of [LEAD_ROOM, MEET_ROOM]) {
    const clip = { x: px(r.minX + 0.15), y: py(r.minZ), w: (r.maxX - r.minX - 0.3) * PPM, h: (r.maxZ - r.minZ - 0.15) * PPM }
    lights.push({ x: px((r.minX + r.maxX) / 2), y: py((r.minZ + r.maxZ) / 2 + 0.4), r: 2.6 * PPM, kind: 'ceiling', clip })
  }
  for (const f of all) {
    if (f.kind === 'kitchen') lights.push({ x: px(f.x), y: py(f.z) + 4, r: 1.6 * PPM, kind: 'lamp' })
    if (f.kind === 'tvStand') lights.push({ x: px(f.x), y: py(f.z) + 10, r: 1.4 * PPM, kind: 'screen' })
    if (f.kind === 'arcade') lights.push({ x: px(f.x), y: py(f.z) - 6, r: 0.9 * PPM, kind: 'screen' })
    if (f.kind === 'door') lights.push({ x: px(f.x), y: py(f.z) - 12, r: 1.5 * PPM, kind: 'lamp' })
  }

  return { floor, sorted, top, screens, kanban: kb.content, fame: fb.content, sun, panes, stars, lights }
}
