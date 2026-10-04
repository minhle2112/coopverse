import { useFrame } from '@react-three/fiber'
import type { AgentStatus } from '../data/types'
import { Baked } from './Bake'
import { windowMat } from './DayNight'
import { B, Desk, DeskExtras, FurnitureItem, OfficeChair } from './Furniture'
import { FURNITURE, LEAD_ROOM, MEET_ROOM, OFFICE, deskCenter, type World } from './layout'
import { codeTexture, errorTexture, idleTexture, sleepTexture, tickScreens } from './screens'

const WALL = '#efe6d8'
const WALL_TRIM = '#d9cbb5'

function Floor() {
  const { minX, maxX, minZ, maxZ } = OFFICE
  const zone = (x1: number, z1: number, x2: number, z2: number, color: string, y = 0.004) => (
    <mesh position={[(x1 + x2) / 2, y, (z1 + z2) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[x2 - x1, z2 - z1]} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  )
  return (
    <group>
      {/* Nền ngoài trời */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[140, 140]} />
        <meshStandardMaterial color="#9cc77a" roughness={1} />
      </mesh>
      {zone(minX, minZ, maxX, maxZ, '#c9a77c', 0.001)}
      {zone(LEAD_ROOM.minX, LEAD_ROOM.minZ, LEAD_ROOM.maxX, LEAD_ROOM.maxZ, '#b9c4d6')}
      {zone(MEET_ROOM.minX, MEET_ROOM.minZ, MEET_ROOM.maxX, MEET_ROOM.maxZ, '#c6bfd8')}
      {zone(9, 3.5, maxX, maxZ, '#e4e2dc')}
      {zone(minX, 3.5, -9, maxZ, '#d8c29d')}
      {/* Vạch lát sàn gỗ */}
      {Array.from({ length: 21 }, (_, i) => (
        <mesh key={i} position={[0, 0.003, minZ + 1 + i]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[17.6, 0.02]} />
          <meshBasicMaterial color="#b8956a" />
        </mesh>
      ))}
    </group>
  )
}

/** Tường ngoài có dãy cửa sổ. axis 'x' = tường chạy dọc trục x (tường bắc/nam). */
function WindowWall({ axis, at, from, to, windows }: { axis: 'x' | 'z'; at: number; from: number; to: number; windows: boolean }) {
  const { wallH, wallT } = OFFICE
  const len = to - from
  const mid = (from + to) / 2
  const seg = (a: number, b: number, y1: number, y2: number, color: string, key: string) => {
    const l = b - a, m = (a + b) / 2, h = y2 - y1
    const size: [number, number, number] = axis === 'x' ? [l, h, wallT] : [wallT, h, l]
    const pos: [number, number, number] = axis === 'x' ? [m, y1 + h / 2, at] : [at, y1 + h / 2, m]
    return <B key={key} s={size} p={pos} c={color} />
  }
  if (!windows) {
    return (
      <group>
        {seg(from, to, 0, wallH, WALL, 'w')}
        {seg(from, to, 0, 0.12, WALL_TRIM, 't')}
      </group>
    )
  }
  const n = Math.floor(len / 2.6)
  const step = len / n
  const out = [seg(from, to, 0, 0.95, WALL, 'sill'), seg(from, to, 2.45, wallH, WALL, 'head'), seg(from, to, 0.95, 1.0, WALL_TRIM, 'ledge')]
  for (let i = 0; i <= n; i++) {
    const c = from + i * step
    out.push(seg(c - 0.18, c + 0.18, 0.95, 2.45, WALL, `p${i}`))
  }
  return (
    <group>
      {out}
      <mesh position={axis === 'x' ? [mid, 1.7, at] : [at, 1.7, mid]} rotation={[0, axis === 'x' ? 0 : Math.PI / 2, 0]} material={windowMat} userData={{ live: true }}>
        <planeGeometry args={[len, 1.5]} />
      </mesh>
    </group>
  )
}

function GlassWall({ x1, z1, x2, z2 }: { x1: number; z1: number; x2: number; z2: number }) {
  const len = Math.hypot(x2 - x1, z2 - z1)
  const alongX = Math.abs(x2 - x1) > Math.abs(z2 - z1)
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2
  const s = (l: number, h: number, t: number): [number, number, number] => (alongX ? [l, h, t] : [t, h, l])
  const posts = Math.max(2, Math.round(len / 1.4) + 1)
  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, 1.3, 0]}>
        <boxGeometry args={s(len, 2.5, 0.05)} />
        <meshStandardMaterial color="#bfe3f5" transparent opacity={0.22} roughness={0.1} depthWrite={false} />
      </mesh>
      <B s={s(len, 0.08, 0.1)} p={[0, 0.04, 0]} c="#59606e" />
      <B s={s(len, 0.08, 0.1)} p={[0, 2.58, 0]} c="#59606e" />
      {Array.from({ length: posts }, (_, i) => {
        const o = -len / 2 + (i * len) / (posts - 1)
        return <B key={i} s={s(0.06, 2.6, 0.08)} p={alongX ? [o, 1.3, 0] : [0, 1.3, o]} c="#59606e" />
      })}
    </group>
  )
}

