import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, type Group, type PerspectiveCamera } from 'three'
import { Character, type Pose } from '../characters/Character'
import { PLAYER_ID, useLook } from '../characters/look'
import { damp, lerpAngle } from '../lib/math'
import { agentPos, cam, dev, input, player } from '../runtime'
import { useCoop } from '../store'
import { BOARD, deskCenter, forward, rayHitCamBoxes, resolveCircle, type DeskSlot, type World } from '../world/layout'

const RADIUS = 0.3
const AGENT_RADIUS = 0.3
const WALK = 3.0
const RUN = 5.6
const EYE = 1.35
const INTERACT_DIST = 2.0
/** Đứng cách bảng ticket bao xa thì bấm E được */
const BOARD_DIST = 2.6

/** Tâm màn hình máy tính trên bàn (xem Desk trong Furniture.tsx): cao 1.165 m, lệch 0.18 m về phía trước bàn */
const SCREEN_Y = 1.165
const SCREEN_FWD = 0.18
const SCREEN_H = 0.36
const SCREEN_W = 0.6
/** Màn hình chiếm khoảng 80% khung hình khi zoom xong, khớp với khung CLI */
const SCREEN_FILL = 0.8

const _free = new Vector3()
const _freeLook = new Vector3()
const _focus = new Vector3()
const _focusLook = new Vector3()
/** Điểm điều khiển đường cong: trên cao, sau lưng ghế, để camera không xuyên qua màn hình bàn đối diện */
const _ctrl = new Vector3()

/** Thứ camera đang zoom vào: màn hình một bàn, hoặc bảng ticket */
type Target = { kind: 'desk'; slot: DeskSlot } | { kind: 'board' }

/**
 * Vị trí camera nhìn thẳng vào một mặt phẳng (tâm c, pháp tuyến hướng về người xem -f, rộng w, cao h)
 * sao cho mặt phẳng chiếm ~80% khung hình. Điểm điều khiển: trên cao, lùi xa hơn điểm đến.
 */
function faceView(cx: number, cy: number, cz: number, f: { x: number; z: number }, w: number, h: number, cam: PerspectiveCamera) {
  const tan = Math.tan((cam.fov * Math.PI) / 360)
  const d = Math.max(h / SCREEN_FILL, w / (SCREEN_FILL * cam.aspect)) / (2 * tan)
  _focusLook.set(cx, cy, cz)
  _focus.set(cx - f.x * d, cy, cz - f.z * d)
  const back = Math.max(1.4, d + 0.9)
  _ctrl.set(cx - f.x * back, Math.max(2.6, cy + 1.0), cz - f.z * back)
}

function targetView(tg: Target, cam: PerspectiveCamera) {
  if (tg.kind === 'board') return faceView(BOARD.x, BOARD.y, BOARD.z - 0.02, { x: 0, z: 1 }, BOARD.w, BOARD.h, cam)
  const f = forward(tg.slot.yaw)
  const c = deskCenter(tg.slot)
  faceView(c.x + f.x * SCREEN_FWD, SCREEN_Y, c.z + f.z * SCREEN_FWD, f, SCREEN_W, SCREEN_H, cam)
}

/** Đường cong Bézier bậc 2 từ a qua (gần) c tới b */
function bezier(out: Vector3, a: Vector3, c: Vector3, b: Vector3, t: number) {
  const u = 1 - t
  return out.set(
    u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    u * u * a.z + 2 * u * t * c.z + t * t * b.z,
  )
}

const smooth = (t: number) => t * t * (3 - 2 * t)

