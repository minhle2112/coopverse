import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Container, Graphics, Sprite } from 'pixi.js'
import { DESK_ITEMS, WALLS, footprint, itemById, lowerName, nextRot, resale, wallPrice, type DeskItem, type Item } from '../data/catalog'
import {
  RESERVED, apply, canDesk, canPlace, canUnwall, canWall, cellsOf, costOf, deskCells, doorRot, reserved, type Action, type Cell, type Check, type PlaceOpts,
} from '../data/decor'
import {
  CELL, COLS, ROWS, cellKey, cellX, cellZ, colOf, isClean, patchAt, rowOf, type OfficeState, type Placed,
} from '../data/officeState'
import { useExp } from '../data/exp'
import { act, useBalance, useOffice } from '../data/officeSync'
import { decorated, deskGift } from '../life/director'
import { fmtXu } from '../data/xu'
import { useCoop } from '../store'
import { useDeco, type Pending } from '../ui/decoStore'
import { blockedReason, buildWorld, type World } from '../world/layout'
import { forward } from '../world/room'
import { deskThumb, footRect, itemView, wallRect } from './catalogArt'
import { PPM, px, py, wx, wz } from './geom'
import type { OfficeView, Rect } from './office'
import { stage, ticks, toScreen, type Tick } from './stage'
import { unionRect, wallHit } from './walls'

/**
 * Chế độ trang trí trên bản đồ: lưới ô, bóng mờ của món đang cầm (khung xanh = đặt được, đỏ = không, kèm lý do),
 * kéo chuột vẽ vách, bấm chọn món đã đặt / bàn làm việc, nút ✓ / ✕ và các nút của món đang chọn.
 * Scene chuyển sự kiện chuột vào đây khi chế độ đang mở.
 */

/** Bố cục và hình văn phòng hiện tại (Scene cập nhật) */
export const decoCtx: { world: World | null; view: OfficeView | null } = { world: null, view: null }

/** Chuột trên bản đồ (pixel gốc), ô bắt đầu kéo vách */
const mouse = { x: 0, y: 0, in: false, drag: null as Cell | null }

const OK = 0x7bd88f
const BAD = 0xef6f5e
const SEL = 0xf4d35e

const cellAt = (x: number, y: number): Cell => [colOf(wx(x)), rowOf(wz(y))]

/** Khối vách đang thấy dưới điểm (pixel gốc): vách vẽ cao lên phía trên ô của nó, khối nằm trước nhất thắng */
function wallAt(x: number, y: number): Cell | null {
  const o = useOffice.getState().office
  let best: Cell | null = null, bz = -Infinity
  for (const [key, kind] of Object.entries(o.walls)) {
    const [c, r] = key.split(',').map(Number)
    const h = wallHit(c, r, kind)
    if (x < h.x || x >= h.x + h.w || y < h.y || y >= h.y + h.h) continue
    if (h.y + h.h > bz) { bz = h.y + h.h; best = [c, r] }
  }
  return best
}

/** Ô đang trỏ khi dỡ vách: bấm lên mặt vách là trúng vách đó */
const eraseCellAt = (x: number, y: number): Cell => wallAt(x, y) ?? cellAt(x, y)

/** Các ô có cửa lắp trên vách */
function doorKeys(o: OfficeState): Set<string> {
  const s = new Set<string>()
  for (const p of o.items) {
    const i = itemById.get(p.item)
    if (i?.mount === 'door' && !p.stored) for (const [c, r] of cellsOf(i, p.c, p.r, p.rot)) s.add(cellKey(c, r))
  }
  return s
}

/** Đoạn vách cùng loại liền nhau chứa ô (c, r), theo hàng ngang (hoặc dọc nếu hàng ngang chỉ có một ô), dừng ở cửa */
function wallRun(o: OfficeState, c: number, r: number): Cell[] {
  const kind = o.walls[cellKey(c, r)]
  if (!kind) return []
  const door = doorKeys(o)
  const same = (cc: number, rr: number) => o.walls[cellKey(cc, rr)] === kind && !door.has(cellKey(cc, rr))
  const run = (dc: number, dr: number) => {
    const out: Cell[] = [[c, r]]
    for (let k = 1; same(c - dc * k, r - dr * k); k++) out.unshift([c - dc * k, r - dr * k])
    for (let k = 1; same(c + dc * k, r + dr * k); k++) out.push([c + dc * k, r + dr * k])
    return out
  }
  const h = run(1, 0)
  return h.length > 1 ? h : run(0, 1)
}

/** Khung trên màn hình của các ô: ô có vách thì lấy cả khối vách đang thấy */
const shownRect = (o: OfficeState, cells: Cell[]): Rect =>
  unionRect(cells.map(([c, r]) => { const k = o.walls[cellKey(c, r)]; return k ? wallHit(c, r, k) : cellsRect([[c, r]]) }))
const levelOf = (id: string) => useExp.getState().stats[id]?.level ?? 1

/** Ô bàn làm việc chiếm (trừ chỗ ngồi `except`) → kiểm đặt đồ */
function deskBlock(w: World, except?: string): PlaceOpts['blocked'] {
  if (!except) return (c, r) => w.deskCells.has(cellKey(c, r))
  const s = new Set<string>()
  for (const sl of w.slots) if (sl.id !== except) for (const [c, r] of deskCells({ x: sl.seat.x, z: sl.seat.z, yaw: sl.yaw })) s.add(cellKey(c, r))
  return (c, r) => s.has(cellKey(c, r))
}

