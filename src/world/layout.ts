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
  /** side = bàn phụ của agent con, nối dài dãy bàn của agent cha */
  zone: 'lead' | 'open' | 'side'
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
  | 'coffee' | 'fridge' | 'water' | 'window' | 'tv' | 'foos' | 'books' | 'sofa' | 'beanbag' | 'stool' | 'meeting' | 'kanban' | 'fame'

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

/**
 * Bản pixel thu gọn (27 × 15 m, trước là 32 × 22 m): bỏ khoảng trống giữa phòng kính và góc nghỉ,
 * open space còn 2 hàng × 2 cụm bàn (16 chỗ + 16 bàn phụ).
 */
export const OFFICE = { minX: -13.5, maxX: 13.5, minZ: -8, maxZ: 7, wallH: 3.2, wallT: 0.3 }
export const SPAWN: Vec2 = { x: 0, z: 5.2 }

/** Sảnh chờ bên phải cửa vào: ứng viên đứng chờ bạn duyệt hồ sơ, mặt nhìn vào văn phòng. */
export const LOBBY: (Vec2 & { yaw: number })[] = [
  { x: 3.0, z: 5.7, yaw: Math.PI - 0.2 },
  { x: 5.2, z: 5.7, yaw: Math.PI + 0.25 },
  { x: 3.1, z: 4.85, yaw: Math.PI - 0.2 },
  { x: 5.1, z: 4.85, yaw: Math.PI + 0.25 },
]

// Cửa phòng kính sát góc phía open space (không để lại mảnh kính hẹp cạnh cửa)
export const LEAD_ROOM = { minX: -13.5, maxX: -7.5, minZ: -8, maxZ: -2.5, door: [-8.7, -7.5] as const }
export const MEET_ROOM = { minX: 7.5, maxX: 13.5, minZ: -8, maxZ: -2.5, door: [7.5, 8.7] as const }

/**
 * Bảng kanban treo ở tường bắc của open space (mặt bảng nhìn về hướng nam, +z).
 * Bản pixel nhìn từ trên xuống nghiêng về phía bắc: chỉ thấy được mặt tường bắc, nên hai bảng treo ở đây.
 */
export const BOARD = { x: -4.6, y: 1.55, z: OFFICE.minZ + OFFICE.wallT / 2 + 0.04, w: 3.0, h: 1.6 }

/** Bảng vàng (xếp hạng EXP) treo tường bắc, đối xứng với bảng ticket qua hai ô cửa sổ giữa */
export const FAME = { x: 4.6, y: 1.6, z: OFFICE.minZ + OFFICE.wallT / 2 + 0.04, w: 3.0, h: 1.6 }

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
  | 'tv' | 'waterCooler' | 'beanbag' | 'rug' | 'door' | 'cabinet' | 'whiteboard'
  // Bản pixel: đồ LimeZu riêng
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

const H = Math.PI / 2
const meetChairs: Furniture[] = [9.5, 10.5, 11.5].flatMap((x) => [
  { kind: 'meetingChair' as const, x, z: -6.25, yaw: 0 },
  { kind: 'meetingChair' as const, x, z: -4.15, yaw: Math.PI },
])