export function Player({ world }: { world: World }) {
  const look = useLook(PLAYER_ID, 'Bạn', false)
  const group = useRef<Group>(null!)
  const pose = useRef<Pose>({ mode: 'stand' })
  const camDist = useRef(cam.dist)
  const lastNear = useRef<string | null>(null)
  /** 0 = camera góc thứ 3, 1 = đang nhìn vào màn hình agent */
  const zoom = useRef(0)
  const focusTarget = useRef<Target | null>(null)
  const setNear = useCoop((s) => s.setNear)

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const k = input.keys

    // ── Di chuyển theo hướng camera ──
    const fwdIn = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)
    const rightIn = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)
    const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw)
    let mx = -sy * fwdIn + cy * rightIn
    let mz = -cy * fwdIn - sy * rightIn
    const len = Math.hypot(mx, mz)
    const running = k.has('ShiftLeft') || k.has('ShiftRight')
    if (len > 0) {
      mx /= len
      mz /= len
      const speed = running ? RUN : WALK
      player.x += mx * speed * dt
      player.z += mz * speed * dt
      player.facing = lerpAngle(player.facing, Math.atan2(mx, mz), damp(12, dt))
    }

    // ── Va chạm: tường/nội thất, rồi agent ──
    const p = { x: player.x, z: player.z }
    resolveCircle(p, RADIUS, world.colliders)
    for (const a of agentPos.values()) {
      const dx = p.x - a.x, dz = p.z - a.z
      const d = Math.hypot(dx, dz), min = RADIUS + AGENT_RADIUS
      if (d < min && d > 1e-5) { p.x = a.x + (dx / d) * min; p.z = a.z + (dz / d) * min }
    }
    resolveCircle(p, RADIUS, world.colliders)
    player.x = p.x
    player.z = p.z

    pose.current.mode = len > 0 ? (running ? 'run' : 'walk') : 'stand'
    group.current.position.set(player.x, 0, player.z)
    group.current.rotation.y = player.facing

    // ── Camera góc thứ 3, không xuyên tường ──
    const cp = Math.cos(cam.pitch)
    const dir: [number, number, number] = [sy * cp, Math.sin(cam.pitch), cy * cp]
    const hit = rayHitCamBoxes([player.x, EYE, player.z], dir, world.colliders)
    const want = Math.max(0.6, Math.min(cam.dist, hit - 0.25))
    camDist.current = want < camDist.current ? want : camDist.current + (want - camDist.current) * damp(6, dt)
    const d = camDist.current
    _free.set(player.x + dir[0] * d, EYE + dir[1] * d, player.z + dir[2] * d)
    _freeLook.set(player.x, EYE, player.z)

    // ── Zoom vào màn hình khi đang xem CLI, hoặc vào bảng ticket ──
    const { focusId, boardOpen } = useCoop.getState()
    const slot = focusId ? world.seatOf.get(focusId) ?? null : null
    const target: Target | null = slot ? { kind: 'desk', slot } : boardOpen ? { kind: 'board' } : null
    if (target) focusTarget.current = target
    const want01 = target ? 1 : 0
    zoom.current += (want01 - zoom.current) * damp(target ? 3.2 : 5, dt)
    if (Math.abs(want01 - zoom.current) < 0.002) zoom.current = want01
    // Camera bay tới sát màn hình / bảng: ẩn nhân vật để không che tầm nhìn
    group.current.visible = zoom.current < 0.35

    if (dev.overview && !zoom.current) {
      camera.position.set(0, 30, 17)
      camera.lookAt(0, 0, 0.5)
    } else if (zoom.current > 0 && focusTarget.current) {
      targetView(focusTarget.current, camera as PerspectiveCamera)
      // Quay đầu nhìn màn hình trước, rồi mới bay lại gần
      bezier(camera.position, _free, _ctrl, _focus, smooth(zoom.current))
      camera.lookAt(_freeLook.lerp(_focusLook, smooth(Math.min(1, zoom.current * 1.8))))
    } else {
      camera.position.copy(_free)
      camera.lookAt(_freeLook)
    }

    // ── Agent gần nhất (hoặc bảng ticket) để bấm E ──
    let best: string | null = null
    let bd = INTERACT_DIST
    for (const [id, a] of agentPos) {
      const dd = Math.hypot(a.x - player.x, a.z - player.z)
      if (dd < bd) { bd = dd; best = id }
    }
    // Khoảng cách tới mặt bảng (chỉ tính khi đứng trước bảng)
    const bx = Math.max(BOARD.x - BOARD.w / 2, Math.min(player.x, BOARD.x + BOARD.w / 2))
    const boardD = player.z < BOARD.z ? Math.hypot(player.x - bx, BOARD.z - player.z) : Infinity
    const board = boardD < BOARD_DIST && (!best || boardD - 0.8 < bd)
    if (board) best = null
    const key = board ? '#board' : best
    if (key !== lastNear.current) {
      lastNear.current = key
      setNear(best, board)
    }
  })

  return (
    <group ref={group}>
      <Character look={look} pose={pose} />
    </group>
  )
}