/** Thử trước trạng thái mới: còn lối tới mọi bàn và bảng ticket không */
function pathsOk(next: OfficeState): Check {
  const why = blockedReason(buildWorld(useCoop.getState().agents, next))
  return why ? { ok: false, why } : { ok: true }
}

const withItem = (o: OfficeState, p: Placed): OfficeState => ({ ...o, items: [...o.items.filter((x) => x.uid !== p.uid), p] })

/** Chỗ đặt món i khi chuột ở ô (c, r): mảnh giữa của món nằm dưới chuột. Cửa tự xoay theo vách. */
function anchor(o: OfficeState, i: Item, c: number, r: number, rot: number): { c: number; r: number; rot: number } {
  if (i.mount === 'door') {
    for (const [cc, rr] of [[c, r], [c - 1, r], [c, r - 1]]) {
      const d = doorRot(o, cc, rr)
      if (d !== null) return { c: cc, r: rr, rot: d }
    }
    return { c, r, rot: 0 }
  }
  if (i.mount === 'wall') return { c: c - Math.floor(i.w / 2), r: 0, rot: 0 }
  const f = footprint(i, rot)
  return { c: c - Math.floor((f.w - 1) / 2), r: r - (f.d - 1), rot }
}

/** Kiểm một chỗ đặt món (kể cả lối đi), có nhớ kết quả cho lần hỏi giống hệt */
let memo = { key: '', res: { ok: true } as Check }
function checkItem(o: OfficeState, w: World, i: Item, c: number, r: number, rot: number, uid?: string): Check {
  const key = `${uid ?? i.id}|${c},${r},${rot}|${o.spent.length}|${o.items.length}|${JSON.stringify(o.walls).length}|${w.slots.length}`
  if (memo.key === key) return memo.res
  let res = canPlace(o, i, c, r, rot, { ignore: uid, blocked: deskBlock(w) })
  if (res.ok && i.mount === 'floor' && i.h > 0) res = pathsOk(withItem(o, { uid: uid ?? '#try', item: i.id, c, r, rot, at: 0 }))
  memo = { key, res }
  return res
}

/** Ô thẳng hàng từ a tới b (chọn hướng dài hơn: ngang hoặc dọc) */
function line(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = []
  if (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1])) {
    const s = Math.sign(b[0] - a[0]) || 1
    for (let c = a[0]; c !== b[0] + s; c += s) out.push([c, a[1]])
  } else {
    const s = Math.sign(b[1] - a[1]) || 1
    for (let r = a[1]; r !== b[1] + s; r += s) out.push([a[0], r])
  }
  return out.filter(([c, r]) => c >= 0 && r >= 0 && c < COLS && r < ROWS)
}

const cellsRect = (cells: Cell[]): Rect => {
  const cs = cells.map((p) => p[0]), rs = cells.map((p) => p[1])
  const c0 = Math.min(...cs), r0 = Math.min(...rs)
  return { x: Math.round(px(cellX(c0))), y: Math.round(py(cellZ(r0))), w: (Math.max(...cs) - c0 + 1) * CELL * PPM, h: (Math.max(...rs) - r0 + 1) * CELL * PPM }
}

function checkWall(o: OfficeState, w: World, p: Pending): Check {
  if (p.kind === 'erase') return canUnwall(o, p.cells)
  if (p.kind !== 'wall') return { ok: true }
  const res = canWall(o, p.cells, p.wall, { blocked: deskBlock(w) })
  if (!res.ok) return res
  const walls = { ...o.walls }
  for (const [c, r] of p.cells) walls[cellKey(c, r)] = p.wall
  return pathsOk({ ...o, walls })
}

/** Món đã đặt / bàn dưới điểm (pixel gốc): món nằm trước nhất (chân thấp nhất trên màn hình) thắng */
function selectAt(x: number, y: number): string | null {
  const v = decoCtx.view, w = decoCtx.world
  if (!v || !w) return null
  let best: string | null = null, bz = -Infinity
  const o = useOffice.getState().office
  for (const [uid, h] of v.itemHits) {
    if (x < h.x || x >= h.x + h.w || y < h.y || y >= h.y + h.h) continue
    const i = itemById.get(o.items.find((p) => p.uid === uid)?.item ?? '')
    // Thảm nằm dưới cùng: chỉ chọn khi không trúng món nào khác
    const z = i?.mount === 'rug' ? -1e6 : h.y + h.h
    if (z > bz) { bz = z; best = uid }
  }
  for (const sl of w.slots) {
    const r = cellsRect(deskCells({ x: sl.seat.x, z: sl.seat.z, yaw: sl.yaw }))
    if (x >= r.x && x < r.x + r.w && y >= r.y - 12 && y < r.y + r.h && r.y + r.h > bz) { bz = r.y + r.h; best = `desk:${sl.id}` }
  }
  // Vách tự xây: chọn cả đoạn (cửa trên vách là một món riêng, đã xét ở trên)
  const wc = wallAt(x, y)
  if (wc && !doorKeys(o).has(cellKey(wc[0], wc[1]))) {
    const h = wallHit(wc[0], wc[1], o.walls[cellKey(wc[0], wc[1])])
    if (h.y + h.h > bz) best = `wall:${wc[0]},${wc[1]}`
  }
  return best
}

