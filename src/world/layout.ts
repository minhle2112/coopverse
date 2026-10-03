import type { Agent } from '../data/types'

/*
 * Sơ đồ văn phòng (nhìn từ trên, bắc = -z):
 *
 *   x: -16 ........ -9 | -7.5 ...... 0 ...... 7.5 | 9 ......... 16
 *   z=-11 ┌────────────┬──────── cửa sổ ───────────┬────────────┐
 *         │ Phòng Lead │      Open space           │ Phòng họp  │
 *   z=-4  └──cửa──kính─┘   (cụm bàn 4 chỗ)          └─kính──cửa──┘
 *         │  Lounge    │                            │  Pantry    │
 *   z=11  └────────────┴─────────── cửa vào ────────┴────────────┘
 */

export interface Vec2 { x: number; z: number }

/** Hộp va chạm theo trục. h = chiều cao; cam = chặn camera (tường đặc). */
export interface AABB { minX: number; maxX: number; minZ: number; maxZ: number; h: number; cam?: boolean }

export interface DeskSlot {
  id: string
  zone: 'lead' | 'open'
  seat: Vec2
  /** Hướng agent nhìn khi ngồi (bàn nằm phía trước). forward = (sin yaw, cos yaw) */
  yaw: number
  /** Các điểm đi ra khỏi chỗ ngồi tới lối đi */
  exits: Vec2[]
  /** Nút lối đi nối với chỗ ngồi */
  attach: string
}

/** Việc agent làm khi dừng ở một điểm (quyết định dáng, đồ cầm tay, câu nói) */
export type Activity =
  | 'coffee' | 'fridge' | 'water' | 'window' | 'tv' | 'foos' | 'books' | 'sofa' | 'beanbag' | 'stool' | 'meeting' | 'kanban'

export interface GraphNode extends Vec2 {
  id: string
  poi?: boolean
  yaw?: number
  label?: string
  act?: Activity
  /** Khu: agent ở cùng khu thì dễ bắt chuyện với nhau */
  area?: string
  /** Có thì agent ngồi ở đây; giá trị = độ cao mặt ghế so với ghế văn phòng (m) */
  sit?: number
}
export interface Graph { nodes: Record<string, GraphNode>; adj: Record<string, string[]> }

export const OFFICE = { minX: -16, maxX: 16, minZ: -11, maxZ: 11, wallH: 3.2, wallT: 0.3 }
export const SPAWN: Vec2 = { x: 0, z: 5.5 }

export const LEAD_ROOM = { minX: -16, maxX: -9, minZ: -11, maxZ: -4, door: [-11.5, -10.3] as const }
export const MEET_ROOM = { minX: 9, maxX: 16, minZ: -11, maxZ: -4, door: [10.3, 11.5] as const }

/** Bảng kanban treo ở tường nam (mặt bảng nhìn về hướng bắc, -z) */
export const BOARD = { x: -5.2, y: 1.55, z: OFFICE.maxZ - OFFICE.wallT / 2 - 0.04, w: 3.6, h: 1.8 }

/** Khoảng cách từ ghế tới tâm bàn */
export const SEAT_TO_DESK = 0.83
export const DESK_W = 1.4
export const DESK_D = 0.75

export const forward = (yaw: number): Vec2 => ({ x: Math.sin(yaw), z: Math.cos(yaw) })

export function box(cx: number, cz: number, w: number, d: number, h: number, cam = false): AABB {
  return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h, cam }
}

const turned = (yaw = 0) => Math.abs(Math.sin(yaw)) > 0.5

// ───────────────────────── Nội thất cố định ─────────────────────────

export type FurnitureKind =
  | 'plant' | 'plantSmall' | 'bookshelf' | 'sofa' | 'coffeeTable' | 'foosball' | 'counter'
  | 'coffeeMachine' | 'fridge' | 'highTable' | 'stool' | 'meetingTable' | 'meetingChair'
  | 'tv' | 'waterCooler' | 'beanbag' | 'rug' | 'door'

export interface Furniture { kind: FurnitureKind; x: number; z: number; yaw?: number; w?: number; d?: number; color?: string }

