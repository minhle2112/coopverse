import type { Agent } from '../data/types'
import { buildNav, type Nav } from './nav'

/*
 * Sơ đồ văn phòng (nhìn từ trên, bắc = -z): một phòng lớn trống, chưa có vách ngăn.
 * Lúc đầu chỉ có bàn làm việc của agent (xếp thành cụm 4 chỗ), bảng ticket và cửa sổ trên tường bắc, cửa vào ở tường nam.
 * Phòng phủ bụi; bạn trả Xu để dọn (src/data/officeState.ts), rồi (đợt sau) mua đồ, xây vách.
 *
 *   x: -13.5 ................ 0 ................ 13.5
 *   z=-8  ┌──── cửa sổ ─ bảng ─── cửa sổ ─ cửa sổ ───── cửa sổ ┐
 *         │                                                   │
 *         │          (cụm bàn)            (cụm bàn)           │
 *   z=7   └────────────────────── cửa vào ────────────────────┘
 */

export interface Vec2 { x: number; z: number }

/** Hộp va chạm theo trục. h = chiều cao; cam = chặn camera (tường đặc). */
export interface AABB { minX: number; maxX: number; minZ: number; maxZ: number; h: number; cam?: boolean }

export interface DeskSlot {
  id: string
  /** side = bàn phụ của agent con, nối dài dãy bàn của agent cha */
  zone: 'open' | 'side'
  seat: Vec2
  /** Hướng agent nhìn khi ngồi (bàn nằm phía trước). forward = (sin yaw, cos yaw) */
  yaw: number
}

/** Việc agent làm khi dừng ở một chỗ (quyết định dáng, đồ cầm tay, câu nói) */
export type Activity =
  | 'coffee' | 'fridge' | 'water' | 'window' | 'tv' | 'foos' | 'books' | 'sofa' | 'beanbag' | 'stool' | 'meeting' | 'kanban' | 'fame'
  // Phòng trống: đứng tán gẫu, đứng nhìn chỗ bụi bẩn
  | 'chat' | 'dust'

/** 27 × 15 m */
export const OFFICE = { minX: -13.5, maxX: 13.5, minZ: -8, maxZ: 7, wallH: 3.2, wallT: 0.3 }
export const SPAWN: Vec2 = { x: 0, z: 5.2 }

/** Sảnh chờ bên phải cửa vào: ứng viên đứng chờ bạn duyệt hồ sơ, mặt nhìn vào văn phòng. */
export const LOBBY: (Vec2 & { yaw: number })[] = [
  { x: 3.0, z: 5.7, yaw: Math.PI - 0.2 },
  { x: 5.2, z: 5.7, yaw: Math.PI + 0.25 },
  { x: 3.1, z: 4.85, yaw: Math.PI - 0.2 },
  { x: 5.1, z: 4.85, yaw: Math.PI + 0.25 },
]

/**
 * Bảng ticket treo ở tường bắc (mặt bảng nhìn về hướng nam, +z).
 * Bản pixel nhìn từ trên xuống nghiêng về phía bắc: chỉ thấy được mặt tường bắc.
 */
export const BOARD = { x: -4.6, y: 1.55, z: OFFICE.minZ + OFFICE.wallT / 2 + 0.04, w: 3.0, h: 1.6 }

/** Cửa sổ trên tường bắc (toạ độ x tâm, mét) */
export const WINDOWS = [-10.5, -1.5, 1.5, 10.5]

/** Khoảng cách từ ghế tới tâm bàn */
export const SEAT_TO_DESK = 0.83
export const DESK_W = 1.4
export const DESK_D = 0.75

export const forward = (yaw: number): Vec2 => ({ x: Math.sin(yaw), z: Math.cos(yaw) })

export function box(cx: number, cz: number, w: number, d: number, h: number, cam = false): AABB {
  return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h, cam }
}

const turned = (yaw = 0) => Math.abs(Math.sin(yaw)) > 0.5

// ───────────────────────── Đồ đạc ─────────────────────────

/** Các loại đồ LimeZu đã vẽ được (src/pixel/office.ts). Phòng trống chỉ có cửa vào; đồ khác mua ở cửa hàng (đợt sau). */
export type FurnitureKind =
  | 'plant' | 'plantSmall' | 'bookshelf' | 'sofa' | 'coffeeTable' | 'foosball' | 'counter'
  | 'coffeeMachine' | 'fridge' | 'highTable' | 'stool' | 'meetingTable' | 'meetingChair'
  | 'tv' | 'waterCooler' | 'beanbag' | 'rug' | 'door' | 'cabinet' | 'whiteboard'
  | 'kitchen' | 'tvStand' | 'sofaBack' | 'floorLamp' | 'chalkboard' | 'bench' | 'bookshelfWide' | 'fruitBowl' | 'arcade' | 'printer'