// ───────────────────────── Sự kiện chuột (Scene gọi) ─────────────────────────

export function decoMove(x: number, y: number) {
  mouse.x = x
  mouse.y = y
  mouse.in = true
}
export function decoLeave() { mouse.in = false }

export function decoDown(x: number, y: number) {
  const d = useDeco.getState()
  if (d.busy || d.pending) return
  if (d.draft?.kind === 'wall') mouse.drag = cellAt(x, y)
  else if (d.draft?.kind === 'erase') mouse.drag = eraseCellAt(x, y)
}

export function decoUp(x: number, y: number) {
  const d = useDeco.getState()
  const from = mouse.drag
  mouse.drag = null
  if (!from || !d.draft || (d.draft.kind !== 'wall' && d.draft.kind !== 'erase')) return
  const cells = line(from, d.draft.kind === 'erase' ? eraseCellAt(x, y) : cellAt(x, y))
  if (!cells.length) return
  d.setPending(d.draft.kind === 'wall' ? { kind: 'wall', wall: d.draft.wall, cells } : { kind: 'erase', cells })
}

export function decoClick(x: number, y: number) {
  const d = useDeco.getState()
  const w = decoCtx.world
  if (d.busy || !w) return
  const o = useOffice.getState().office
  const [c, r] = cellAt(x, y)
  const dr = d.draft
  if (!dr) return d.select(selectAt(x, y))
  if (d.pending) return
  if (dr.kind === 'new') {
    const i = itemById.get(dr.item)!
    const a = anchor(o, i, c, r, dr.rot)
    const chk = checkItem(o, w, i, a.c, a.r, a.rot)
    if (!chk.ok) return useCoop.getState().showToast(chk.why!)
    d.setPending({ kind: 'item', item: i.id, ...a })
  } else if (dr.kind === 'move') {
    const i = itemById.get(dr.item)!
    const a = anchor(o, i, c, r, dr.rot)
    void run({ action: 'place', uid: dr.uid, ...a }, `Đã đặt ${lowerName(i.name)}`, () => useDeco.getState().select(dr.uid))
  } else if (dr.kind === 'desk') {
    const p = deskAt(x, y, dr.yaw)
    void run({ action: 'desk', slot: dr.slot, ...p }, 'Đã dời bàn', () => useDeco.getState().select(`desk:${dr.slot}`))
  }
}

/** Ghế đặt ở tâm ô dưới chuột, bàn nằm phía trước */
function deskAt(x: number, y: number, yaw: number) {
  const [c, r] = cellAt(x, y)
  return { x: cellX(c) + CELL / 2, z: cellZ(r) + CELL / 2, yaw }
}

/** Phím R: xoay món đang cầm / đang đặt thử / đang chọn */
export function decoRotate() {
  const d = useDeco.getState()
  const dr = d.draft
  if (d.pending?.kind === 'item') {
    const i = itemById.get(d.pending.item)!
    d.setPending({ ...d.pending, rot: nextRot(i, d.pending.rot) })
  } else if (dr?.kind === 'new' || dr?.kind === 'move') {
    useDeco.setState({ draft: { ...dr, rot: nextRot(itemById.get(dr.item)!, dr.rot) } })
  } else if (dr?.kind === 'desk') {
    useDeco.setState({ draft: { ...dr, yaw: nextYaw(dr.yaw) } })
  } else if (d.sel) {
    void rotateSelected()
  }
}

const YAWS = [0, -Math.PI / 2, Math.PI, Math.PI / 2]
const nextYaw = (y: number) => YAWS[(YAWS.findIndex((v) => Math.abs(v - y) < 1e-3) + 1) % YAWS.length]

async function rotateSelected() {
  const d = useDeco.getState()
  const o = useOffice.getState().office
  const w = decoCtx.world
  if (!d.sel || !w) return
  if (d.sel.startsWith('desk:')) {
    const slot = d.sel.slice(5)
    const sl = w.slots.find((s) => s.id === slot)
    if (sl) await run({ action: 'desk', slot, x: sl.seat.x, z: sl.seat.z, yaw: nextYaw(sl.yaw) }, 'Đã xoay bàn')
    return
  }
  const p = o.items.find((x) => x.uid === d.sel)
  const i = p && itemById.get(p.item)
  if (!p || !i || i.turn === 'none') return
  await run({ action: 'place', uid: p.uid, c: p.c, r: p.r, rot: nextRot(i, p.rot) }, `Đã xoay ${lowerName(i.name)}`)
}

/**
 * Gửi một lệnh trang trí: kiểm lối đi trước (đồ, vách, bàn mới không được nhốt agent), rồi gửi.
 * Thành công thì báo, lỗi thì hiện lý do.
 */