export const FURNITURE: Furniture[] = [
  // Phòng Lead: bàn quay mặt về cửa, kệ sách tường bắc
  { kind: 'rug', x: -10.5, z: -5.3, w: 3.8, d: 2.8, color: '#7a8fb8' },
  { kind: 'meetingChair', x: -11.0, z: -4.45, yaw: Math.PI },
  { kind: 'meetingChair', x: -10.0, z: -4.45, yaw: Math.PI },
  { kind: 'bookshelfWide', x: -10.5, z: -7.65 },
  { kind: 'cabinet', x: -12.9, z: -7.55 },
  { kind: 'cabinet', x: -8.9, z: -7.55 },
  { kind: 'plant', x: -8.0, z: -7.45 },
  // Phòng họp
  { kind: 'rug', x: 10.5, z: -5.2, w: 4.8, d: 3.4, color: '#8a7bb0' },
  { kind: 'meetingTable', x: 10.5, z: -5.2 },
  ...meetChairs,
  { kind: 'meetingChair', x: 8.45, z: -5.2, yaw: H },
  { kind: 'meetingChair', x: 12.55, z: -5.2, yaw: -H },
  { kind: 'tv', x: 10.5, z: -7.82 },
  { kind: 'plant', x: 8.0, z: -7.45 },
  // Pantry: dãy bếp dựa vách kính phòng họp (tránh cửa phòng họp), bàn cao, máy bán nước
  { kind: 'kitchen', x: 11.1, z: -2.4, w: 4.75, d: 0.7 },
  { kind: 'coffeeMachine', x: 9.2, z: -2.4 },
  // Bàn ăn 4 ghế (bàn gỗ hội nghị thu nhỏ) và một bàn cao
  ...[1.3, 4.2].flatMap((z, i): Furniture[] => [
    { kind: 'meetingTable', x: 9.9, z, w: 2.0, d: 1.0 },
    { kind: 'meetingChair', x: 9.4, z: z - 0.75, yaw: 0 },
    { kind: 'meetingChair', x: 10.4, z: z - 0.75, yaw: 0 },
    { kind: 'meetingChair', x: 9.4, z: z + 0.75, yaw: Math.PI },
    { kind: 'meetingChair', x: 10.4, z: z + 0.75, yaw: Math.PI },
    ...(i === 0 ? [{ kind: 'fruitBowl' as const, x: 9.5, z }] : []),
  ]),
  { kind: 'highTable', x: 12.3, z: 5.9 },
  { kind: 'stool', x: 11.55, z: 5.9 },
  { kind: 'stool', x: 13.05, z: 5.9 },
  { kind: 'waterCooler', x: 13.05, z: 0.6 },
  { kind: 'waterCooler', x: 13.05, z: 1.5, color: 'jug' },
  { kind: 'plant', x: 13.0, z: 3.4, color: 'palm' },
  { kind: 'plantSmall', x: 8.0, z: 6.5 },
  // Lounge: sofa nhìn ra kệ TV, bàn bóng bàn, kệ sách
  { kind: 'rug', x: -10.6, z: 0.4, w: 4.4, d: 3.2, color: '#4f9d94' },
  { kind: 'tvStand', x: -10.6, z: -2.05 },
  { kind: 'bookshelf', x: -12.9, z: -1.55 },
  { kind: 'sofaBack', x: -10.6, z: 1.4 },
  { kind: 'floorLamp', x: -12.6, z: 1.4 },
  { kind: 'beanbag', x: -8.5, z: 0.2, color: '#e0784f' },
  { kind: 'foosball', x: -10.6, z: 4.6 },
  { kind: 'arcade', x: -13.0, z: 6.4 },
  { kind: 'arcade', x: -12.45, z: 6.4, color: '2' },
  { kind: 'beanbag', x: -12.4, z: 4.0, color: '#e0784f' },
  { kind: 'plant', x: -8.2, z: 6.4, color: 'palm' },
  { kind: 'rug', x: -10.6, z: 4.6, w: 2.6, d: 2.8, color: '#c4553f' },
  // Open space
  { kind: 'plantSmall', x: 0, z: -7.5 },
  // Tủ hồ sơ ở hai góc tường bắc, giữa vách kính và bảng
  { kind: 'cabinet', x: -6.9, z: -7.55 },
  { kind: 'cabinet', x: 6.9, z: -7.55 },
  { kind: 'printer', x: 6.9, z: -7.55 },
  // Cửa vào, thảm, cây; sảnh chờ có ghế băng; góc tủ hồ sơ bên trái
  { kind: 'door', x: 0, z: 6.85 },
  { kind: 'rug', x: 0, z: 6.15, w: 3.2, d: 1.3, color: '#c4553f' },
  { kind: 'plant', x: -2.3, z: 6.45, color: 'tree' },
  { kind: 'plant', x: 2.3, z: 6.45, color: 'tree' },
  { kind: 'bench', x: 4.1, z: 6.6 },
  { kind: 'plantSmall', x: 6.3, z: 6.5 },
  { kind: 'cabinet', x: -4.4, z: 6.6 },
  { kind: 'cabinet', x: -5.3, z: 6.6 },
  { kind: 'plantSmall', x: -6.3, z: 6.5 },
]