/** [rộng, sâu, cao] để va chạm; null = không chặn đường */
const SIZE: Record<FurnitureKind, [number, number, number] | null> = {
  plant: [0.55, 0.55, 1.4],
  plantSmall: [0.4, 0.4, 0.8],
  bookshelf: [1.6, 0.4, 2.0],
  sofa: [2.4, 0.9, 0.8],
  coffeeTable: [1.2, 0.6, 0.4],
  foosball: [1.3, 0.75, 0.9],
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
}

const H = Math.PI / 2
const meetChairs: Furniture[] = [11.5, 12.5, 13.5].flatMap((x) => [
  { kind: 'meetingChair' as const, x, z: -8.85, yaw: 0 },
  { kind: 'meetingChair' as const, x, z: -6.75, yaw: Math.PI },
])

export const FURNITURE: Furniture[] = [
  // Phòng Lead
  { kind: 'rug', x: -13.2, z: -7.6, w: 3.4, d: 5.4, color: '#7a8fb8' },
  { kind: 'bookshelf', x: -15.55, z: -9.5, yaw: H },
  { kind: 'plant', x: -15.4, z: -4.6 },
  { kind: 'plant', x: -9.6, z: -10.4 },
  // Phòng họp
  { kind: 'rug', x: 12.5, z: -7.8, w: 5.2, d: 3.6, color: '#8a7bb0' },
  { kind: 'meetingTable', x: 12.5, z: -7.8 },
  ...meetChairs,
  { kind: 'meetingChair', x: 10.45, z: -7.8, yaw: H },
  { kind: 'meetingChair', x: 14.55, z: -7.8, yaw: -H },
  { kind: 'tv', x: 12.5, z: -10.82 },
  { kind: 'plant', x: 15.4, z: -4.6 },
  // Pantry
  { kind: 'counter', x: 15.3, z: 6.6, w: 0.7, d: 4.4 },
  { kind: 'coffeeMachine', x: 15.3, z: 5.3, yaw: -H },
  { kind: 'fridge', x: 15.25, z: 10.1, yaw: -H },
  { kind: 'highTable', x: 11.2, z: 9.3 },
  { kind: 'stool', x: 11.2, z: 8.55 },
  { kind: 'stool', x: 11.95, z: 9.3 },
  { kind: 'stool', x: 10.45, z: 9.3 },
  { kind: 'waterCooler', x: 9.6, z: 10.5 },
  { kind: 'plantSmall', x: 9.4, z: 4.0 },
  // Lounge
  { kind: 'rug', x: -13.4, z: 7.5, w: 4.6, d: 4.2, color: '#4f9d94' },
  { kind: 'sofa', x: -15.3, z: 7.5, yaw: H },
  { kind: 'coffeeTable', x: -13.9, z: 7.5, yaw: H },
  { kind: 'foosball', x: -11.5, z: 5.3 },
  { kind: 'bookshelf', x: -12, z: 10.65, yaw: Math.PI },
  { kind: 'beanbag', x: -13.2, z: 9.5, color: '#e0784f' },
  { kind: 'plant', x: -15.4, z: 4.2 },
  { kind: 'plant', x: -9.5, z: 10.4 },
  // Open space
  { kind: 'plant', x: -7.3, z: -10.4 },
  { kind: 'plant', x: 7.3, z: -10.4 },
  { kind: 'plantSmall', x: 0, z: -10.5 },
  { kind: 'plant', x: -1.9, z: 10.4 },
  { kind: 'plant', x: 1.9, z: 10.4 },
  { kind: 'door', x: 0, z: 10.85 },
  { kind: 'rug', x: 0, z: 9.6, w: 2.4, d: 1.4, color: '#c4553f' },
]

// ───────────────────────── Lối đi cho agent ─────────────────────────

const XL = [-7.5, 0, 7.5]
const ZL = [-9.25, -3.75, 1.75, 7.25]
const gid = (i: number, j: number) => `g${i}_${j}`

