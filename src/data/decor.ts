import { deskItemById, footprint, itemById, resale, wallPrice, type Item, type WallKind } from './catalog'
import {
  COLS, ROWS, CELL, cellKey, cellX, cellZ, colOf, isClean, jobById, patchAt, rowOf,
  type DeskPos, type OfficeState, type Placed, type Spend,
} from './officeState'
import { BLOCKS, BOARD, DESK_D, DESK_W, DOOR_X, LOBBY, OFFICE, SPAWN, WINDOWS, deskCenter, turned } from '../world/room'

/**
 * Luật trang trí văn phòng, dùng chung cho server (kiểm trước khi trừ Xu) và trang (khung xanh / đỏ khi đặt thử):
 * đặt đồ ở đâu được, xây / dỡ vách, dời bàn, mua / cất / bán. Không phụ thuộc React hay PixiJS.
 *
 * - Đồ đặt trên sàn đã dọn; đồ treo tường cần tường bắc đã dọn, không đè cửa sổ, bảng ticket hay món khác.
 * - Cửa vào và sảnh chờ ứng viên luôn để trống.
 * - Thảm nằm dưới đồ: đồ khác đặt lên thảm được, nhưng thảm không chồng thảm.
 * - Cửa kính lắp vào 2 ô vách liền nhau.
 * Server không biết bàn của agent nằm đâu (bàn xếp theo sơ đồ tổ chức ở trang), nên trang kiểm thêm phần đó
 * (tham số `blocked`) và kiểm lối đi tới mọi bàn không bị chặn kín (src/world/layout.ts).
 */

export type Cell = [number, number]

interface Zone { c0: number; r0: number; c1: number; r1: number }
const zone = (minX: number, maxX: number, minZ: number, maxZ: number): Zone =>
  ({ c0: colOf(minX), r0: rowOf(minZ), c1: colOf(maxX - 1e-6), r1: rowOf(maxZ - 1e-6) })

/** Chỗ luôn để trống: lối vào ở giữa tường nam, sảnh chờ ứng viên, chỗ bạn xuất hiện */
export const RESERVED: Zone[] = [
  zone(DOOR_X - 1.5, DOOR_X + 1.5, SPAWN.z - 0.7, OFFICE.maxZ),
  zone(Math.min(...LOBBY.map((p) => p.x)) - 0.5, Math.max(...LOBBY.map((p) => p.x)) + 0.5, Math.min(...LOBBY.map((p) => p.z)) - 0.5, OFFICE.maxZ),
]
export const reserved = (c: number, r: number) => RESERVED.some((z) => c >= z.c0 && c <= z.c1 && r >= z.r0 && r <= z.r1)

/** Ô chạm vùng chặn cố định của bản đồ (layer Collision trong maps/office.tmj) */
export const fixedBlock = (c: number, r: number) => {
  const x0 = cellX(c), z0 = cellZ(r), e = 1e-6
  return BLOCKS.some((b) => x0 + CELL > b.minX + e && x0 < b.maxX - e && z0 + CELL > b.minZ + e && z0 < b.maxZ - e)
}

const inGrid = (c: number, r: number) => c >= 0 && r >= 0 && c < COLS && r < ROWS

/** Mảng sàn chứa ô đã dọn chưa */
const cleanCell = (o: OfficeState, c: number, r: number) => {
  const p = patchAt(cellX(c) + CELL / 2, cellZ(r) + CELL / 2)
  return !!p && isClean(o, p.id)
}

/** Các ô một món chiếm (đồ trên sàn, thảm, cửa) */
export function cellsOf(i: Item, c: number, r: number, rot: number): Cell[] {
  if (i.mount === 'door') return rot === 1 ? [[c, r], [c, r + 1]] : [[c, r], [c + 1, r]]
  const { w, d } = footprint(i, rot)
  const out: Cell[] = []
  for (let dr = 0; dr < d; dr++) for (let dc = 0; dc < w; dc++) out.push([c + dc, r + dr])
  return out
}

// ───────────────────────── Tường bắc ─────────────────────────

/** Cột tường bắc bị cửa sổ / bảng ticket chiếm (cửa sổ LimeZu rộng 25 px ≈ 0,8 m) */
export const FIXED_WALL_COLS: Set<number> = (() => {
  const s = new Set<number>()
  const add = (x0: number, x1: number) => { for (let c = colOf(x0); c <= colOf(x1 - 1e-6); c++) s.add(c) }
  for (const x of WINDOWS) add(x - 0.4, x + 0.4)
  add(BOARD.x - BOARD.w / 2, BOARD.x + BOARD.w / 2)
  return s
})()