export interface Furniture { kind: FurnitureKind; x: number; z: number; yaw?: number; w?: number; d?: number; color?: string }

/** [rộng, sâu, cao] để va chạm; null = không chặn đường */
const SIZE: Record<FurnitureKind, [number, number, number] | null> = {
  plant: [0.55, 0.55, 1.4],
  plantSmall: [0.4, 0.4, 0.8],
  bookshelf: [1.6, 0.4, 2.0],
  sofa: [2.4, 0.9, 0.8],
  coffeeTable: [1.2, 0.6, 0.4],
  foosball: [1.05, 1.6, 0.9],
  counter: [1, 1, 0.95],
  coffeeMachine: null,
  fridge: [0.8, 0.75, 1.9],
  highTable: [0.9, 0.9, 1.05],
  stool: null,
  meetingTable: [3.2, 1.4, 0.75],
  meetingChair: null,
  tv: null,
  waterCooler: [0.4, 0.4, 1.2],
  beanbag: [0.8, 0.8, 0.5],
  rug: null,
  door: null,
  cabinet: [0.85, 0.5, 1.0],
  whiteboard: [0.95, 0.3, 1.6],
  kitchen: [3.4, 0.7, 0.95],
  tvStand: [2.0, 0.55, 1.0],
  sofaBack: [1.5, 0.8, 0.8],
  floorLamp: [0.4, 0.4, 1.6],
  chalkboard: [1.0, 0.3, 1.6],
  bench: [0.95, 0.45, 0.5],
  bookshelfWide: [1.5, 0.4, 2.0],
  fruitBowl: null,
  arcade: [0.5, 0.5, 1.6],
  printer: null,
}

/** Đồ có sẵn từ đầu: chỉ cửa vào */
export const FURNITURE: Furniture[] = [{ kind: 'door', x: 0, z: 6.85 }]

// ───────────────────────── Chỗ ngồi ─────────────────────────

// Thứ tự lấp: hàng gần bảng (tường bắc) trước, rồi hàng gần cửa vào
const PODS: Vec2[] = [
  { x: -3.5, z: -3.5 }, { x: 3.5, z: -3.5 },
  { x: -3.5, z: 1.5 }, { x: 3.5, z: 1.5 },
]

const podRows = [
  { dz: -1.2, yaw: 0 },
  { dz: 1.2, yaw: Math.PI },
]

function podSlots(p: Vec2, pi: number): DeskSlot[] {
  return podRows.flatMap((r, ri) =>
    [-0.7, 0.7].map((dx, ci): DeskSlot => ({ id: `pod${pi}-${ri}${ci}`, zone: 'open', seat: { x: p.x + dx, z: p.z + r.dz }, yaw: r.yaw })),
  )
}

/** Bàn phụ ở hai đầu dãy bàn (mỗi cụm 4 chỗ: trái/phải × hai hàng) */
const SIDE_DX = 2.1
function sideSlot(p: Vec2, pi: number, ri: number, side: -1 | 1): DeskSlot {
  const r = podRows[ri]
  return { id: `side${pi}-${ri}${side < 0 ? 'L' : 'R'}`, zone: 'side', seat: { x: p.x + side * SIDE_DX, z: p.z + r.dz }, yaw: r.yaw }
}

export interface World {
  /** Bàn được vẽ (kể cả bàn trống) */
  slots: DeskSlot[]
  /** agentId → chỗ ngồi */
  seatOf: Map<string, DeskSlot>
  colliders: AABB[]
  pods: Vec2[]
  /** Lưới tìm đường cho agent */
  nav: Nav
}

/**
 * Xếp chỗ theo sơ đồ tổ chức (duyệt cây reportsTo): mỗi agent một bàn miễn phí trong các cụm bàn,
 * Lead ngồi trước, thành viên theo nhóm của Lead.
 * Agent con (báo cáo cho một thành viên) ngồi bàn phụ ngay cạnh bàn agent cha; cha giữ nguyên chỗ.
 * Ứng viên chưa được duyệt không có bàn (đứng ở sảnh).
 */
