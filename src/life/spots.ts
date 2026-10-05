import { itemById } from '../data/catalog'
import { CELL, JOBS, cellX, isClean, type OfficeState } from '../data/officeState'
import { snapFree } from '../world/nav'
import { BOARD, OFFICE, WINDOWS, type Activity, type Vec2, type World } from '../world/layout'

/**
 * Những chỗ agent rảnh đi tới: cửa sổ, bảng ticket, góc tán gẫu, và (khi văn phòng còn bẩn) chỗ bụi bẩn để đứng than thở.
 * Dựng lại khi bố cục hoặc chỗ đã dọn đổi. Sau này đồ mua ở cửa hàng (máy cà phê, sofa...) thêm chỗ của chúng vào đây.
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
  // Mảng sàn còn bẩn: một chỗ đứng nhìn xuống sàn
  for (const j of JOBS) {
    if (j.kind !== 'floor' || !j.rect || isClean(office, j.id)) continue
    const r = seeded(j.id)
    const p = at({ x: j.rect.minX + 1 + r() * (j.rect.maxX - j.rect.minX - 2), z: j.rect.minZ + 1 + r() * (j.rect.maxZ - j.rect.minZ - 2) })
    out.push({ id: `dust-${j.id}`, ...p, yaw: r() * Math.PI * 2, act: 'dust', area: `dust-${j.id}` })
  }
  return out
}