export const wallItemCols = (i: Item, c: number) => Array.from({ length: i.w }, (_, k) => c + k)

// ───────────────────────── Ai đang chiếm ô nào ─────────────────────────

export interface Occupancy {
  /** ô → uid đồ đứng trên sàn */
  floor: Map<string, string>
  /** ô → uid thảm */
  rug: Map<string, string>
  /** ô → uid cửa */
  door: Map<string, string>
  /** cột tường bắc → uid đồ treo */
  wall: Map<number, string>
}

export function occupancy(o: OfficeState, ignore?: string): Occupancy {
  const occ: Occupancy = { floor: new Map(), rug: new Map(), door: new Map(), wall: new Map() }
  for (const p of o.items) {
    if (p.stored || p.uid === ignore) continue
    const i = itemById.get(p.item)
    if (!i) continue
    if (i.mount === 'wall') { for (const c of wallItemCols(i, p.c)) occ.wall.set(c, p.uid); continue }
    const m = i.mount === 'rug' ? occ.rug : i.mount === 'door' ? occ.door : occ.floor
    for (const [c, r] of cellsOf(i, p.c, p.r, p.rot)) m.set(cellKey(c, r), p.uid)
  }
  return occ
}

export interface Check { ok: boolean; why?: string }
const ok: Check = { ok: true }
const no = (why: string): Check => ({ ok: false, why })

export interface PlaceOpts {
  /** Món đang dời (không tính chỗ cũ của chính nó) */
  ignore?: string
  /** Ô bị chiếm bởi thứ server không biết (bàn của agent) */
  blocked?: (c: number, r: number) => boolean
  /** Cấp hiện tại của agent (đồ để bàn mở khoá theo cấp). Không có thì không cho mua đồ để bàn */
  levelOf?: (agentId: string) => number
}

/** Cửa lắp theo hướng nào ở ô (c, r): 0 = vách ngang, 1 = vách dọc, null = không có 2 ô vách liền nhau */
export function doorRot(o: OfficeState, c: number, r: number): 0 | 1 | null {
  const w = (cc: number, rr: number) => !!o.walls[cellKey(cc, rr)]
  if (w(c, r) && w(c + 1, r)) return 0
  if (w(c, r) && w(c, r + 1)) return 1
  return null
}

/** Đặt món `i` ở ô (c, r), hướng `rot` được không */
export function canPlace(o: OfficeState, i: Item, c: number, r: number, rot: number, opts: PlaceOpts = {}): Check {
  const occ = occupancy(o, opts.ignore)
  if (i.mount === 'wall') {
    const cols = wallItemCols(i, c)
    if (cols[0] < 0 || cols[cols.length - 1] >= COLS) return no('Ra ngoài tường')
    if (!isClean(o, 'wall')) return no('Dọn tường bắc trước đã')
    if (cols.some((k) => FIXED_WALL_COLS.has(k))) return no('Vướng cửa sổ hoặc bảng ticket')
    if (cols.some((k) => occ.wall.has(k))) return no('Vướng đồ treo khác')
    if (i.id === 'fame' && o.items.some((p) => p.item === 'fame' && p.uid !== opts.ignore && !p.stored)) return no('Chỉ treo một bảng vinh danh')
    return ok
  }
  const cells = cellsOf(i, c, r, rot)
  if (cells.some(([cc, rr]) => !inGrid(cc, rr))) return no('Ra ngoài phòng')
  if (i.mount === 'door') {
    if (doorRot(o, c, r) !== rot) return no('Cửa phải lắp vào 2 ô vách liền nhau')
    if (cells.some(([cc, rr]) => occ.door.has(cellKey(cc, rr)))) return no('Đã có cửa ở đây')
    return ok
  }
  if (cells.some(([cc, rr]) => reserved(cc, rr))) return no('Để trống lối vào và sảnh chờ')
  if (cells.some(([cc, rr]) => fixedBlock(cc, rr))) return no('Vướng chỗ cố định của văn phòng')
  if (cells.some(([cc, rr]) => !cleanCell(o, cc, rr))) return no('Dọn sàn chỗ này trước đã')
  if (cells.some(([cc, rr]) => o.walls[cellKey(cc, rr)])) return no('Vướng vách')
  const mine = i.mount === 'rug' ? occ.rug : occ.floor
  if (cells.some(([cc, rr]) => mine.has(cellKey(cc, rr)))) return no(i.mount === 'rug' ? 'Thảm không chồng lên thảm' : 'Vướng đồ khác')
  if (i.mount === 'floor' && opts.blocked && cells.some(([cc, rr]) => opts.blocked!(cc, rr))) return no('Vướng bàn làm việc')
  return ok
}