async function run(a: Action, done: string, after?: () => void): Promise<boolean> {
  const d = useDeco.getState()
  const w = decoCtx.world
  if (d.busy || !w) return false
  const toast = useCoop.getState().showToast
  const o = useOffice.getState().office
  const blocked = deskBlock(w, a.action === 'desk' ? a.slot : undefined)
  // Thử trước trên bản sao để kiểm lối đi (server không biết bàn nằm đâu)
  const trial = apply(o, a, Infinity, 0, () => '#try', { blocked, levelOf })
  if ('error' in trial) { toast(trial.error); return false }
  if (a.action === 'buy' || a.action === 'place' || a.action === 'wall' || a.action === 'desk') {
    const chk = pathsOk(trial.office)
    if (!chk.ok) { toast(chk.why!); return false }
  }
  d.setBusy(true)
  try {
    await act(a, { blocked })
    toast(done)
    after?.()
    return true
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Không làm được')
    return false
  } finally {
    useDeco.getState().setBusy(false)
  }
}

// ───────────────────────── Lớp vẽ trên bản đồ + nút ─────────────────────────

/** Vẽ khung kiến bò quanh r */
function ants(g: Graphics, r: Rect, color: number, phase: number) {
  g.rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2).stroke({ color: 0x2a1f14, alpha: 0.8, width: 1, alignment: 1 })
  const dash = (x0: number, y0: number, len: number, horiz: boolean) => {
    for (let k = phase; k < len; k += 4) {
      if (horiz) g.rect(x0 + k, y0, Math.min(2, len - k), 1).fill(color)
      else g.rect(x0, y0 + k, 1, Math.min(2, len - k)).fill(color)
    }
  }
  dash(r.x, r.y, r.w, true)
  dash(r.x, r.y + r.h - 1, r.w, true)
  dash(r.x, r.y, r.h, false)
  dash(r.x + r.w - 1, r.y, r.h, false)
}

/**
 * Dấu chỗ đặt: nền màu + bóng tiếp đất nằm dưới bóng mờ của món (`under`), viền 2 px + góc vuông nằm trên (`over`).
 * Không đặt được: đỏ, thêm sọc chéo.
 */
function mark(under: Graphics, over: Graphics, r: Rect, ok: boolean, floor = true) {
  const col = ok ? OK : BAD
  if (floor) under.rect(r.x + 1, r.y + r.h - 4, r.w - 2, 4).fill({ color: 0x000000, alpha: 0.2 })
  if (ok) under.rect(r.x, r.y, r.w, r.h).fill({ color: col, alpha: 0.25 })
  else {
    // Sọc chéo 45° mảnh, cách 6 px, nằm dưới bóng mờ để vẫn thấy món
    for (let k = -r.h; k < r.w; k += 6) {
      for (let j = 0; j < r.h; j++) {
        const x = k + j
        if (x >= 0 && x < r.w) under.rect(r.x + x, r.y + r.h - 1 - j, 1, 1).fill({ color: col, alpha: 0.5 })
      }
    }
  }
  over.rect(r.x, r.y, r.w, r.h).stroke({ color: 0x1e1a2b, alpha: 0.7, width: 1, alignment: 1 })
  over.rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2).stroke({ color: col, width: 2, alignment: 0 })
  // Góc vuông 3 px nổi ra ngoài
  for (const [cx, cy, sx, sy] of [[r.x - 2, r.y - 2, 1, 1], [r.x + r.w + 1, r.y - 2, -1, 1], [r.x - 2, r.y + r.h + 1, 1, -1], [r.x + r.w + 1, r.y + r.h + 1, -1, -1]]) {
    over.rect(sx > 0 ? cx : cx - 3, cy, 4, 1).fill(0xffffff)
    over.rect(cx, sy > 0 ? cy : cy - 3, 1, 4).fill(0xffffff)
  }
}

/** Nhuộm màu mọi hình trong một nhánh (bóng mờ món không đặt được) */
function setTint(o: Container, color: number) {
  if ('tint' in o && o instanceof Sprite) o.tint = color
  for (const ch of o.children) setTint(ch, color)
}

/** Khu luôn để trống: sọc đỏ chéo + viền nét đứt + nhãn */
function drawReserved(g: Graphics) {
  for (const z of RESERVED) {
    const x0 = Math.round(px(cellX(z.c0))), y0 = Math.round(py(cellZ(z.r0)))
    const w = (z.c1 - z.c0 + 1) * 16, h = (z.r1 - z.r0 + 1) * 16
    g.rect(x0, y0, w, h).fill({ color: BAD, alpha: 0.12 })
    for (let k = -h; k < w; k += 6) for (let j = 0; j < h; j++) { const x = k + j; if (x >= 0 && x < w && (j % 2 === 0)) g.rect(x0 + x, y0 + h - 1 - j, 1, 1).fill({ color: BAD, alpha: 0.35 }) }
    for (let k = 0; k < w; k += 4) { g.rect(x0 + k, y0, 2, 1).fill({ color: BAD, alpha: 0.8 }) }
    for (let k = 0; k < h; k += 4) { g.rect(x0, y0 + k, 1, 2).fill({ color: BAD, alpha: 0.8 }); g.rect(x0 + w - 1, y0 + k, 1, 2).fill({ color: BAD, alpha: 0.8 }) }
  }
}

