import type { Mood, PoseMode } from '../characters/Character'
import { GRAPH, POIS, type DeskSlot, type Vec2 } from '../world/layout'
import { clock } from './store'

/** Điểm trên đường đi của agent. */
export interface WP {
  x: number
  z: number
  /** Nút lối đi */
  node?: string
  /** Ghế của chính agent */
  seat?: boolean
  /** Thứ tự điểm ra khỏi ghế của chính agent */
  exit?: number
  /** Đường ghé bàn người khác: nút lối đi gần bàn đó */
  via?: string
  /** Chỗ đứng sau ghế người được ghé; `back` = điểm lối đi để quay ra */
  stand?: boolean
  back?: Vec2
}

/**
 * Trạng thái sống của một agent, dùng chung giữa AgentActor (di chuyển, dáng) và director (hội thoại, chào hỏi).
 * Để ngoài React: đổi mỗi khung hình.
 */
export interface LifeActor {
  id: string
  slot: DeskSlot
  x: number
  z: number
  yaw: number
  /** seat: ngồi bàn · spot: ở một điểm (cà phê, sofa...) · visit: đứng sau ghế đồng nghiệp · walk: đang đi */
  where: 'seat' | 'spot' | 'visit' | 'walk'
  /** Nút đang đứng (spot) hoặc nút lối đi gần bàn đang ghé (visit) */
  node: string | null
  /** Điểm lối đi để rời chỗ đứng khi ghé bàn */
  back: Vec2 | null
  /** Chỗ nhìn vào khi ghé bàn */
  lookAt: Vec2 | null
  pts: WP[]
  i: number
  dest: 'seat' | 'spot' | 'visit'
  /** Còn bao lâu thì rời chỗ hiện tại (giây) */
  timer: number
  arrivedAt: number
  /** Quay mặt về một điểm (người đang nói chuyện / bạn) tới lúc faceUntil */
  face: Vec2 | null
  faceUntil: number
  gesture: PoseMode | null
  gestureUntil: number
  mood: Mood | null
  moodUntil: number
  /** Đang trong một đoạn hội thoại tới lúc này */
  talkUntil: number
  chatCd: number
  nextMuse: number
  greetAt: number
  visitCd: number
  visitOf: string | null
  visitTalked: boolean
  blockedFor: number
  excuseAt: number
  /** Lệnh từ director: đi ghé bàn agent khác */
  cmd: { kind: 'visit'; target: string } | null
  /** Lệch pha để các agent không động tác giống hệt nhau */
  phase: number
}

export const actors = new Map<string, LifeActor>()

/** Chỗ (POI) → agent đã nhận chỗ đó. Mỗi chỗ chỉ một người. */
const claims = new Map<string, string>()

export function release(id: string) {
  for (const [spot, who] of claims) if (who === id) claims.delete(spot)
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

export function newActor(id: string, slot: DeskSlot): LifeActor {
  const t = clock.t
  return {
    id, slot, x: slot.seat.x, z: slot.seat.z, yaw: slot.yaw,
    where: 'seat', node: null, back: null, lookAt: null, pts: [], i: 0, dest: 'seat',
    timer: rand(2, 8), arrivedAt: t - 10,
    face: null, faceUntil: 0, gesture: null, gestureUntil: 0, mood: null, moodUntil: 0,
    talkUntil: 0, chatCd: t + rand(4, 12), nextMuse: t + rand(6, 25), greetAt: 0, visitCd: t + rand(30, 60),
    visitOf: null, visitTalked: false, blockedFor: 0, excuseAt: 0, cmd: null, phase: Math.random() * 10,
  }
}

/** Đưa agent về ngồi ở bàn ngay (khi mới vào hoặc bàn đổi chỗ). */
export function resetToSeat(a: LifeActor, slot: DeskSlot) {
  release(a.id)
  Object.assign(a, { slot, x: slot.seat.x, z: slot.seat.z, yaw: slot.yaw, where: 'seat', node: null, back: null, pts: [], i: 0, dest: 'seat', cmd: null })
}

/**
 * Chọn chỗ tiếp theo cho agent rảnh và giữ chỗ đó. Ưu tiên khu đang có đồng nghiệp (để tụ tập nói chuyện),
 * và chỗ bóng bàn còn lại khi đã có người đứng một bên.
 */
export function chooseSpot(self: LifeActor, exclude?: string | null): string {
  const crowd = new Map<string, number>()
  for (const o of actors.values()) {
    if (o === self) continue
    const n = o.node && (o.where === 'spot' || (o.where === 'walk' && o.dest === 'spot')) ? GRAPH.nodes[o.node] : null
    const target = o.where === 'walk' && o.dest === 'spot' ? GRAPH.nodes[o.pts[o.pts.length - 1]?.node ?? ''] : n
    if (target?.area) crowd.set(target.area, (crowd.get(target.area) ?? 0) + 1)
  }
  const foosTaken = POIS.some((p) => p.act === 'foos' && claims.has(p.id) && claims.get(p.id) !== self.id)
  const free = POIS.filter((p) => p.id !== exclude && (!claims.has(p.id) || claims.get(p.id) === self.id))
  const list = free.length ? free : POIS
  const weights = list.map((p) => {
    let w = 1
    if (p.area && crowd.get(p.area)) w *= 4
    if (p.act === 'foos' && foosTaken) w *= 6
    return w
  })
  let r = Math.random() * weights.reduce((s, w) => s + w, 0)
  let pick = list[list.length - 1]
  for (let k = 0; k < list.length; k++) {
    r -= weights[k]
    if (r <= 0) { pick = list[k]; break }
  }
  release(self.id)
  claims.set(pick.id, self.id)
  return pick.id
}
