import { AnimatedSprite, Container, Graphics } from 'pixi.js'
import { itemById, type WallKind } from '../data/catalog'
import { cellsOf } from '../data/decor'
import { CELL, cellKey, cellX, cellZ, type OfficeState } from '../data/officeState'
import { cut, frames } from './assets'
import { PPM, WALL_FACE, px, py } from './geom'
import { CAP_FILL, CAP_SHADE, OUTLINE, WALL, tiled, type Rect } from './office'

/**
 * Vách bạn tự xây (mỗi ô 0,5 m một khối) và cửa kính lắp trên vách.
 * Nhìn từ trên nghiêng về bắc: thấy nắp vách, và mặt phía nam ở ô cuối của mỗi đoạn.
 * - Vách thấp: ngang hông, nắp sáng, mặt là chân tường LimeZu
 * - Vách kính: khung kim loại, mặt kính trong
 * - Tường cao: như tường bắc (cao 2 ô), tự mờ đi khi có người đứng phía sau
 */

const T = CELL * PPM
/** Mặt vách cao bao nhiêu pixel */
const FACE: Record<WallKind, number> = { low: 14, glass: 34, tall: WALL_FACE }
const GLASS = 0xbfe3ff
const FRAME = 0x5b6475
/** Nắp vách thấp tối hơn tường cao một chút, để phân biệt khi nhìn từ trên */
const LOW_CAP = 0xddd6c8
const LOW_EDGE = 0xbfb4a0
const RAIL = 0x5a6470

export interface WallView {
  /** Các khối vách và cửa, xếp lớp cùng người */
  sorted: Container[]
  /** Mặt tường cao (chỉ mặt, nắp giữ nguyên): làm mờ khi có người đứng phía sau */
  tall: { node: Container; x0: number; x1: number; bottom: number; face: number; a: number }[]
  doors: { anim: AnimatedSprite; x: number; y: number; open: number }[]
  /** Vùng bấm chọn cửa (uid → khung trên màn hình) */
  doorHits: Map<string, Rect>
}

/** Khung một khối vách trên màn hình (pixel gốc): từ nắp tới chân, để bấm chọn đúng chỗ đang thấy */
export function wallHit(c: number, r: number, kind: WallKind): Rect {
  const x = Math.round(px(cellX(c))), y = Math.round(py(cellZ(r)))
  return { x, y: y - FACE[kind], w: T, h: FACE[kind] + T }
}

/** Khung bao quanh nhiều khung */
export function unionRect(rs: Rect[]): Rect {
  const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y))
  const x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** Chân tường LimeZu (dải dưới của viên tường) cao h pixel */
const faceTex = (() => {
  const cache = new Map<number, ReturnType<typeof cut>>()
  return (h: number) => {
    let t = cache.get(h)
    if (!t) {
      const [x, y, w, wh] = WALL
      t = cut('walls', x, y + wh - Math.min(h, wh), w, Math.min(h, wh))
      cache.set(h, t)
    }
    return t
  }
})()