export function buildWorld(all: Agent[]): World {
  const agents = all.filter((a) => !a.candidate)
  const children = new Map<string | null, Agent[]>()
  for (const a of agents) {
    const k = agents.some((b) => b.id === a.reportsTo) ? a.reportsTo : null
    children.set(k, [...(children.get(k) ?? []), a])
  }
  const parentOf = new Map(agents.map((a) => [a.id, agents.find((b) => b.id === a.reportsTo)]))
  const roots = children.get(null) ?? []
  const ordered: Agent[] = []
  const visit = (a: Agent) => { ordered.push(a); (children.get(a.id) ?? []).forEach(visit) }
  roots.forEach(visit)

  const seatOf = new Map<string, DeskSlot>()
  // Agent con = cha của nó cũng báo cáo cho người khác
  const isSub = (a: Agent) => !!parentOf.get(a.id) && !!parentOf.get(parentOf.get(a.id)!.id)
  const subs = ordered.filter(isSub)
  const openAgents = ordered.filter((a) => !isSub(a))

  const podCount = Math.min(PODS.length, Math.max(1, Math.ceil(openAgents.length / 4)))
  const pods = PODS.slice(0, podCount)
  const openSlots = pods.flatMap(podSlots)
  openAgents.slice(0, openSlots.length).forEach((a, i) => seatOf.set(a.id, openSlots[i]))

  // Bàn phụ: ưu tiên cùng phía với ghế cha, cùng hàng trước rồi hàng đối diện
  const sideSlots: DeskSlot[] = []
  const taken = new Set<string>()
  const homeless: Agent[] = []
  for (const a of subs) {
    const ps = seatOf.get(parentOf.get(a.id)!.id)
    const m = ps && /^pod(\d+)-(\d)(\d)$/.exec(ps.id)
    if (!m) { homeless.push(a); continue }
    const pi = +m[1], ri = +m[2], side: -1 | 1 = m[3] === '0' ? -1 : 1
    const order: [number, -1 | 1][] = [[ri, side], [1 - ri, side], [ri, -side as -1 | 1], [1 - ri, -side as -1 | 1]]
    const pick = order.map(([r, sd]) => sideSlot(pods[pi], pi, r, sd)).find((s) => !taken.has(s.id))
    if (!pick) { homeless.push(a); continue }
    taken.add(pick.id)
    sideSlots.push(pick)
    seatOf.set(a.id, pick)
  }
  // Hết bàn phụ: ngồi chỗ trống ở cụm bàn như thành viên thường
  const used = new Set(seatOf.values())
  const free = openSlots.filter((s) => !used.has(s))
  homeless.slice(0, free.length).forEach((a, i) => seatOf.set(a.id, free[i]))

  const slots = [...openSlots, ...sideSlots]
  const colliders = buildColliders(slots)
  return { slots, seatOf, colliders, pods, nav: buildNav(OFFICE, colliders) }
}

export function deskCenter(s: DeskSlot): Vec2 {
  const f = forward(s.yaw)
  return { x: s.seat.x + f.x * SEAT_TO_DESK, z: s.seat.z + f.z * SEAT_TO_DESK }
}

function buildColliders(slots: DeskSlot[]): AABB[] {
  const { minX, maxX, minZ, maxZ, wallH, wallT } = OFFICE
  const w = maxX - minX, d = maxZ - minZ
  const out: AABB[] = [
    box(0, minZ, w + wallT, wallT, wallH, true),
    box(0, maxZ, w + wallT, wallT, wallH, true),
    box(minX, 0, wallT, d + wallT, wallH, true),
    box(maxX, 0, wallT, d + wallT, wallH, true),
  ]
  for (const f of FURNITURE) {
    const s = SIZE[f.kind]
    if (!s) continue
    let fw = f.w ?? s[0], fd = f.d ?? s[1]
    if (turned(f.yaw)) [fw, fd] = [fd, fw]
    out.push(box(f.x, f.z, fw, fd, s[2]))
  }
  for (const s of slots) {
    const c = deskCenter(s)
    const [dw, dd] = turned(s.yaw) ? [DESK_D, DESK_W] : [DESK_W, DESK_D]
    out.push(box(c.x, c.z, dw, dd, 0.75))
  }
  return out
}

/** Đẩy hình tròn (x,z,r) ra khỏi các hộp. Sửa trực tiếp p. */
export function resolveCircle(p: Vec2, r: number, boxes: AABB[]) {
  for (let iter = 0; iter < 3; iter++) {
    for (const b of boxes) {
      const cx = Math.max(b.minX, Math.min(p.x, b.maxX))
      const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ))
      const dx = p.x - cx, dz = p.z - cz
      const d2 = dx * dx + dz * dz
      if (d2 >= r * r) continue
      if (d2 > 1e-8) {
        const dd = Math.sqrt(d2)
        p.x += (dx / dd) * (r - dd)
        p.z += (dz / dd) * (r - dd)
      } else {
        const pen = [p.x - b.minX, b.maxX - p.x, p.z - b.minZ, b.maxZ - p.z]
        const m = Math.min(...pen)
        if (m === pen[0]) p.x = b.minX - r
        else if (m === pen[1]) p.x = b.maxX + r
        else if (m === pen[2]) p.z = b.minZ - r
        else p.z = b.maxZ + r
      }
    }
  }
}
