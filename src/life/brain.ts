import type { Mood, PoseMode } from '../characters/Character'
import type { AgentStatus } from '../data/types'
import { damp, lerpAngle, rand } from '../lib/math'
import { agentPos, lobbyPos, player } from '../runtime'
import { GRAPH, findPath, type Activity, type DeskSlot } from '../world/layout'
import { actors, chooseSpot, newActor, release, resetToSeat, type LifeActor, type WP } from './actors'
import { excuse, onArrive } from './director'
import { clock, forget, isSpeaking } from './store'

/**
 * "Bộ não" của một agent trong văn phòng, dùng chung cho bản 3D (AgentActor) và bản pixel:
 * đi đâu, đi đường nào, né ai, dừng lại làm gì, dáng và nét mặt. Không vẽ gì cả.
 */

const WALK_SPEED = 1.35
/** Khoảng cách bắt đầu né người khác khi đi */
const PERSONAL = 0.85

/** Nút lối đi gần sảnh nhất (giữa hàng bàn gần cửa vào) */
const LOBBY_NODE = 'g1_2'

const nodeWP = (id: string): WP => ({ x: GRAPH.nodes[id].x, z: GRAPH.nodes[id].z, node: id })
const seatWP = (s: DeskSlot): WP => ({ x: s.seat.x, z: s.seat.z, seat: true })
const exitWPs = (s: DeskSlot): WP[] => s.exits.map((e, k) => ({ x: e.x, z: e.z, exit: k }))

const leavePath = (s: DeskSlot, dest: string): WP[] => [...exitWPs(s), ...findPath(GRAPH, s.attach, dest).map(nodeWP)]
const toSeatPath = (s: DeskSlot, from: string): WP[] => [
  ...findPath(GRAPH, from, s.attach).slice(1).map(nodeWP),
  ...exitWPs(s).reverse(),
  seatWP(s),
]

/**
 * Bỏ nút lối đi khiến agent đi quá rồi quay đầu (ba điểm thẳng hàng, hai điểm kề nằm cùng một phía),
 * vd ra khỏi ghế rồi đi tới đầu dãy bàn trước khi quay lại đi hướng ngược.
 */
function trim(pts: WP[], from: { x: number; z: number }): WP[] {
  const out = [...pts]
  for (let i = 0; i < out.length - 1; ) {
    const p = i === 0 ? from : out[i - 1], q = out[i], r = out[i + 1]
    const ax = p.x - q.x, az = p.z - q.z, bx = r.x - q.x, bz = r.z - q.z
    if (q.node && Math.abs(ax * bz - az * bx) < 1e-3 && ax * bx + az * bz > 1e-6) {
      out.splice(i, 1)
      if (i > 0) i--
      continue
    }
    i++
  }
  return out
}

/** Chỗ đứng sau ghế đồng nghiệp: giữa lối đi và ghế */
function visitWPs(m: DeskSlot): WP[] {
  const e = m.exits[0]
  return [
    { x: e.x, z: e.z, via: m.attach },
    { x: e.x + (m.seat.x - e.x) * 0.45, z: e.z + (m.seat.z - e.z) * 0.45, via: m.attach, stand: true, back: { x: e.x, z: e.z } },
  ]
}

/** Dáng khi dừng ở một chỗ */
const ACT_POSE: Partial<Record<Activity, PoseMode>> = { coffee: 'drink', water: 'drink', foos: 'play', books: 'read' }

/** Agent đang chờ bạn: 'approval' = có phiếu duyệt, 'question' = chỉ có câu hỏi */
export type Asking = 'approval' | 'question' | null

/** Kết quả mỗi khung hình: vẽ theo đây */
export interface Body {
  mode: PoseMode
  mood: Mood
  /** Đang ngồi (ghế, sofa, ghế đẩu) */
  seat: boolean
  /** Ngồi cao/thấp hơn ghế văn phòng (m) */
  lift: number
}

/** Lấy (hoặc tạo) trạng thái sống của agent */
export function actorFor(id: string, slot: DeskSlot): LifeActor {
  let a = actors.get(id)
  if (!a) {
    a = newActor(id, slot)
    actors.set(id, a)
  }
  return a
}

/**
 * Bàn của agent vừa được (xếp) lại. Sơ đồ dựng lại mà chỗ ngồi giữ nguyên thì không kéo agent về ghế.
 * Vừa được duyệt thuê: đi bộ từ sảnh (chỗ đứng lúc làm ứng viên) về bàn mới.
 */
