import { footprint, itemById, type Item } from '../data/catalog'
import { CELL, JOBS, cellX, cellZ, isClean, type OfficeState, type Placed } from '../data/officeState'
import { cellIndex, flood, snapFree, type Nav } from '../world/nav'
import { BOARD, OFFICE, SPAWN, WINDOWS, type Activity, type Vec2, type World } from '../world/layout'

/**
 * Những chỗ agent rảnh đi tới: cửa sổ, bảng ticket, góc tán gẫu, (khi văn phòng còn bẩn) chỗ bụi bẩn để đứng than thở,
 * và đồ đã mua ở cửa hàng: ngồi sofa / ghế bành, pha cà phê, mở tủ lạnh, chơi máy game, đánh bi-a, vuốt mèo...
 * Dựng lại khi bố cục hoặc chỗ đã dọn đổi. Bạn (người chơi) cũng dùng được các chỗ của đồ đã mua (phím E).
 */
export interface Spot extends Vec2 {
  id: string
  /** Hướng nhìn khi đứng / ngồi ở đây */
  yaw?: number
  act?: Activity
  /** Khu: agent ở cùng khu thì dễ bắt chuyện với nhau */
  area?: string
  /** Có thì agent ngồi ở đây; giá trị = độ cao mặt ghế so với ghế văn phòng (m) */
  sit?: number
  /** Chỗ ngồi trên đồ: đứng ở điểm này (phía trước đồ) rồi mới bước vào / bước ra */
  via?: Vec2
  /** Hệ số chọn (mặc định 1): đồ mới mua hấp dẫn hơn một chút */
  weight?: number
  /** Món đồ (uid) của chỗ này: bạn bấm E ở gần thì dùng được */
  item?: string
}

let list: Spot[] = []
const byId = new Map<string, Spot>()

export function setSpots(next: Spot[]) {
  list = next
  byId.clear()
  for (const s of next) byId.set(s.id, s)
}
export const allSpots = () => list
export const spotById = (id: string | null | undefined) => (id ? byId.get(id) : undefined)

const N = Math.PI
const E = Math.PI / 2

/** Hướng mặt của đồ theo rot (0 xuống, 1 trái, 2 lên, 3 phải): vector và yaw (forward = (sin yaw, cos yaw)) */
const FACE: { x: number; z: number; yaw: number }[] = [
  { x: 0, z: 1, yaw: 0 }, { x: -1, z: 0, yaw: -E }, { x: 0, z: -1, yaw: N }, { x: 1, z: 0, yaw: E },
]

/**
 * Đồ ngồi được: số chỗ, khoảng cách giữa các chỗ (m), việc làm khi ngồi.
 * `back`: bước vào từ phía sau (ghế họp kê sát bàn: phía trước là mặt bàn)
 * `sink`: lùi chỗ ngồi về phía lưng ghế bao nhiêu mét (hình ghế họp nằm sát mép dưới ô)
 */
const SEATS: Record<string, { n: number; gap: number; act: Activity; back?: boolean; sink?: number }> = {
  sofa: { n: 2, gap: 0.76, act: 'sofa' },
  armRed: { n: 1, gap: 0, act: 'sofa' },
  armBlue: { n: 1, gap: 0, act: 'sofa' },
  bench: { n: 2, gap: 0.5, act: 'stool' },
  stool: { n: 1, gap: 0, act: 'stool' },
  meetingChair: { n: 1, gap: 0, act: 'meeting', back: true, sink: 0.2 },
}