// ───────────────────────── Lối đi cho agent ─────────────────────────

const XL = [-6.95, 0, 6.95]
const ZL = [-6.25, -1.0, 4.25]
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
  add('leadOut', -8.1, -1.6); link('leadOut', gid(0, 1))
  add('leadIn', -8.1, -3.4); link('leadIn', 'leadOut')
  const poi = (id: string, x: number, z: number, yaw: number, act: Activity, area: string, label: string, sit?: number) =>
    add(id, x, z, { poi: true, yaw, act, area, label, sit })

  // Phòng họp
  add('meetOut', 8.1, -1.6); link('meetOut', gid(2, 1))
  add('meetIn', 8.1, -3.4); link('meetIn', 'meetOut')
  poi('meetTv', 10.5, -3.15, Math.PI, 'tv', 'meeting', 'xem TV phòng họp'); link('meetTv', 'meetIn')
  poi('meetChair1', 9.5, -4.15, Math.PI, 'meeting', 'meeting', 'ngồi phòng họp', 0); link('meetChair1', 'meetIn')
  poi('meetChair2', 11.5, -4.15, Math.PI, 'meeting', 'meeting', 'ngồi phòng họp', 0); link('meetChair2', 'meetIn')
  // Cửa sổ open space
  poi('winL', -1.5, -7.3, Math.PI, 'window', 'window', 'ngắm cửa sổ'); link('winL', gid(1, 0))
  poi('winR', 1.5, -7.3, Math.PI, 'window', 'window', 'ngắm cửa sổ'); link('winR', gid(1, 0))
  // Pantry
  // Lối trong pantry: dọc dãy bếp (bắc), rồi xuống phía đông hai bàn ăn
  add('pantry', 8.1, -0.6); link('pantry', gid(2, 1))
  add('pantryE', 11.8, -0.5); link('pantryE', 'pantry')
  poi('coffee', 9.2, -1.4, Math.PI, 'coffee', 'pantry', 'pha cà phê'); link('coffee', 'pantry')
  poi('fridge', 12.95, -1.4, Math.PI, 'fridge', 'pantry', 'mở tủ lạnh'); link('fridge', 'pantryE')
  add('pantryS', 11.3, 5.05); link('pantryS', 'pantryE')
  poi('highTable', 12.3, 5.15, 0, 'stool', 'pantry', 'đứng bàn cao'); link('highTable', 'pantryS')
  poi('stoolE', 13.05, 5.9, -H, 'stool', 'pantry', 'ngồi ghế cao', 0.28); link('stoolE', 'pantryS')
  poi('stoolW', 11.55, 5.9, H, 'stool', 'pantry', 'ngồi ghế cao', 0.28); link('stoolW', 'pantryS')
  poi('lunch1', 9.4, 0.55, 0, 'stool', 'pantry', 'ăn trưa', 0); link('lunch1', 'pantry')
  poi('lunch2', 10.4, 5.0, Math.PI, 'stool', 'pantry', 'ăn trưa', 0); link('lunch2', 'pantryS')
  poi('cooler', 12.3, 1.05, H, 'water', 'pantry', 'lấy nước'); link('cooler', 'pantryE')
  // Lounge
  add('lounge', -8.3, 2.6); link('lounge', gid(0, 1)); link('lounge', gid(0, 2))
  // Bàn bóng bàn dựng dọc: hai người đứng hai đầu bắc / nam
  add('foosS', -9.3, 5.85); link('foosS', 'lounge')
  poi('foos1', -10.6, 5.85, Math.PI, 'foos', 'lounge', 'chơi bóng bàn'); link('foos1', 'foosS')
  poi('foos2', -10.6, 3.35, 0, 'foos', 'lounge', 'chơi bóng bàn'); link('foos2', 'lounge')
  poi('books', -12.9, -0.85, Math.PI, 'books', 'lounge', 'chọn sách'); link('books', gid(0, 1))
  // Sofa quay lưng về camera, nhìn ra kệ TV
  poi('sofa1', -11.1, 1.45, Math.PI, 'sofa', 'lounge', 'ngả lưng trên sofa', 0.07); link('sofa1', 'lounge')
  poi('sofa2', -10.1, 1.45, Math.PI, 'sofa', 'lounge', 'ngả lưng trên sofa', 0.07); link('sofa2', 'lounge')
  poi('beanbag', -8.5, 0.25, 0, 'beanbag', 'lounge', 'ngồi ghế bành', -0.02); link('beanbag', 'lounge')
  // Bảng kanban trên tường bắc
  poi('kanbanL', BOARD.x - 0.8, BOARD.z + 1.25, Math.PI, 'kanban', 'kanban', 'xem bảng ticket'); link('kanbanL', gid(0, 0)); link('kanbanL', gid(1, 0))
  poi('kanbanR', BOARD.x + 0.8, BOARD.z + 1.25, Math.PI, 'kanban', 'kanban', 'xem bảng ticket'); link('kanbanR', gid(0, 0)); link('kanbanR', gid(1, 0))
  // Bảng vàng
  poi('fameL', FAME.x - 0.7, FAME.z + 1.3, Math.PI, 'fame', 'fame', 'xem bảng vàng'); link('fameL', gid(1, 0)); link('fameL', gid(2, 0))
  poi('fameR', FAME.x + 0.7, FAME.z + 1.3, Math.PI, 'fame', 'fame', 'xem bảng vàng'); link('fameR', gid(1, 0)); link('fameR', gid(2, 0))

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