/** Lưới ô: chấm ở góc ô trên sàn đã dọn, sọc mờ ở chỗ luôn để trống, phủ tối chỗ còn bẩn */
function drawGrid(g: Graphics, o: OfficeState) {
  g.clear()
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = Math.round(px(cellX(c))), y = Math.round(py(cellZ(r)))
      const p = patchAt(cellX(c) + CELL / 2, cellZ(r) + CELL / 2)
      if (reserved(c, r)) continue
      else if (!p || !isClean(o, p.id)) {
        g.rect(x, y, 16, 16).fill({ color: 0x000000, alpha: 0.16 })
      } else {
        g.rect(x, y, 1, 1).fill({ color: 0xffffff, alpha: 0.45 })
        g.rect(x + 8, y + 8, 1, 1).fill({ color: 0x000000, alpha: 0.12 })
      }
    }
  }
  drawReserved(g)
}

interface Tag { x: number; y: number; text: string; ok: boolean }

export function DecoOverlay() {
  const open = useDeco((s) => s.open)
  const draft = useDeco((s) => s.draft)
  const sel = useDeco((s) => s.sel)
  const pending = useDeco((s) => s.pending)
  const busy = useDeco((s) => s.busy)
  const office = useOffice((s) => s.office)
  const balance = useBalance()
  const bar = useRef<HTMLDivElement>(null)
  const tagEl = useRef<HTMLDivElement>(null)
  const [tag, setTag] = useState<Tag | null>(null)
  const [sure, setSure] = useState(false)
  useEffect(() => setSure(false), [sel])

  // Lưới: vẽ lại khi chỗ đã dọn đổi
  useEffect(() => {
    if (!open || !stage.fx) return
    document.body.classList.add('deco-mode')
    const g = new Graphics()
    stage.fx.addChildAt(g, 0)
    drawGrid(g, office)
    return () => {
      document.body.classList.remove('deco-mode')
      g.removeFromParent()
      g.destroy()
    }
  }, [open, office])

  // Bóng mờ của món đang cầm / đang đặt thử, khung chọn, kéo vách: vẽ mỗi khung hình
  useEffect(() => {
    if (!open || !stage.fx) return
    const g = new Graphics()
    const under = new Graphics()
    const ghost = new Container()
    // Màu thật của món, chỉ trong mờ
    ghost.alpha = 0.68
    stage.fx.addChild(under, ghost, g)
    let ghostKey = ''
    let lastTag = ''
    const tick: Tick = (_dt, t) => {
      const d = useDeco.getState()
      const o = useOffice.getState().office
      const w = decoCtx.world
      g.clear()
      under.clear()
      let tg: Tag | null = null
      const phase = Math.floor(t * 8) % 4
      const setGhost = (key: string, build: () => Container | null) => {
        if (key === ghostKey) return
        ghostKey = key
        for (const ch of ghost.removeChildren()) ch.destroy({ children: true })
        const n = build()
        if (n) ghost.addChild(n)
      }
      const p = d.pending
      const dr = d.draft
      let bad = false
      if (w && p?.kind === 'item') {
        const i = itemById.get(p.item)!
        const chk = checkItem(o, w, i, p.c, p.r, p.rot)
        const rect = i.mount === 'wall' ? wallRect(i, p.c) : footRect(i, p.c, p.r, p.rot)
        setGhost(`p|${i.id}|${p.c},${p.r},${p.rot}`, () => itemView(i, p.c, p.r, p.rot).node)
        mark(under, g, rect, chk.ok, i.mount !== 'wall')
        bad = !chk.ok
        tg = { x: rect.x + rect.w / 2, y: rect.y + rect.h + 4, text: '', ok: chk.ok }
      } else if (w && p && (p.kind === 'wall' || p.kind === 'erase')) {
        setGhost('', () => null)
        const chk = checkWall(o, w, p)
        for (const [c, r] of p.cells) {
          const k = p.kind === 'erase' ? o.walls[cellKey(c, r)] : undefined
          const b = k ? wallHit(c, r, k) : cellsRect([[c, r]])
          g.rect(b.x, b.y, b.w, b.h).fill({ color: chk.ok ? (p.kind === 'erase' ? BAD : OK) : BAD, alpha: 0.35 })
        }
        const rect = p.kind === 'erase' ? shownRect(o, p.cells) : cellsRect(p.cells)
        ants(g, rect, chk.ok ? OK : BAD, phase)
        tg = { x: rect.x + rect.w / 2, y: rect.y + rect.h + 4, text: '', ok: chk.ok }
      } else if (w && mouse.in && dr) {
        const [c, r] = cellAt(mouse.x, mouse.y)
        if (dr.kind === 'new' || dr.kind === 'move') {
          const i = itemById.get(dr.item)!
          const a = anchor(o, i, c, r, dr.rot)
          const chk = checkItem(o, w, i, a.c, a.r, a.rot, dr.kind === 'move' ? dr.uid : undefined)
          const rect = i.mount === 'wall' ? wallRect(i, a.c) : footRect(i, a.c, a.r, a.rot)
          setGhost(`d|${i.id}|${a.c},${a.r},${a.rot}`, () => itemView(i, a.c, a.r, a.rot).node)
          mark(under, g, rect, chk.ok, i.mount !== 'wall')
          bad = !chk.ok
          if (!chk.ok) tg = { x: rect.x + rect.w / 2, y: rect.y - 6, text: chk.why!, ok: false }
        } else if (dr.kind === 'desk') {
          setGhost('', () => null)
          const pos = deskAt(mouse.x, mouse.y, dr.yaw)
          const chk = canDesk(o, pos, { blocked: deskBlock(w, dr.slot) })
          drawDesk(g, pos, chk.ok ? OK : BAD)
          const rect = cellsRect(deskCells(pos))
          if (!chk.ok) tg = { x: rect.x + rect.w / 2, y: rect.y - 8, text: chk.why!, ok: false }
        } else {
          setGhost('', () => null)
          const erase = dr.kind === 'erase'
          const at: Cell = erase ? eraseCellAt(mouse.x, mouse.y) : [c, r]
          const cells = mouse.drag ? line(mouse.drag, at) : [at]
          const pend: Pending = dr.kind === 'wall' ? { kind: 'wall', wall: dr.wall, cells } : { kind: 'erase', cells }
          const chk = mouse.drag ? checkWall(o, w, pend) : { ok: true }
          for (const [cc, rr] of cells) {
            // Dỡ vách: tô cả khối vách đang thấy, không chỉ ô chân
            const k = erase ? o.walls[cellKey(cc, rr)] : undefined
            const b = k ? wallHit(cc, rr, k) : cellsRect([[cc, rr]])
            g.rect(b.x, b.y, b.w, b.h).fill({ color: chk.ok ? (erase ? BAD : OK) : BAD, alpha: 0.3 })
            g.rect(b.x, b.y, b.w, b.h).stroke({ color: chk.ok ? 0xffffff : BAD, alpha: 0.6, width: 1, alignment: 1 })
          }
          const rect = erase ? shownRect(o, cells) : cellsRect(cells)
          if (mouse.drag) {
            const n = cells.filter(([cc, rr]) => dr.kind === 'erase' ? o.walls[cellKey(cc, rr)] : !o.walls[cellKey(cc, rr)]).length
            const text = !chk.ok ? chk.why! : dr.kind === 'wall' ? `${n} ô · ${fmtXu(n * wallPrice(dr.wall))} Xu` : `Dỡ ${n} ô`
            tg = { x: rect.x + rect.w / 2, y: rect.y - 6, text, ok: chk.ok }
          }
        }
      } else {
        setGhost('', () => null)
      }
      // Không đặt được: bóng mờ ửng đỏ, rõ hơn một chút
      ghost.alpha = bad ? 0.78 : 0.68
      for (const ch of ghost.children) setTint(ch, bad ? 0xff9c9c : 0xffffff)
      // Món đang chọn: khung kiến bò vàng
      if (d.sel && !dr && decoCtx.view) {
        const r = selRect(d.sel)
        if (r) ants(g, r, SEL, phase)
      }
      // Nút của chỗ đặt thử / món đang chọn bám theo vị trí trên màn hình
      const anchorPt = p ? tg : d.sel && !dr ? (() => { const r = selRect(d.sel!); return r ? { x: r.x + r.w / 2, y: r.y + r.h + (d.sel!.startsWith('desk:') ? 7 : 3) } : null })() : null
      if (bar.current) {
        const s = anchorPt ? toScreen(anchorPt.x, anchorPt.y) : { x: -9999, y: -9999 }
        bar.current.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`
      }
      const showTag = !p && tg?.text ? tg : null
      if (tagEl.current) {
        const s = showTag ? toScreen(showTag.x, showTag.y) : { x: -9999, y: -9999 }
        tagEl.current.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`
      }
      const k = showTag ? `${showTag.text}|${showTag.ok}` : ''
      if (k !== lastTag) { lastTag = k; setTag(showTag) }
    }
    ticks.add(tick)
    return () => {
      ticks.delete(tick)
      ghost.destroy({ children: true })
      g.destroy()
      under.destroy()
    }
  }, [open])

  if (!open || !stage.overlay) return null
  const o = office
  const selItem = sel && !sel.startsWith('desk:') && !sel.startsWith('wall:') ? o.items.find((p) => p.uid === sel) : undefined
  const selWall = sel?.startsWith('wall:') ? wallSel(o, sel) : null
  const selDef = selItem && itemById.get(selItem.item)
  const cost = pending ? costOf(o, pendingAction(pending)) : 0

  return createPortal(
    <>
      <div ref={tagEl} className="px-anchor deco-tag" style={{ transform: 'translate(-9999px, -9999px)' }}>
        {tag && <span className={tag.ok ? 'ok' : 'bad'}>{tag.text}</span>}
      </div>
      <div ref={bar} className="px-anchor deco-bar" style={{ transform: 'translate(-9999px, -9999px)' }}>
        {pending && (
          <div className="deco-btns">
            <button type="button" className="desk-btn primary" disabled={busy || (cost > 0 && balance < cost)}
              onClick={() => void confirmPending(pending)}
              title={cost > balance ? `Còn thiếu ${fmtXu(cost - balance)} Xu` : 'Enter'}>
              ✓ {pending.kind === 'erase' ? `Dỡ · +${fmtXu(-cost)} Xu` : cost > 0 ? `Mua · ${fmtXu(cost)} Xu` : 'Xong'}
            </button>
            {pending.kind === 'item' && itemById.get(pending.item)!.turn !== 'none' && (
              <button type="button" className="desk-btn" onClick={decoRotate} title="Xoay (phím R)">↻</button>
            )}
            <button type="button" className="desk-btn" onClick={() => useDeco.getState().setPending(null)} title="Bỏ (Esc)">✕</button>
          </div>
        )}
        {!pending && !draft && sel && (
          <div className={`deco-btns${sel.startsWith('desk:') ? ' desk' : ''}`}>
            {sel.startsWith('desk:') ? (
              <>
                <span className="deco-name">Bàn làm việc</span>
                <button type="button" className="desk-btn" disabled={busy} onClick={() => void rotateSelected()} title="Xoay (phím R)">↻ Xoay</button>
                <button type="button" className="desk-btn" disabled={busy} onClick={() => startDesk(sel.slice(5))}>✥ Dời</button>
                <DeskItems slot={sel.slice(5)} />
              </>
            ) : selWall ? (
              <>
                <span className="deco-name">{selWall.name} · {selWall.cells.length} ô</span>
                {!sure
                  ? <button type="button" className="desk-btn" disabled={busy} onClick={() => setSure(true)}>Dỡ cả đoạn · +{fmtXu(selWall.back)} Xu</button>
                  : <button type="button" className="desk-btn danger" disabled={busy}
                    onClick={() => void run({ action: 'unwall', cells: selWall.cells }, `Đã dỡ vách · +${fmtXu(selWall.back)} Xu`, () => useDeco.getState().select(null))}>Chắc chưa? Dỡ</button>}
              </>
            ) : selItem && selDef ? (
              <>
                <span className="deco-name">{selDef.name}</span>
                {selDef.turn !== 'none' && <button type="button" className="desk-btn" disabled={busy} onClick={() => void rotateSelected()} title="Xoay (phím R)">↻</button>}
                <button type="button" className="desk-btn" disabled={busy} onClick={() => useDeco.getState().setDraft({ kind: 'move', uid: selItem.uid, item: selItem.item, rot: selItem.rot })}>✥ Dời</button>
                <button type="button" className="desk-btn" disabled={busy} onClick={() => void run({ action: 'store', uid: selItem.uid }, `Đã cất ${lowerName(selDef.name)} vào kho`, () => useDeco.getState().select(null))}>📦 Cất</button>
                {!sure
                  ? <button type="button" className="desk-btn" disabled={busy} onClick={() => setSure(true)}>Bán · +{fmtXu(resale(selDef.price))} Xu</button>
                  : <button type="button" className="desk-btn danger" disabled={busy} onClick={() => void run({ action: 'sell', uid: selItem.uid }, `Đã bán ${lowerName(selDef.name)} · +${fmtXu(resale(selDef.price))} Xu`, () => useDeco.getState().select(null))}>Chắc chưa? Bán</button>}
              </>
            ) : null}
          </div>
        )}
      </div>
    </>,
    stage.overlay,
  )
}