/** Xây vách ở các ô (bỏ qua ô đã có vách cùng loại) */
export function canWall(o: OfficeState, cells: Cell[], kind: WallKind, opts: PlaceOpts = {}): Check {
  if (!cells.length) return no('Chưa chọn ô nào')
  const occ = occupancy(o)
  for (const [c, r] of cells) {
    const k = cellKey(c, r)
    if (!inGrid(c, r)) return no('Ra ngoài phòng')
    if (reserved(c, r)) return no('Để trống lối vào và sảnh chờ')
    if (fixedBlock(c, r)) return no('Vướng chỗ cố định của văn phòng')
    if (!cleanCell(o, c, r)) return no('Dọn sàn chỗ này trước đã')
    if (o.walls[k] && o.walls[k] !== kind) return no('Đã có vách loại khác: dỡ ra trước')
    if (occ.floor.has(k) || occ.rug.has(k)) return no('Vướng đồ: dời đi trước')
    if (opts.blocked?.(c, r)) return no('Vướng bàn làm việc')
  }
  return ok
}

export function canUnwall(o: OfficeState, cells: Cell[]): Check {
  const occ = occupancy(o)
  if (!cells.some(([c, r]) => o.walls[cellKey(c, r)])) return no('Không có vách nào ở đây')
  if (cells.some(([c, r]) => occ.door.has(cellKey(c, r)))) return no('Cất cửa trên vách này trước đã')
  return ok
}

/** Các ô một bàn làm việc (kể cả ghế) chiếm */
export function deskCells(p: DeskPos): Cell[] {
  const c = deskCenter({ id: '', zone: 'open', seat: { x: p.x, z: p.z }, yaw: p.yaw })
  const [w, d] = turned(p.yaw) ? [DESK_D, DESK_W] : [DESK_W, DESK_D]
  const minX = Math.min(c.x - w / 2, p.x - 0.25), maxX = Math.max(c.x + w / 2, p.x + 0.25)
  const minZ = Math.min(c.z - d / 2, p.z - 0.25), maxZ = Math.max(c.z + d / 2, p.z + 0.25)
  const out: Cell[] = []
  for (let r = rowOf(minZ + 0.02); r <= rowOf(maxZ - 0.02); r++) for (let cc = colOf(minX + 0.02); cc <= colOf(maxX - 0.02); cc++) out.push([cc, r])
  return out
}

export function canDesk(o: OfficeState, p: DeskPos, opts: PlaceOpts = {}): Check {
  const occ = occupancy(o)
  for (const [c, r] of deskCells(p)) {
    const k = cellKey(c, r)
    if (!inGrid(c, r)) return no('Ra ngoài phòng')
    if (reserved(c, r)) return no('Để trống lối vào và sảnh chờ')
    if (fixedBlock(c, r)) return no('Vướng chỗ cố định của văn phòng')
    if (o.walls[k] || occ.floor.has(k)) return no('Vướng đồ hoặc vách')
    if (opts.blocked?.(c, r)) return no('Vướng bàn khác')
  }
  return ok
}

// ───────────────────────── Lệnh ─────────────────────────

export type Action =
  | { action: 'clean'; job: string }
  | { action: 'buy'; item: string; c: number; r: number; rot: number }
  /** Dời một món đang đặt, hoặc lấy từ kho ra đặt (miễn phí) */
  | { action: 'place'; uid: string; c: number; r: number; rot: number }
  | { action: 'store'; uid: string }
  | { action: 'sell'; uid: string }
  | { action: 'wall'; kind: WallKind; cells: Cell[] }
  | { action: 'unwall'; cells: Cell[] }
  | { action: 'desk'; slot: string; x: number; z: number; yaw: number }
  /** Đồ để bàn của một agent: mua (cần đủ cấp) / bán lại nửa giá */
  | { action: 'deskBuy' | 'deskSell'; agent: string; item: string }