function Walls() {
  const { minX, maxX, minZ, maxZ } = OFFICE
  return (
    <group>
      <WindowWall axis="x" at={minZ} from={minX} to={maxX} windows />
      <WindowWall axis="x" at={maxZ} from={minX} to={-0.75} windows={false} />
      <WindowWall axis="x" at={maxZ} from={0.75} to={maxX} windows={false} />
      <B s={[1.5, OFFICE.wallH - 2.3, OFFICE.wallT]} p={[0, 2.3 + (OFFICE.wallH - 2.3) / 2, maxZ]} c={WALL} />
      <WindowWall axis="z" at={minX} from={minZ} to={maxZ} windows />
      <WindowWall axis="z" at={maxX} from={minZ} to={maxZ} windows />

      <GlassWall x1={LEAD_ROOM.maxX} z1={LEAD_ROOM.minZ} x2={LEAD_ROOM.maxX} z2={LEAD_ROOM.maxZ} />
      <GlassWall x1={LEAD_ROOM.minX} z1={LEAD_ROOM.maxZ} x2={LEAD_ROOM.door[0]} z2={LEAD_ROOM.maxZ} />
      <GlassWall x1={LEAD_ROOM.door[1]} z1={LEAD_ROOM.maxZ} x2={LEAD_ROOM.maxX} z2={LEAD_ROOM.maxZ} />
      <GlassWall x1={MEET_ROOM.minX} z1={MEET_ROOM.minZ} x2={MEET_ROOM.minX} z2={MEET_ROOM.maxZ} />
      <GlassWall x1={MEET_ROOM.minX} z1={MEET_ROOM.maxZ} x2={MEET_ROOM.door[0]} z2={MEET_ROOM.maxZ} />
      <GlassWall x1={MEET_ROOM.door[1]} z1={MEET_ROOM.maxZ} x2={MEET_ROOM.maxX} z2={MEET_ROOM.maxZ} />
    </group>
  )
}

function screenFor(status: AgentStatus | undefined) {
  switch (status) {
    case 'running': return codeTexture
    case 'idle': return idleTexture
    case 'paused': return sleepTexture
    case 'error': return errorTexture
    default: return null
  }
}

/** Ghế da cho agent cấp 7 trở lên (bậc bàn 3) */
const LEATHER = '#6b3f2a'

/**
 * `tierOfSlot`: bậc bàn theo cấp của agent ngồi đó (xem deskTier). Đổi bậc thì gộp lại khối tĩnh.
 */
export function Office({ world, statusOfSlot, tierOfSlot }: { world: World; statusOfSlot: Map<string, AgentStatus>; tierOfSlot: Map<string, number> }) {
  useFrame((_, dt) => tickScreens(dt))
  const bakeKey = world.slots.map((s) => `${s.id}@${s.zone}@${s.seat.x.toFixed(2)},${s.seat.z.toFixed(2)}@${tierOfSlot.get(s.id) ?? 0}`).join('|')
  return (
    <group>
      <Baked bakeKey={bakeKey}>
      <Floor />
      <Walls />
      {FURNITURE.map((f, i) => <FurnitureItem key={i} f={f} />)}
      {world.slots.map((s) => {
        const c = deskCenter(s)
        return (
          <group key={s.id}>
            <group position={[c.x, 0, c.z]} rotation={[0, s.yaw, 0]}>
              <Desk screen={screenFor(statusOfSlot.get(s.id))} />
              <DeskExtras tier={tierOfSlot.get(s.id) ?? 0} />
            </group>
            <group position={[s.seat.x, 0, s.seat.z]} rotation={[0, s.yaw, 0]}>
              <OfficeChair color={(tierOfSlot.get(s.id) ?? 0) >= 3 ? LEATHER : s.zone === 'lead' ? '#2d3a55' : '#3d4451'} />
            </group>
          </group>
        )
      })}
      </Baked>
    </group>
  )
}