/**
 * Đồ để bàn của agent ngồi bàn đang chọn: món đã có (bấm để bán lại nửa giá), món đã mở khoá (bấm để mua),
 * món còn khoá (hiện cấp cần đạt). Agent nhận đồ mới thì vui ra mặt.
 */
function DeskItems({ slot }: { slot: string }) {
  const agents = useCoop((s) => s.agents)
  const office = useOffice((s) => s.office)
  const busy = useDeco((s) => s.busy)
  const balance = useBalance()
  const w = decoCtx.world
  const who = w ? [...w.seatOf].find(([, sl]) => sl.id === slot)?.[0] : undefined
  const agent = agents.find((a) => a.id === who)
  const level = useExp((s) => (who ? s.stats[who]?.level ?? 1 : 1))
  const [selling, setSelling] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  useEffect(() => { setSelling(null); setHover(null) }, [slot])
  if (!who || !agent) return <div className="desk-items"><span className="desk-items-head">Bàn trống: chưa có ai ngồi</span></div>
  const mine = new Set(office.deskItems[who] ?? [])
  const buy = (d: DeskItem) => void run({ action: 'deskBuy', agent: who, item: d.id }, `🎁 ${d.name} cho ${agent.name} · −${fmtXu(d.price)} Xu`, () => deskGift(who, lowerName(d.name)))
  const sell = (d: DeskItem) => void run({ action: 'deskSell', agent: who, item: d.id }, `Đã bán ${lowerName(d.name)} · +${fmtXu(resale(d.price))} Xu`, () => setSelling(null))
  // Dòng tên: món đang rê chuột (tên + giá / cấp cần), không thì tên agent và cấp
  const hd = DESK_ITEMS.find((d) => d.id === hover)
  const head = !hd ? <>Đồ để bàn của <b>{agent.name}</b> · cấp {level}</>
    : mine.has(hd.id) ? <><b>{hd.name}</b> · bấm để bán +{fmtXu(resale(hd.price))} Xu</>
      : level < hd.level ? <><b>{hd.name}</b> · mở ở cấp {hd.level}</>
        : <><b>{hd.name}</b> · {fmtXu(hd.price)} Xu{balance < hd.price ? ', chưa đủ' : ''}</>
  const icon = (d: DeskItem) => {
    const t = deskThumb(d.id)
    // Phóng 2 lần (ghế cao hơn: 1,5 lần cho vừa ô), giữ nét pixel
    const k = t && t.h > 16 ? 1.5 : 2
    return t ? <img className="desk-chip-img" src={t.url} alt="" draggable={false} style={{ width: t.w * k, height: t.h * k }} /> : <span>{d.icon}</span>
  }
  return (
    <div className="desk-items" onMouseLeave={() => setHover(null)}>
      <span className="desk-items-head">{head}</span>
      <div className="desk-items-row">
        {DESK_ITEMS.map((d) => {
          const on = { onMouseEnter: () => setHover(d.id), onFocus: () => setHover(d.id) }
          if (mine.has(d.id)) {
            return selling === d.id
              ? <button key={d.id} type="button" className="desk-btn danger" disabled={busy} onClick={() => sell(d)} {...on}>Bán · +{fmtXu(resale(d.price))}</button>
              : <button key={d.id} type="button" className="desk-chip own" disabled={busy} onClick={() => setSelling(d.id)} aria-label={`${d.name}: đã có`} {...on}>{icon(d)}<i className="desk-chip-tick">✓</i></button>
          }
          if (level < d.level) {
            return <span key={d.id} className="desk-chip locked" aria-label={`${d.name}: mở khoá ở cấp ${d.level}`} {...on}>{icon(d)}<i>🔒{d.level}</i></span>
          }
          const poor = balance < d.price
          return (
            <button key={d.id} type="button" className="desk-chip buy" disabled={busy || poor} onClick={() => buy(d)} aria-label={`Mua ${lowerName(d.name)}`} {...on}>
              {icon(d)}<i>🪙{fmtXu(d.price)}</i>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Đoạn vách đang chọn (`wall:c,r`): tên loại vách, các ô, Xu được trả lại khi dỡ */
function wallSel(o: OfficeState, sel: string) {
  const [c, r] = sel.slice(5).split(',').map(Number)
  const kind = o.walls[cellKey(c, r)]
  if (!kind) return null
  const cells = wallRun(o, c, r)
  return { name: WALLS.find((x) => x.kind === kind)!.name, cells, back: -costOf(o, { action: 'unwall', cells }) }
}

/** Khung (pixel gốc) của món / bàn / đoạn vách đang chọn */
function selRect(sel: string): Rect | null {
  const w = decoCtx.world, v = decoCtx.view
  if (sel.startsWith('wall:')) {
    const o = useOffice.getState().office
    const ws = wallSel(o, sel)
    return ws ? shownRect(o, ws.cells) : null
  }
  if (sel.startsWith('desk:')) {
    const sl = w?.slots.find((s) => s.id === sel.slice(5))
    if (!sl) return null
    const r = cellsRect(deskCells({ x: sl.seat.x, z: sl.seat.z, yaw: sl.yaw }))
    return { ...r, y: r.y - 10, h: r.h + 10 }
  }
  return v?.itemHits.get(sel) ?? null
}

function startDesk(slot: string) {
  const sl = decoCtx.world?.slots.find((s) => s.id === slot)
  if (sl) useDeco.getState().setDraft({ kind: 'desk', slot, yaw: sl.yaw })
}

/** Bóng mờ bàn + ghế khi dời bàn */
function drawDesk(g: Graphics, p: { x: number; z: number; yaw: number }, color: number) {
  const f = forward(p.yaw)
  const cx = p.x + f.x * 0.83, cz = p.z + f.z * 0.83
  const side = Math.abs(f.x) > 0.5
  const w = (side ? 0.75 : 1.4) * PPM, d = (side ? 1.4 : 0.75) * PPM
  const x = Math.round(px(cx) - w / 2), y = Math.round(py(cz) - d / 2)
  g.rect(x, y, w, d).fill({ color, alpha: 0.35 })
  g.rect(x, y, w, d).stroke({ color, width: 1, alignment: 1 })
  g.circle(Math.round(px(p.x)), Math.round(py(p.z)), 6).fill({ color, alpha: 0.35 })
  g.circle(Math.round(px(p.x)), Math.round(py(p.z)), 6).stroke({ color, width: 1 })
}

const pendingAction = (p: Pending): Action =>
  p.kind === 'item' ? { action: 'buy', item: p.item, c: p.c, r: p.r, rot: p.rot }
    : p.kind === 'wall' ? { action: 'wall', kind: p.wall, cells: p.cells }
      : { action: 'unwall', cells: p.cells }

/** Bấm ✓ (hoặc Enter): mua món / xây / dỡ vách. Mua xong vẫn cầm món đó để đặt tiếp (Esc để thôi). */
export async function confirmPending(p: Pending | null = useDeco.getState().pending) {
  if (!p) return
  const a = pendingAction(p)
  const name = p.kind === 'item' ? itemById.get(p.item)!.name : ''
  const cost = costOf(useOffice.getState().office, a)
  const msg = p.kind === 'item' ? `🛍️ Đã mua ${lowerName(name)} · −${fmtXu(cost)} Xu`
    : p.kind === 'wall' ? `🧱 Đã xây vách · −${fmtXu(cost)} Xu` : `Đã dỡ vách · +${fmtXu(-cost)} Xu`
  if (!(await run(a, msg))) return
  useDeco.getState().setPending(null)
  // Agent đứng gần quay ra khen món mới / hỏi vách mới
  const cells: Cell[] = p.kind === 'item' ? [[p.c, p.r]] : p.cells
  const [c, r] = cells[Math.floor(cells.length / 2)]
  if (p.kind !== 'erase') decorated(p.kind === 'item' ? lowerName(name) : null, cellX(c) + CELL / 2, p.kind === 'item' && itemById.get(p.item)!.mount === 'wall' ? -7 : cellZ(r) + CELL / 2)
}