export type Result = { office: OfficeState } | { error: string; status: number }

const int = (v: unknown) => typeof v === 'number' && Number.isInteger(v)
const MAX_CELLS = 200
const YAWS = [0, Math.PI, Math.PI / 2, -Math.PI / 2]

/** Kiểm dạng lệnh gửi lên (server nhận JSON bất kỳ) */
export function parseAction(v: unknown): Action | null {
  if (!v || typeof v !== 'object') return null
  const a = v as Record<string, unknown>
  const cells = (x: unknown): Cell[] | null =>
    Array.isArray(x) && x.length <= MAX_CELLS && x.every((p) => Array.isArray(p) && p.length === 2 && int(p[0]) && int(p[1])) ? (x as Cell[]) : null
  switch (a.action) {
    case 'clean': return typeof a.job === 'string' ? { action: 'clean', job: a.job } : null
    case 'buy': return typeof a.item === 'string' && int(a.c) && int(a.r) && int(a.rot) ? { action: 'buy', item: a.item, c: a.c as number, r: a.r as number, rot: a.rot as number } : null
    case 'place': return typeof a.uid === 'string' && int(a.c) && int(a.r) && int(a.rot) ? { action: 'place', uid: a.uid, c: a.c as number, r: a.r as number, rot: a.rot as number } : null
    case 'store': case 'sell': return typeof a.uid === 'string' ? { action: a.action, uid: a.uid } : null
    case 'wall': {
      const cs = cells(a.cells)
      return cs && (a.kind === 'low' || a.kind === 'glass' || a.kind === 'tall') ? { action: 'wall', kind: a.kind, cells: cs } : null
    }
    case 'unwall': { const cs = cells(a.cells); return cs ? { action: 'unwall', cells: cs } : null }
    case 'desk':
      return typeof a.slot === 'string' && a.slot.length < 40 && typeof a.x === 'number' && typeof a.z === 'number' && typeof a.yaw === 'number'
        && Number.isFinite(a.x) && Number.isFinite(a.z) && YAWS.some((y) => Math.abs(y - (a.yaw as number)) < 1e-3)
        ? { action: 'desk', slot: a.slot, x: a.x, z: a.z, yaw: a.yaw } : null
    case 'deskBuy': case 'deskSell':
      return typeof a.agent === 'string' && a.agent.length > 0 && a.agent.length < 80 && typeof a.item === 'string'
        ? { action: a.action, agent: a.agent, item: a.item } : null
    default: return null
  }
}

/** Giá của một lệnh (âm = được trả lại Xu) */
export function costOf(o: OfficeState, a: Action): number {
  switch (a.action) {
    case 'clean': return isClean(o, a.job) ? 0 : jobById.get(a.job)?.price ?? 0
    case 'buy': return itemById.get(a.item)?.price ?? 0
    case 'sell': {
      const p = o.items.find((x) => x.uid === a.uid)
      return -resale(itemById.get(p?.item ?? '')?.price ?? 0)
    }
    case 'wall': return newWallCells(o, a.cells).length * wallPrice(a.kind)
    case 'unwall': return -a.cells.reduce((s, [c, r]) => { const k = o.walls[cellKey(c, r)]; return s + (k ? resale(wallPrice(k)) : 0) }, 0)
    case 'deskBuy': return hasDeskItem(o, a.agent, a.item) ? 0 : deskItemById.get(a.item)?.price ?? 0
    case 'deskSell': return hasDeskItem(o, a.agent, a.item) ? -resale(deskItemById.get(a.item)?.price ?? 0) : 0
    default: return 0
  }
}

export const hasDeskItem = (o: OfficeState, agent: string, item: string) => !!o.deskItems[agent]?.includes(item)

const uniq = (cells: Cell[]) => [...new Map(cells.map((p) => [cellKey(p[0], p[1]), p])).values()]
const newWallCells = (o: OfficeState, cells: Cell[]) => uniq(cells).filter(([c, r]) => !o.walls[cellKey(c, r)])

/**
 * Làm một lệnh. `have` = Xu còn trong quỹ (tính từ sổ EXP), `uid` tạo id mới.
 * Trả trạng thái mới, hoặc lỗi kèm mã HTTP (400 sai lệnh, 409 chưa đủ Xu / không đặt được).
 */