export function placeActor(a: LifeActor, slot: DeskSlot) {
  const same = a.slot.id === slot.id && a.slot.seat.x === slot.seat.x && a.slot.seat.z === slot.seat.z
  if (same) a.slot = slot
  else resetToSeat(a, slot)
  const from = lobbyPos.get(a.id)
  if (from) {
    lobbyPos.delete(a.id)
    Object.assign(a, { x: from.x, z: from.z, yaw: Math.PI, where: 'walk', dest: 'seat', i: 0 })
    a.pts = trim([nodeWP(LOBBY_NODE), ...toSeatPath(slot, LOBBY_NODE)], a)
  }
}

/** Agent rời văn phòng: xoá hết dấu vết */
export function dropActor(id: string) {
  actors.delete(id)
  release(id)
  agentPos.delete(id)
  forget(id)
}

/**
 * Một bước mô phỏng. Đang làm / tạm dừng / lỗi / chờ bạn duyệt → ngồi ở bàn (chờ duyệt thì giơ tay).
 * Rảnh → đi tới các chỗ trong văn phòng (cà phê, sofa, bóng bàn, bảng ticket...), tụ tập nói chuyện, thỉnh thoảng về bàn.
 */
export function stepActor(a: LifeActor, st: AgentStatus, ask: Asking, rawDt: number): Body {
  const dt = Math.min(rawDt, 0.05)
  const slot = a.slot
  const t = clock.t
  // Có việc chờ bạn: về bàn ngồi giơ tay, để bạn biết tìm ở đâu
  const wantsSeat = st !== 'idle' || ask !== null
  const talking = a.talkUntil > t

  const walk = (pts: WP[], dest: LifeActor['dest']) => {
    if (!pts.length) return
    a.pts = trim(pts, a)
    a.i = 0
    a.dest = dest
    a.where = 'walk'
  }
  /** Đường rời chỗ hiện tại (spot / visit) tới một nút */
  const fromHere = (dest: string): WP[] =>
    a.where === 'visit'
      ? [{ ...a.back! }, ...findPath(GRAPH, a.node!, dest).map(nodeWP)]
      : findPath(GRAPH, a.node!, dest).slice(1).map(nodeWP)
  const seatFromHere = (): WP[] =>
    a.where === 'visit' ? [{ ...a.back! }, nodeWP(a.node!), ...toSeatPath(slot, a.node!)] : toSeatPath(slot, a.node!)

  // ── Lệnh ghé bàn từ director ──
  if (a.cmd && (wantsSeat || a.where === 'walk')) a.cmd = null
  if (a.cmd && !talking) {
    const m = actors.get(a.cmd.target)
    a.cmd = null
    if (m) {
      release(a.id)
      a.visitOf = m.id
      const path = a.where === 'seat' ? leavePath(slot, m.slot.attach) : fromHere(m.slot.attach)
      walk([...path, ...visitWPs(m.slot)], 'visit')
    }
  }

  if (a.where === 'seat') {
    if (!wantsSeat && !talking) {
      a.timer -= dt
      if (a.timer <= 0) walk(leavePath(slot, chooseSpot(a)), 'spot')
    }
  } else if (a.where === 'spot' || a.where === 'visit') {
    if (wantsSeat) {
      release(a.id)
      walk(seatFromHere(), 'seat')
    } else if (!talking) {
      a.timer -= dt
      if (a.timer <= 0) {
        if (Math.random() < 0.3) {
          release(a.id)
          walk(seatFromHere(), 'seat')
        } else {
          walk(fromHere(chooseSpot(a, a.node)), 'spot')
        }
      }
    }
  } else {
    // Đang đi mà có việc → quay về bàn
    if (wantsSeat && a.dest !== 'seat') {
      release(a.id)
      const cur = a.pts[a.i]
      if (cur.node) a.pts = [cur, ...toSeatPath(slot, cur.node)]
      else if (cur.exit !== undefined) a.pts = [...exitWPs(slot).slice(0, cur.exit).reverse(), seatWP(slot)]
      else if (cur.via) a.pts = [...(cur.back ? [{ ...cur.back }] : [cur]), nodeWP(cur.via), ...toSeatPath(slot, cur.via)]
      a.pts = trim(a.pts, a)
      a.i = 0
      a.dest = 'seat'
    }
    const tgt = a.pts[a.i]
    const dx = tgt.x - a.x, dz = tgt.z - a.z
    const d = Math.hypot(dx, dz)
    let speed = WALK_SPEED

    // ── Né người khác: cùng đi sang phải; bạn chắn ngay trước mặt thì đứng chờ ──
    if (d > 1e-4) {
      const fx = dx / d, fz = dz / d
      const rx = -fz, rz = fx
      let blocked = false
      const avoid = (ox: number, oz: number, isPlayer: boolean, still: boolean) => {
        const vx = ox - a.x, vz = oz - a.z
        const od = Math.hypot(vx, vz)
        if (od > PERSONAL || od < 1e-4) return
        const ahead = (vx * fx + vz * fz) / od
        if (ahead < 0.2) return
        // Mục tiêu ở ngay sau người kia (vd ghế bên cạnh) thì không cần né
        if (d < od) return
        const push = (PERSONAL - od) * 1.8 * dt
        a.x += rx * push
        a.z += rz * push
        if (ahead > 0.75 && od < 0.6) {
          if (isPlayer) blocked = true
          else if (still) speed *= 0.5
        }
      }
      for (const o of actors.values()) if (o !== a) avoid(o.x, o.z, false, o.where !== 'walk')
      avoid(player.x, player.z, true, true)
      if (blocked) {
        speed = 0
        a.blockedFor += dt
        if (a.blockedFor > 1.2) excuse(a)
      } else a.blockedFor = 0
    }

    const step = speed * dt
    if (d <= Math.max(step, 1e-4)) {
      a.x = tgt.x
      a.z = tgt.z
      a.i++
      if (a.i >= a.pts.length) {
        a.arrivedAt = t
        if (tgt.seat) {
          a.where = 'seat'
          a.timer = rand(8, 20)
        } else if (tgt.stand) {
          a.where = 'visit'
          a.node = tgt.via!
          a.back = tgt.back!
          const m = a.visitOf ? actors.get(a.visitOf) : undefined
          a.lookAt = m ? { x: m.slot.seat.x, z: m.slot.seat.z } : null
          a.visitTalked = false
          a.timer = 12
        } else {
          a.where = 'spot'
          a.node = tgt.node ?? null
          a.timer = rand(12, 26)
          onArrive(a)
        }
      }
    } else if (step > 0) {
      a.x += (dx / d) * step
      a.z += (dz / d) * step
      a.yaw = lerpAngle(a.yaw, Math.atan2(dx, dz), damp(10, dt))
    }
  }

  // ── Dáng, nét mặt, hướng nhìn ──
  const speaking = isSpeaking(a.id)
  let seat = false
  let lift = 0
  let mode: PoseMode = 'stand'
  let yawTo: number | null = null
  if (a.where === 'seat') {
    seat = true
    mode =
      // Đang làm mà vẫn chờ bạn: gõ phím, thỉnh thoảng giơ tay
      ask && (st !== 'running' || Math.sin(t * 0.6 + a.phase) > 0.35) ? 'raise' :
      st === 'running' ? 'type' :
      st === 'paused' ? 'sleep' :
      st === 'error' ? (Math.sin(t * 0.7 + a.phase) > -0.2 ? 'facepalm' : 'sit') :
      speaking ? 'talk' : 'sit'
    yawTo = slot.yaw
  } else if (a.where === 'spot') {
    const n = GRAPH.nodes[a.node!]
    seat = n.sit !== undefined
    lift = n.sit ?? 0
    const base = (n.act && ACT_POSE[n.act]) || (seat ? 'sit' : 'stand')
    mode = speaking && base !== 'play' ? 'talk' : base
    yawTo = !seat && a.face && a.faceUntil > t ? Math.atan2(a.face.x - a.x, a.face.z - a.z) : n.yaw ?? null
  } else if (a.where === 'visit') {
    mode = speaking ? 'talk' : 'stand'
    if (a.lookAt) yawTo = Math.atan2(a.lookAt.x - a.x, a.lookAt.z - a.z)
    if (a.face && a.faceUntil > t) yawTo = Math.atan2(a.face.x - a.x, a.face.z - a.z)
  } else {
    mode = 'walk'
  }
  if (a.where !== 'walk' && a.gesture && a.gestureUntil > t) mode = a.gesture
  if (yawTo !== null) a.yaw = lerpAngle(a.yaw, yawTo, damp(7, dt))

  let mood: Mood = st === 'running' ? 'focus' : st === 'error' ? 'shock' : 'normal'
  if (a.where === 'spot' && GRAPH.nodes[a.node!].act === 'foos') mood = 'happy'
  if (a.mood && a.moodUntil > t) mood = a.mood

  agentPos.set(a.id, { x: a.x, z: a.z })
  return { mode, mood, seat, lift }
}