function buildGraph(): Graph {
  const nodes: Record<string, GraphNode> = {}
  const adj: Record<string, string[]> = {}
  const add = (id: string, x: number, z: number, extra: Partial<GraphNode> = {}) => {
    nodes[id] = { id, x, z, ...extra }
    adj[id] = []
  }
  const link = (a: string, b: string) => { adj[a].push(b); adj[b].push(a) }

  XL.forEach((x, i) => ZL.forEach((z, j) => add(gid(i, j), x, z)))
  XL.forEach((_, i) => ZL.forEach((_, j) => {
    if (i + 1 < XL.length) link(gid(i, j), gid(i + 1, j))
    if (j + 1 < ZL.length) link(gid(i, j), gid(i, j + 1))
  }))

  // Phòng Lead
  add('leadOut', -10.9, -3.0); link('leadOut', gid(0, 1))
  add('leadIn', -10.9, -5.2); link('leadIn', 'leadOut')
  const poi = (id: string, x: number, z: number, yaw: number, act: Activity, area: string, label: string, sit?: number) =>
    add(id, x, z, { poi: true, yaw, act, area, label, sit })

  // Phòng họp
  add('meetOut', 10.9, -3.0); link('meetOut', gid(2, 1))
  add('meetIn', 10.9, -5.2); link('meetIn', 'meetOut')
  poi('meetTv', 12.5, -5.5, Math.PI, 'tv', 'meeting', 'xem TV phòng họp'); link('meetTv', 'meetIn')
  poi('meetChair1', 11.5, -6.75, Math.PI, 'meeting', 'meeting', 'ngồi phòng họp', 0); link('meetChair1', 'meetIn')
  poi('meetChair2', 13.5, -6.75, Math.PI, 'meeting', 'meeting', 'ngồi phòng họp', 0); link('meetChair2', 'meetIn')
  // Cửa sổ open space
  poi('winL', -3.5, -10.3, Math.PI, 'window', 'window', 'ngắm cửa sổ'); link('winL', gid(1, 0))
  poi('winR', 3.5, -10.3, Math.PI, 'window', 'window', 'ngắm cửa sổ'); link('winR', gid(1, 0))
  // Pantry
  add('pantry', 11, 6.2); link('pantry', gid(2, 3))
  poi('coffee', 14.45, 5.3, H, 'coffee', 'pantry', 'pha cà phê'); link('coffee', 'pantry')
  poi('fridge', 14.3, 10.1, H, 'fridge', 'pantry', 'mở tủ lạnh'); link('fridge', 'pantry')
  poi('highTable', 11.2, 8.4, 0, 'stool', 'pantry', 'đứng bàn cao'); link('highTable', 'pantry')
  poi('stoolE', 11.95, 9.3, -H, 'stool', 'pantry', 'ngồi ghế cao', 0.28); link('stoolE', 'pantry')
  poi('stoolW', 10.45, 9.3, H, 'stool', 'pantry', 'ngồi ghế cao', 0.28); link('stoolW', 'pantry')
  poi('cooler', 9.6, 9.75, 0, 'water', 'pantry', 'lấy nước'); link('cooler', 'pantry')
  // Lounge
  add('lounge', -10.5, 7.8); link('lounge', gid(0, 3))
  poi('foos1', -11.5, 6.2, Math.PI, 'foos', 'lounge', 'chơi bi lắc'); link('foos1', 'lounge')
  add('foosSide', -10.1, 4.6); link('foosSide', 'lounge')
  poi('foos2', -11.5, 4.2, 0, 'foos', 'lounge', 'chơi bi lắc'); link('foos2', 'foosSide')
  poi('books', -12, 9.8, 0, 'books', 'lounge', 'chọn sách'); link('books', 'lounge')
  // Sofa: đi vòng bàn trà, vào từ hai đầu
  add('sofaN', -13.2, 5.95); link('sofaN', 'lounge')
  add('sofaS', -12.9, 8.75); link('sofaS', 'lounge')
  poi('sofa1', -15.2, 7.0, H, 'sofa', 'lounge', 'ngả lưng trên sofa', 0.07); link('sofa1', 'sofaN')
  poi('sofa2', -15.2, 8.0, H, 'sofa', 'lounge', 'ngả lưng trên sofa', 0.07); link('sofa2', 'sofaS')
  poi('beanbag', -13.2, 9.45, -H, 'beanbag', 'lounge', 'ngồi ghế lười', -0.02); link('beanbag', 'sofaS')
  // Bảng kanban trên tường nam
  poi('kanbanL', BOARD.x - 0.8, BOARD.z - 1.25, 0, 'kanban', 'kanban', 'xem bảng ticket'); link('kanbanL', gid(0, 3)); link('kanbanL', gid(1, 3))
  poi('kanbanR', BOARD.x + 0.8, BOARD.z - 1.25, 0, 'kanban', 'kanban', 'xem bảng ticket'); link('kanbanR', gid(0, 3)); link('kanbanR', gid(1, 3))

  return { nodes, adj }
}