export function buildWalls(o: OfficeState): WallView {
  const out: WallView = { sorted: [], tall: [], doors: [], doorHits: new Map() }
  const doorCells = new Map<string, { uid: string; first: boolean; vertical: boolean }>()
  const kindAt = (c: number, r: number) => o.walls[cellKey(c, r)]
  for (const p of o.items) {
    const i = itemById.get(p.item)
    if (!i || p.stored || i.mount !== 'door') continue
    const cells = cellsOf(i, p.c, p.r, p.rot)
    cells.forEach(([c, r], k) => doorCells.set(cellKey(c, r), { uid: p.uid, first: k === 0, vertical: p.rot === 1 }))
    out.doorHits.set(p.uid, unionRect(cells.map(([c, r]) => wallHit(c, r, kindAt(c, r) ?? 'low'))))
  }

  for (const [key, kind] of Object.entries(o.walls)) {
    const [c, r] = key.split(',').map(Number)
    const x0 = Math.round(px(cellX(c))), y0 = Math.round(py(cellZ(r)))
    const bottom = y0 + T
    const door = doorCells.get(key)
    const F = FACE[kind]
    const same = (dc: number, dr: number) => kindAt(c + dc, r + dr) === kind && !doorCells.has(cellKey(c + dc, r + dr))

    if (door) {
      // Cửa: tường cao thì lắp cửa kính LimeZu (động) vào ô đầu; vách thấp / kính thì để lối đi trống
      if (door.first && !door.vertical && kind === 'tall') {
        const node = new Container()
        const g = new Graphics()
        capCell(g, x0, bottom - F - T, T * 2, kind, true, true, false, false)
        node.addChild(g)
        const a = new AnimatedSprite(frames('door', 32, 48))
        a.position.set(x0, bottom - 48)
        a.gotoAndStop(0)
        node.addChild(a)
        node.zIndex = bottom
        out.sorted.push(node)
        out.doors.push({ anim: a, x: x0 + T, y: bottom, open: 0 })
      }
      continue
    }

    const node = new Container()
    const g = new Graphics()
    const showFace = !same(0, 1)
    // Nắp (mặt trên của khối) nằm phía trên chỗ đứng một khoảng bằng chiều cao mặt vách
    capCell(g, x0, y0 - F, T, kind, !same(0, -1), !same(0, 1), !same(-1, 0), !same(1, 0), c)
    // Bóng đổ nhạt trên sàn phía đông vách thấp / kính (cho có khối)
    if (kind !== 'tall' && !same(1, 0)) g.rect(x0 + T, y0 - F + 4, 2, F + T - 4).fill({ color: 0x000000, alpha: 0.18 })
    node.addChild(g)
    const face = new Container()
    node.addChild(face)
    if (showFace) {
      if (kind === 'tall') {
        // Như tường bắc: viên tường nguyên (có chân tường); mặt cao hơn viên tường thì lặp phần giữa ở dải trên
        const [wx, wy, ww, wh] = WALL
        if (F > wh) face.addChild(tiled(cut('walls', wx, wy + 8, ww, F - wh), x0, bottom - F, T, F - wh))
        face.addChild(tiled(cut('walls', wx, wy, ww, wh), x0, bottom - wh, T, wh))
      } else if (kind === 'low') {
        face.addChild(tiled(faceTex(F), x0, bottom - F, T, F))
      } else {
        const fg = new Graphics()
        // Kính: mặt kính trong xanh nhạt, vệt sáng chéo cách ~12 px, ray trên, chân khung kim loại, cột mỗi 2 ô
        fg.rect(x0, bottom - F, T, F - 5).fill({ color: GLASS, alpha: 0.35 })
        fg.rect(x0, bottom - F, T, 2).fill(RAIL)
        if ((c * 16) % 24 < 16) for (let k = 0; k < 7; k++) fg.rect(x0 + 3 + k, bottom - F + 20 - k * 2, 1, 2).fill({ color: 0xffffff, alpha: 0.55 })
        if (c % 2 === 0) fg.rect(x0, bottom - F, 2, F).fill(RAIL)
        fg.rect(x0, bottom - 5, T, 5).fill(FRAME)
        fg.rect(x0, bottom - 5, T, 1).fill(0x8a93a6)
        face.addChild(fg)
      }
      // Viền hai bên mặt vách ở đầu đoạn
      const eg = new Graphics()
      if (!same(-1, 0)) eg.rect(x0, bottom - F, 1, F).fill(OUTLINE)
      if (!same(1, 0)) eg.rect(x0 + T - 1, bottom - F, 1, F).fill(OUTLINE)
      eg.rect(x0, bottom, T, 2).fill({ color: 0x000000, alpha: 0.14 })
      face.addChild(eg)
    }
    node.zIndex = bottom
    out.sorted.push(node)
    if (kind === 'tall' && showFace) out.tall.push({ node: face, x0, x1: x0 + T, bottom, face: F, a: 1 })
  }
  return out
}

/** Nắp một khối vách: viền tối ở cạnh không nối với khối cùng loại */
function capCell(g: Graphics, x: number, y: number, w: number, kind: WallKind, n: boolean, s: boolean, wEdge: boolean, e: boolean, c = 0) {
  if (kind === 'glass') {
    // Vách kính nhìn từ trên: dải kính xanh nhạt giữa hai ray kim loại, cột mỗi 2 ô
    g.rect(x, y + 5, w, 6).fill({ color: GLASS, alpha: 0.35 })
    g.rect(x, y + 5, w, 2).fill(RAIL)
    g.rect(x, y + 10, w, 1).fill(RAIL)
    if (c % 2 === 0) g.rect(x, y + 3, 2, 10).fill(RAIL)
    if (wEdge) g.rect(x, y + 3, 2, 10).fill(OUTLINE)
    if (e) g.rect(x + w - 2, y + 3, 2, 10).fill(OUTLINE)
    return
  }
  g.rect(x, y, w, T).fill(kind === 'low' ? LOW_CAP : CAP_FILL)
  if (kind === 'low') {
    // Mép nắp vách thấp phía đông / nam sẫm hơn cho ra khối
    if (e) g.rect(x + w - 3, y, 2, T).fill(LOW_EDGE)
    if (s) g.rect(x, y + T - 3, w, 2).fill(LOW_EDGE)
  } else if (s) g.rect(x, y + T - 3, w, 2).fill(CAP_SHADE)
  if (n) g.rect(x, y, w, 1).fill(OUTLINE)
  if (s) g.rect(x, y + T - 1, w, 1).fill(OUTLINE)
  if (wEdge) g.rect(x, y, 1, T).fill(OUTLINE)
  if (e) g.rect(x + w - 1, y, 1, T).fill(OUTLINE)
}

/**
 * Mỗi khung hình: tường cao mờ đi khi có người đứng phía sau (để vẫn thấy agent), cửa tự mở khi có người tới gần.
 * `people`: chân người (pixel gốc).
 */
export function updateWalls(v: WallView, people: { x: number; y: number }[], dt: number) {
  for (const w of v.tall) {
    // Người đứng ngay trong hàng vách (ở khung cửa) không tính là phía sau: khỏi mờ thành lỗ thủng cạnh cửa
    const behind = people.some((p) => p.y < w.bottom - T + 2 && p.y > w.bottom - w.face - T - 8 && p.x > w.x0 - 7 && p.x < w.x1 + 7)
    const target = behind ? 0.35 : 1
    w.a += (target - w.a) * Math.min(1, dt * 10)
    w.node.alpha = w.a
  }
  for (const d of v.doors) {
    const near = people.some((p) => Math.abs(p.x - d.x) < 26 && Math.abs(p.y - d.y) < 30)
    d.open = Math.max(0, Math.min(4, d.open + (near ? dt : -dt) * 14))
    d.anim.gotoAndStop(Math.round(d.open))
  }
}