// Thứ tự lấp: hàng gần bảng (tường bắc) trước, rồi hàng gần cửa vào
const PODS: Vec2[] = [
  { x: -3.5, z: -3.5 }, { x: 3.5, z: -3.5 },
  { x: -3.5, z: 1.5 }, { x: 3.5, z: 1.5 },
]

const nearestIdx = (arr: number[], v: number) =>
  arr.reduce((bi, x, i) => (Math.abs(x - v) < Math.abs(arr[bi] - v) ? i : bi), 0)

const podRows = (p: Vec2) => [
  { dz: -1.2, yaw: 0, corridor: p.z - 2.75 },
  { dz: 1.2, yaw: Math.PI, corridor: p.z + 2.75 },
]

function rowSlot(id: string, zone: DeskSlot['zone'], seat: Vec2, yaw: number, corridor: number): DeskSlot {
  const j = nearestIdx(ZL, corridor)
  return { id, zone, seat, yaw, exits: [{ x: seat.x, z: ZL[j] }], attach: gid(nearestIdx(XL, seat.x), j) }
}

function podSlots(p: Vec2, pi: number): DeskSlot[] {
  return podRows(p).flatMap((r, ri) =>
    [-0.7, 0.7].map((dx, ci) => rowSlot(`pod${pi}-${ri}${ci}`, 'open', { x: p.x + dx, z: p.z + r.dz }, r.yaw, r.corridor)),
  )
}

/** Bàn phụ ở hai đầu dãy bàn (mỗi cụm 4 chỗ: trái/phải × hai hàng) */
const SIDE_DX = 2.1
function sideSlot(p: Vec2, pi: number, ri: number, side: -1 | 1): DeskSlot {
  const r = podRows(p)[ri]
  return rowSlot(`side${pi}-${ri}${side < 0 ? 'L' : 'R'}`, 'side', { x: p.x + side * SIDE_DX, z: p.z + r.dz }, r.yaw, r.corridor)
}

/** Một Lead: bàn giữa phòng (lead0). Hai Lead: hai bàn hai bên (lead1, lead2). */
const LEAD_SLOTS: DeskSlot[] = [
  { x: -10.5, ex: -11.6 },
  { x: -11.9, ex: -13.0 },
  { x: -9.1, ex: -8.0 },
].map(({ x, ex }, i) => ({
  id: `lead${i}`,
  zone: 'lead' as const,
  seat: { x, z: -6.4 },
  yaw: 0, // nhìn về phía nam, ra cửa phòng
  exits: [{ x: ex, z: -6.4 }, { x: ex, z: -3.4 }],
  attach: 'leadIn',
}))

export interface World {
  /** Bàn được vẽ (kể cả bàn trống) */
  slots: DeskSlot[]
  /** agentId → chỗ ngồi */
  seatOf: Map<string, DeskSlot>
  colliders: AABB[]
  pods: Vec2[]
  /** Đồ đặt vào chỗ cụm bàn chưa dùng (góc thảo luận); có người mới cần bàn thì nhường chỗ */
  extras: Furniture[]
}