export const GRAPH = buildGraph()
export const POIS = Object.values(GRAPH.nodes).filter((n) => n.poi)

/** Dijkstra trên đồ thị nhỏ → danh sách id nút (gồm cả điểm đầu và cuối). */
export function findPath(g: Graph, from: string, to: string): string[] {
  if (from === to) return [from]
  const dist: Record<string, number> = { [from]: 0 }
  const prev: Record<string, string> = {}
  const open = new Set([from])
  const done = new Set<string>()
  while (open.size) {
    let cur = ''
    let best = Infinity
    for (const id of open) if (dist[id] < best) { best = dist[id]; cur = id }
    open.delete(cur)
    if (cur === to) break
    done.add(cur)
    for (const nb of g.adj[cur]) {
      if (done.has(nb)) continue
      const a = g.nodes[cur], b = g.nodes[nb]
      const nd = best + Math.hypot(a.x - b.x, a.z - b.z)
      if (nd < (dist[nb] ?? Infinity)) { dist[nb] = nd; prev[nb] = cur; open.add(nb) }
    }
  }
  if (!(to in prev)) return [from]
  const path = [to]
  while (path[0] !== from) path.unshift(prev[path[0]])
  return path
}

// ───────────────────────── Chỗ ngồi ─────────────────────────

// Thứ tự lấp: hàng giữa trước (văn phòng ít người vẫn cân), rồi hàng gần cửa sổ, rồi hàng gần cửa vào
const PODS: Vec2[] = [
  { x: -3.5, z: -1 }, { x: 3.5, z: -1 },
  { x: -3.5, z: -6.5 }, { x: 3.5, z: -6.5 },
  { x: -3.5, z: 4.5 }, { x: 3.5, z: 4.5 },
]

const nearestIdx = (arr: number[], v: number) =>
  arr.reduce((bi, x, i) => (Math.abs(x - v) < Math.abs(arr[bi] - v) ? i : bi), 0)

function podSlots(p: Vec2, pi: number): DeskSlot[] {
  const rows = [
    { dz: -1.2, yaw: 0, corridor: p.z - 2.75 },
    { dz: 1.2, yaw: Math.PI, corridor: p.z + 2.75 },
  ]
  const out: DeskSlot[] = []
  for (const [ri, r] of rows.entries()) {
    for (const [ci, dx] of [-0.7, 0.7].entries()) {
      const seat = { x: p.x + dx, z: p.z + r.dz }
      const j = nearestIdx(ZL, r.corridor)
      out.push({
        id: `pod${pi}-${ri}${ci}`,
        zone: 'open',
        seat,
        yaw: r.yaw,
        exits: [{ x: seat.x, z: ZL[j] }],
        attach: gid(nearestIdx(XL, seat.x), j),
      })
    }
  }
  return out
}

const LEAD_SLOTS: DeskSlot[] = [-7.5, -9.8].map((z, i) => ({
  id: `lead${i}`,
  zone: 'lead' as const,
  seat: { x: -13.8, z },
  yaw: H, // nhìn về phía đông, qua vách kính ra open space
  exits: [{ x: -14.7, z }, { x: -14.7, z: -5.2 }],
  attach: 'leadIn',
}))

export interface World {
  /** Bàn được vẽ (kể cả bàn trống) */
  slots: DeskSlot[]
  /** agentId → chỗ ngồi */
  seatOf: Map<string, DeskSlot>
  colliders: AABB[]
  pods: Vec2[]
}