export function apply(o: OfficeState, a: Action, have: number, now: number, uid: () => string, opts: PlaceOpts = {}): Result {
  const err = (error: string, status = 409): Result => ({ error, status })
  const pay = (kind: Spend['kind'], ref: string, xu: number): Spend[] => [...o.spent, { id: uid(), at: now, kind, ref, xu }]
  const price = costOf(o, a)
  if (price > 0 && have < price) return err(`Chưa đủ Xu: cần ${price}, quỹ còn ${have}`)

  switch (a.action) {
    case 'clean': {
      const job = jobById.get(a.job)
      if (!job) return err('Không có việc dọn này', 400)
      if (isClean(o, job.id)) return { office: o }
      return { office: { ...o, cleaned: { ...o.cleaned, [job.id]: now }, spent: pay('clean', job.id, job.price) } }
    }
    case 'buy': {
      const i = itemById.get(a.item)
      if (!i) return err('Không có món này', 400)
      const chk = canPlace(o, i, a.c, a.r, a.rot, opts)
      if (!chk.ok) return err(chk.why!)
      const p: Placed = { uid: uid(), item: i.id, c: a.c, r: a.r, rot: a.rot, at: now }
      return { office: { ...o, items: [...o.items, p], spent: pay('buy', i.id, i.price) } }
    }
    case 'place': {
      const p = o.items.find((x) => x.uid === a.uid)
      const i = p && itemById.get(p.item)
      if (!p || !i) return err('Không có món này', 400)
      const chk = canPlace(o, i, a.c, a.r, a.rot, { ...opts, ignore: p.uid })
      if (!chk.ok) return err(chk.why!)
      return { office: { ...o, items: o.items.map((x) => (x === p ? { ...x, c: a.c, r: a.r, rot: a.rot, stored: undefined } : x)) } }
    }
    case 'store': {
      const p = o.items.find((x) => x.uid === a.uid)
      if (!p) return err('Không có món này', 400)
      return { office: { ...o, items: o.items.map((x) => (x === p ? { ...x, stored: true } : x)) } }
    }
    case 'sell': {
      const p = o.items.find((x) => x.uid === a.uid)
      if (!p) return err('Không có món này', 400)
      return { office: { ...o, items: o.items.filter((x) => x !== p), spent: pay('sell', p.item, price) } }
    }
    case 'wall': {
      const chk = canWall(o, a.cells, a.kind, opts)
      if (!chk.ok) return err(chk.why!)
      const add = newWallCells(o, a.cells)
      if (!add.length) return { office: o }
      const walls = { ...o.walls }
      for (const [c, r] of add) walls[cellKey(c, r)] = a.kind
      return { office: { ...o, walls, spent: pay('wall', a.kind, price) } }
    }
    case 'unwall': {
      const chk = canUnwall(o, a.cells)
      if (!chk.ok) return err(chk.why!)
      const walls = { ...o.walls }
      for (const [c, r] of a.cells) delete walls[cellKey(c, r)]
      return { office: { ...o, walls, spent: pay('unwall', 'wall', price) } }
    }
    case 'desk': {
      const p: DeskPos = { x: a.x, z: a.z, yaw: a.yaw }
      const chk = canDesk(o, p, opts)
      if (!chk.ok) return err(chk.why!)
      return { office: { ...o, desks: { ...o.desks, [a.slot]: p } } }
    }
    case 'deskBuy': {
      const d = deskItemById.get(a.item)
      if (!d) return err('Không có món này', 400)
      if (hasDeskItem(o, a.agent, d.id)) return { office: o }
      const lv = opts.levelOf?.(a.agent) ?? 0
      if (lv < d.level) return err(`${d.name} mở khoá ở cấp ${d.level}`)
      const mine = [...(o.deskItems[a.agent] ?? []), d.id]
      return { office: { ...o, deskItems: { ...o.deskItems, [a.agent]: mine }, spent: pay('deskBuy', `${a.agent}:${d.id}`, d.price) } }
    }
    case 'deskSell': {
      if (!hasDeskItem(o, a.agent, a.item)) return err('Bàn này không có món đó', 400)
      const left = o.deskItems[a.agent].filter((x) => x !== a.item)
      const deskItems = { ...o.deskItems }
      if (left.length) deskItems[a.agent] = left
      else delete deskItems[a.agent]
      return { office: { ...o, deskItems, spent: pay('deskSell', `${a.agent}:${a.item}`, price) } }
    }
  }
}