/**
 * Chỗ cụm bàn còn trống: bên trái là góc đứng họp nhanh (bảng phấn, bàn cao), bên phải là góc đọc
 * (kệ sách, bàn trà, hai ghế bành, đèn cây)
 */
function nook(p: Vec2): Furniture[] {
  if (p.x < 0) {
    return [
      { kind: 'rug', x: p.x, z: p.z + 0.25, w: 2.8, d: 2.0, color: '#c4553f' },
      { kind: 'chalkboard', x: p.x, z: p.z - 0.85 },
      { kind: 'highTable', x: p.x, z: p.z + 0.55 },
      { kind: 'stool', x: p.x - 0.75, z: p.z + 0.55 },
      { kind: 'stool', x: p.x + 0.75, z: p.z + 0.55 },
      { kind: 'plant', x: p.x - 1.9, z: p.z - 0.75, color: 'tree' },
      { kind: 'cabinet', x: p.x + 1.7, z: p.z - 0.8 },
    ]
  }
  return [
    { kind: 'rug', x: p.x, z: p.z + 0.55, w: 3.6, d: 1.9, color: '#4f9d94' },
    { kind: 'bookshelfWide', x: p.x, z: p.z - 0.75 },
    { kind: 'coffeeTable', x: p.x, z: p.z + 0.6 },
    { kind: 'beanbag', x: p.x - 1.35, z: p.z + 0.6 },
    { kind: 'beanbag', x: p.x + 1.35, z: p.z + 0.6 },
    { kind: 'floorLamp', x: p.x + 2.3, z: p.z + 0.3 },
    { kind: 'plantSmall', x: p.x - 2.3, z: p.z + 0.4 },
  ]
}

/**
 * Xếp chỗ theo sơ đồ tổ chức: agent gốc có người báo cáo = Lead → phòng kính (tối đa 2),
 * thành viên ngồi open space theo từng nhóm của Lead (duyệt cây reportsTo).
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
  const isLead = (a: Agent) => (children.get(a.id)?.length ?? 0) > 0
  const roots = children.get(null) ?? []

  const leads = roots.filter(isLead)
  const ordered: Agent[] = []
  const visit = (a: Agent) => { ordered.push(a); (children.get(a.id) ?? []).forEach(visit) }
  roots.forEach(visit)

  const seatOf = new Map<string, DeskSlot>()
  const usedLead = leads.slice(0, 2)
  const leadSlots = usedLead.length <= 1 ? LEAD_SLOTS.slice(0, 1) : LEAD_SLOTS.slice(1)
  usedLead.forEach((a, i) => seatOf.set(a.id, leadSlots[i]))
  // Agent con = cha của nó cũng báo cáo cho người khác
  const isSub = (a: Agent) => !!parentOf.get(a.id) && !!parentOf.get(parentOf.get(a.id)!.id)
  const subs = ordered.filter((a) => !seatOf.has(a.id) && isSub(a))
  const openAgents = ordered.filter((a) => !seatOf.has(a.id) && !isSub(a))

  const podCount = Math.min(PODS.length, Math.max(2, Math.ceil(openAgents.length / 4)))
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
  // Hết bàn phụ: ngồi chỗ trống ở open space như thành viên thường
  const free = openSlots.filter((s) => ![...seatOf.values()].includes(s))
  homeless.slice(0, free.length).forEach((a, i) => seatOf.set(a.id, free[i]))

  const slots = [...leadSlots, ...openSlots, ...sideSlots]
  const extras = PODS.slice(podCount).flatMap((p) => nook(p))
  return { slots, seatOf, colliders: buildColliders(slots, extras), pods, extras }
}

export function deskCenter(s: DeskSlot): Vec2 {
  const f = forward(s.yaw)
  return { x: s.seat.x + f.x * SEAT_TO_DESK, z: s.seat.z + f.z * SEAT_TO_DESK }
}

function buildColliders(slots: DeskSlot[], extras: Furniture[]): AABB[] {
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

  for (const f of [...FURNITURE, ...extras]) {
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