/** Đồ đứng dùng: đứng phía trước, nhìn vào đồ. `n` chỗ cạnh nhau, `dist` cách mép trước (m) */
const USES: Record<string, { act: Activity; n?: number; dist?: number }> = {
  coffeeBar: { act: 'coffee' }, waterCooler: { act: 'water' }, vending: { act: 'snack' },
  kitFridge: { act: 'fridge' }, fridge: { act: 'fridge' },
  kitCounter: { act: 'cook' }, kitSink: { act: 'cook' }, kitStove: { act: 'cook' },
  arcade1: { act: 'game' }, arcade2: { act: 'game' },
  bookshelf: { act: 'books' }, bookshelfWide: { act: 'books', n: 2 },
  whiteboard: { act: 'board' }, chalkboard: { act: 'board' },
  tvStand: { act: 'tv', n: 2, dist: 1.3 }, highTable: { act: 'snack', n: 2 },
}

/** Chỗ ngồi / chỗ dùng của một món đã đặt (toạ độ mét) */
function itemSpots(n: Nav, i: Item, p: Placed): Spot[] {
  const out: Spot[] = []
  const at = (q: Vec2) => snapFree(n, q)
  const { w, d } = footprint(i, p.rot)
  const cx = cellX(p.c) + (w * CELL) / 2, cz = cellZ(p.r) + (d * CELL) / 2
  // Đồ lật / không xoay: mặt trước luôn nhìn xuống (về camera)
  const f = i.turn === 'four' || i.turn === 'two' ? FACE[p.rot] ?? FACE[0] : FACE[0]
  const lat = { x: -f.z, z: f.x }
  const depth = (f.x ? w : d) * CELL
  const id = (k: number | string) => `${p.uid}:${k}`
  const area = `item-${p.uid}`
  const seat = SEATS[i.id]
  if (seat) {
    // Ngồi ở hàng ghế phía trước của món, nhìn theo hướng món; bước vào từ phía trước
    const fwd = depth / 2 - CELL / 2 - (seat.sink ?? 0)
    const row = { x: cx + f.x * fwd, z: cz + f.z * fwd }
    for (let k = 0; k < seat.n; k++) {
      const o = (k - (seat.n - 1) / 2) * seat.gap
      const s = { x: row.x + lat.x * o, z: row.z + lat.z * o }
      const out1 = (seat.back ? -1 : 1) * (CELL / 2 + 0.4)
      const via = at({ x: s.x + f.x * out1, z: s.z + f.z * out1 })
      out.push({ id: id(k), ...s, yaw: f.yaw, act: seat.act, area, sit: 0, via, weight: 1.6, item: p.uid })
    }
    return out
  }
  const use = USES[i.id]
  if (use) {
    // Đứng trước mặt đồ, quay mặt vào đồ
    const cnt = use.n ?? 1
    const span = (f.x ? d : w) * CELL
    const front = { x: cx + f.x * (depth / 2 + (use.dist ?? 0.4)), z: cz + f.z * (depth / 2 + (use.dist ?? 0.4)) }
    for (let k = 0; k < cnt; k++) {
      const o = cnt > 1 ? (k - (cnt - 1) / 2) * Math.min(0.8, span / cnt) : 0
      out.push({ id: id(k), ...at({ x: front.x + lat.x * o, z: front.z + lat.z * o }), yaw: f.yaw + N, act: use.act, area, weight: 1.4, item: p.uid })
    }
    return out
  }
  if (i.id === 'pingpong' || i.id === 'pool') {
    // Hai người hai đầu bàn (bóng bàn dọc: bắc / nam; bi-a ngang: tây / đông), cùng khu nên hay rủ nhau
    const act: Activity = i.id === 'pool' ? 'pool' : 'foos'
    const along = d > w ? { x: 0, z: 1 } : { x: 1, z: 0 }
    const half = ((d > w ? d : w) * CELL) / 2 + 0.26
    for (const sgn of [-1, 1]) {
      const q = at({ x: cx + along.x * half * sgn, z: cz + along.z * half * sgn })
      out.push({ id: id(sgn < 0 ? 'a' : 'b'), ...q, yaw: Math.atan2(cx - q.x, cz - q.z), act, area, weight: 1.6, item: p.uid })
    }
    return out
  }
  if (i.id === 'cat') {
    const q = at({ x: cx + 0.15, z: cz + d * CELL / 2 + 0.35 })
    out.push({ id: id(0), ...q, yaw: Math.atan2(cx - q.x, cz - q.z), act: 'pet', area, weight: 1.3, item: p.uid })
    return out
  }
  if (i.id === 'tvWall') {
    // TV treo tường bắc: đứng xem cách tường một đoạn
    for (const dx of [-0.45, 0.45]) out.push({ id: id(dx < 0 ? 'L' : 'R'), ...at({ x: cx + dx, z: BOARD.z + 1.6 }), yaw: N, act: 'tv', area, weight: 1.2, item: p.uid })
  }
  return out
}