/**
 * Xếp chỗ theo sơ đồ tổ chức: agent có người báo cáo = Lead → phòng kính (tối đa 2),
 * còn lại ngồi open space, theo từng nhóm của Lead (duyệt cây reportsTo).
 */
export function buildWorld(agents: Agent[]): World {
  const children = new Map<string | null, Agent[]>()
  for (const a of agents) {
    const k = agents.some((b) => b.id === a.reportsTo) ? a.reportsTo : null
    children.set(k, [...(children.get(k) ?? []), a])
  }
  const isLead = (a: Agent) => (children.get(a.id)?.length ?? 0) > 0
  const roots = children.get(null) ?? []

  const leads = roots.filter(isLead)
  const ordered: Agent[] = []
  const visit = (a: Agent) => { ordered.push(a); (children.get(a.id) ?? []).forEach(visit) }
  roots.forEach(visit)

  const seatOf = new Map<string, DeskSlot>()
  const usedLead = leads.slice(0, LEAD_SLOTS.length)
  usedLead.forEach((a, i) => seatOf.set(a.id, LEAD_SLOTS[i]))
  const openAgents = ordered.filter((a) => !seatOf.has(a.id))

  const podCount = Math.min(PODS.length, Math.max(2, Math.ceil(openAgents.length / 4)))
  const pods = PODS.slice(0, podCount)
  const openSlots = pods.flatMap(podSlots)
  openAgents.slice(0, openSlots.length).forEach((a, i) => seatOf.set(a.id, openSlots[i]))

  const slots = [...LEAD_SLOTS.slice(0, Math.max(1, usedLead.length)), ...openSlots]
  return { slots, seatOf, colliders: buildColliders(slots), pods }
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
  // Vách kính (không chặn camera)
  const gt = 0.15, gh = 2.6
  const glass = (x1: number, z1: number, x2: number, z2: number) =>
    out.push(box((x1 + x2) / 2, (z1 + z2) / 2, Math.max(gt, Math.abs(x2 - x1)), Math.max(gt, Math.abs(z2 - z1)), gh))
  glass(LEAD_ROOM.maxX, LEAD_ROOM.minZ, LEAD_ROOM.maxX, LEAD_ROOM.maxZ)
  glass(LEAD_ROOM.minX, LEAD_ROOM.maxZ, LEAD_ROOM.door[0], LEAD_ROOM.maxZ)
  glass(LEAD_ROOM.door[1], LEAD_ROOM.maxZ, LEAD_ROOM.maxX, LEAD_ROOM.maxZ)
  glass(MEET_ROOM.minX, MEET_ROOM.minZ, MEET_ROOM.minX, MEET_ROOM.maxZ)
  glass(MEET_ROOM.minX, MEET_ROOM.maxZ, MEET_ROOM.door[0], MEET_ROOM.maxZ)
  glass(MEET_ROOM.door[1], MEET_ROOM.maxZ, MEET_ROOM.maxX, MEET_ROOM.maxZ)

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

/** Tia (3D) cắt hộp chặn camera gần nhất; trả về khoảng cách hoặc Infinity. */
export function rayHitCamBoxes(o: [number, number, number], dir: [number, number, number], boxes: AABB[]) {
  let best = Infinity
  for (const b of boxes) {
    if (!b.cam) continue
    // Tường coi như cao vô hạn: camera luôn ở trong nhà, không bay qua đỉnh tường
    const mins = [b.minX, -1e4, b.minZ], maxs = [b.maxX, 1e4, b.maxZ]
    let t0 = -Infinity, t1 = Infinity
    let miss = false
    for (let k = 0; k < 3; k++) {
      if (Math.abs(dir[k]) < 1e-9) {
        if (o[k] < mins[k] || o[k] > maxs[k]) { miss = true; break }
        continue
      }
      let ta = (mins[k] - o[k]) / dir[k], tb = (maxs[k] - o[k]) / dir[k]
      if (ta > tb) [ta, tb] = [tb, ta]
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb)
      if (t0 > t1) { miss = true; break }
    }
    if (!miss && t0 > 0 && t0 < best) best = t0
  }
  return best
}