/** Số giả ngẫu nhiên cố định theo chuỗi (chỗ đứng không nhảy lung tung mỗi lần dựng lại) */
function seeded(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

export function officeSpots(world: World, office: OfficeState): Spot[] {
  const n = world.nav
  const at = (p: Vec2) => snapFree(n, p)
  const out: Spot[] = []
  // Cửa sổ: đứng ngay dưới, nhìn ra ngoài (về phía bắc)
  WINDOWS.forEach((x, i) => out.push({ id: `win${i}`, ...at({ x, z: OFFICE.minZ + 0.75 }), yaw: N, act: 'window', area: 'window' }))
  // Bảng ticket
  for (const dx of [-0.8, 0.8]) out.push({ id: `kanban${dx < 0 ? 'L' : 'R'}`, ...at({ x: BOARD.x + dx, z: BOARD.z + 1.25 }), yaw: N, act: 'kanban', area: 'kanban' })
  // Bảng vinh danh (nếu đã mua): đứng xem xếp hạng
  for (const p of office.items) {
    const i = itemById.get(p.item)
    if (i?.id !== 'fame' || p.stored) continue
    const cx = cellX(p.c) + (i.w * CELL) / 2
    for (const dx of [-0.8, 0.8]) out.push({ id: `fame${dx < 0 ? 'L' : 'R'}`, ...at({ x: cx + dx, z: BOARD.z + 1.25 }), yaw: N, act: 'fame', area: 'fame' })
  }
  // Góc tán gẫu: hai chỗ đứng đối mặt, ở khoảng trống hai bên phòng
  ;[[-9.6, -3.6], [9.6, -3.6], [-9.6, 3.4], [9.6, 3.4]].forEach(([x, z], i) => {
    out.push({ id: `chat${i}a`, ...at({ x: x - 0.55, z }), yaw: E, act: 'chat', area: `chat${i}` })
    out.push({ id: `chat${i}b`, ...at({ x: x + 0.55, z }), yaw: -E, act: 'chat', area: `chat${i}` })
  })
  // Đồ đã mua: chỗ ngồi / chỗ dùng (bỏ chỗ không đi tới được, vd bị vách quây kín)
  const reach = flood(n, SPAWN)
  const ok = (p: Vec2) => reach[cellIndex(n, snapFree(n, p))] === 1
  for (const p of office.items) {
    const i = itemById.get(p.item)
    if (!i || p.stored) continue
    for (const sp of itemSpots(n, i, p)) if (ok(sp.via ?? sp)) out.push(sp)
  }
  // Mảng sàn còn bẩn: một chỗ đứng nhìn xuống sàn
  for (const j of JOBS) {
    if (j.kind !== 'floor' || !j.rect || isClean(office, j.id)) continue
    const r = seeded(j.id)
    const p = at({ x: j.rect.minX + 1 + r() * (j.rect.maxX - j.rect.minX - 2), z: j.rect.minZ + 1 + r() * (j.rect.maxZ - j.rect.minZ - 2) })
    out.push({ id: `dust-${j.id}`, ...p, yaw: r() * Math.PI * 2, act: 'dust', area: `dust-${j.id}` })
  }
  return out
}
