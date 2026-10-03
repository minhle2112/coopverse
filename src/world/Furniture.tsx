import type { ReactNode } from 'react'
import type { Texture } from 'three'
import type { Furniture } from './layout'

type V3 = [number, number, number]

export function B({ s, p, c, r, rough = 0.85, shadow = true, metal = 0 }: { s: V3; p: V3; c: string; r?: V3; rough?: number; shadow?: boolean; metal?: number }) {
  return (
    <mesh position={p} rotation={r} castShadow={shadow} receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={rough} metalness={metal} flatShading />
    </mesh>
  )
}

function Cyl({ rt, rb, h, p, c, seg = 8 }: { rt: number; rb: number; h: number; p: V3; c: string; seg?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <cylinderGeometry args={[rt, rb, h, seg]} />
      <meshStandardMaterial color={c} roughness={0.85} flatShading />
    </mesh>
  )
}

function Place({ x, z, yaw = 0, children }: { x: number; z: number; yaw?: number; children: ReactNode }) {
  return <group position={[x, 0, z]} rotation={[0, yaw, 0]}>{children}</group>
}

// ───────────────────────── Bàn làm việc ─────────────────────────

export function Desk({ screen }: { screen: Texture | null }) {
  const leg = '#5d5048'
  return (
    <group>
      <B s={[1.4, 0.05, 0.75]} p={[0, 0.72, 0]} c="#f3efe6" />
      {[-0.65, 0.65].map((x) => (
        <group key={x}>
          <B s={[0.05, 0.7, 0.05]} p={[x, 0.35, -0.32]} c={leg} />
          <B s={[0.05, 0.7, 0.05]} p={[x, 0.35, 0.32]} c={leg} />
        </group>
      ))}
      <B s={[1.25, 0.32, 0.03]} p={[0, 0.5, 0.33]} c="#e3ddd0" />
      {/* Màn hình (mặt hướng về -z, phía người ngồi) */}
      <group position={[0, 0.745, 0.2]}>
        <B s={[0.22, 0.02, 0.16]} p={[0, 0.01, 0]} c="#2a2f3a" />
        <B s={[0.05, 0.22, 0.04]} p={[0, 0.12, 0.02]} c="#2a2f3a" />
        <B s={[0.66, 0.42, 0.04]} p={[0, 0.42, 0]} c="#2a2f3a" />
        <mesh position={[0, 0.42, -0.0215]} rotation={[0, Math.PI, 0]} userData={{ live: true }}>
          <planeGeometry args={[0.6, 0.36]} />
          {screen ? <meshBasicMaterial map={screen} toneMapped={false} /> : <meshStandardMaterial color="#0b0e14" roughness={0.3} />}
        </mesh>
      </group>
      {/* Bàn phím + chuột + cốc */}
      <B s={[0.42, 0.02, 0.14]} p={[0, 0.755, -0.12]} c="#d8dbe2" />
      <B s={[0.06, 0.02, 0.09]} p={[0.32, 0.755, -0.12]} c="#d8dbe2" />
      <Cyl rt={0.04} rb={0.035} h={0.1} p={[-0.5, 0.795, 0.05]} c="#e0784f" />
    </group>
  )
}

export function OfficeChair({ color = '#3d4451' }: { color?: string }) {
  return (
    <group>
      <B s={[0.5, 0.08, 0.48]} p={[0, 0.43, 0]} c={color} />
      <B s={[0.48, 0.5, 0.07]} p={[0, 0.74, -0.25]} c={color} r={[-0.08, 0, 0]} />
      <Cyl rt={0.03} rb={0.03} h={0.35} p={[0, 0.22, 0]} c="#22262e" />
      <Cyl rt={0.28} rb={0.28} h={0.04} p={[0, 0.04, 0]} c="#22262e" seg={5} />
    </group>
  )
}

// ───────────────────────── Đồ trang trí ─────────────────────────

function Plant({ big }: { big: boolean }) {
  const s = big ? 1 : 0.62
  return (
    <group scale={s}>
      <Cyl rt={0.24} rb={0.18} h={0.42} p={[0, 0.21, 0]} c="#c4704f" seg={7} />
      <Cyl rt={0.22} rb={0.22} h={0.03} p={[0, 0.42, 0]} c="#4a3426" seg={7} />
      {[
        [0, 0.85, 0, 0.36],
        [0.14, 1.12, 0.05, 0.26],
        [-0.12, 1.05, -0.08, 0.28],
        [0.02, 1.32, -0.02, 0.2],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} castShadow>
          <icosahedronGeometry args={[r, 0]} />
          <meshStandardMaterial color={i % 2 ? '#4d9a52' : '#3f8a4a'} roughness={0.9} flatShading />
        </mesh>
      ))}
      <Cyl rt={0.03} rb={0.03} h={0.5} p={[0, 0.65, 0]} c="#5d4636" />
    </group>
  )
}

const BOOK = ['#d65f7c', '#4f9d94', '#f0b84d', '#6c8ed8', '#e0784f', '#8fbf5a', '#9b7bd0']
function Bookshelf() {
  return (
    <group>
      <B s={[1.6, 2.0, 0.4]} p={[0, 1.0, 0]} c="#8a6a4f" />
      {[0.42, 0.88, 1.34, 1.8].map((y, row) => (
        <group key={y}>
          <B s={[1.5, 0.36, 0.02]} p={[0, y - 0.04, 0.19]} c="#5e4634" shadow={false} />
          {Array.from({ length: 7 }, (_, i) => (
            <B key={i} s={[0.13, 0.28 + ((i + row) % 3) * 0.03, 0.26]} p={[-0.6 + i * 0.19 + (row % 2) * 0.05, y - 0.06, 0.1]} c={BOOK[(i + row * 2) % BOOK.length]} shadow={false} />
          ))}
        </group>
      ))}
    </group>
  )
}

function Sofa() {
  const c = '#5867a8'
  return (
    <group>
      <B s={[2.4, 0.42, 0.9]} p={[0, 0.21, 0]} c={c} />
      <B s={[2.4, 0.5, 0.22]} p={[0, 0.62, -0.34]} c={c} />
      <B s={[0.22, 0.32, 0.9]} p={[-1.09, 0.56, 0]} c={c} />
      <B s={[0.22, 0.32, 0.9]} p={[1.09, 0.56, 0]} c={c} />
      <B s={[0.95, 0.12, 0.66]} p={[-0.5, 0.48, 0.08]} c="#6a7abb" />
      <B s={[0.95, 0.12, 0.66]} p={[0.5, 0.48, 0.08]} c="#6a7abb" />
      <B s={[0.36, 0.34, 0.12]} p={[-0.75, 0.68, -0.18]} c="#f0b84d" r={[-0.2, 0.2, 0]} />
    </group>
  )
}

function CoffeeTable() {
  return (
    <group>
      <B s={[1.2, 0.06, 0.6]} p={[0, 0.38, 0]} c="#b8875c" />
      {[[-0.52, -0.24], [0.52, -0.24], [-0.52, 0.24], [0.52, 0.24]].map(([x, z]) => (
        <B key={`${x}${z}`} s={[0.05, 0.36, 0.05]} p={[x, 0.18, z]} c="#7a5a3e" />
      ))}
      <B s={[0.24, 0.04, 0.18]} p={[0.25, 0.43, 0.05]} c="#e6e1d6" />
    </group>
  )
}

function Foosball() {
  return (
    <group>
      <B s={[1.3, 0.22, 0.75]} p={[0, 0.78, 0]} c="#3f6b45" />
      <B s={[1.2, 0.02, 0.65]} p={[0, 0.9, 0]} c="#5fae5f" shadow={false} />
      {[[-0.55, -0.28], [0.55, -0.28], [-0.55, 0.28], [0.55, 0.28]].map(([x, z]) => (
        <B key={`${x}${z}`} s={[0.08, 0.68, 0.08]} p={[x, 0.34, z]} c="#2f2f36" />
      ))}
      {[-0.42, -0.14, 0.14, 0.42].map((x, i) => (
        <group key={x}>
          <mesh position={[x, 0.95, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 1.05, 6]} />
            <meshStandardMaterial color="#c9ccd4" metalness={0.6} roughness={0.3} />
          </mesh>
          {[-0.18, 0, 0.18].map((z) => (
            <B key={z} s={[0.05, 0.12, 0.04]} p={[x, 0.93, z]} c={i % 2 ? '#e0574f' : '#4f7fe0'} shadow={false} />
          ))}
        </group>
      ))}
    </group>
  )
}

function Counter({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B s={[w, 0.9, d]} p={[0, 0.45, 0]} c="#e9e4da" />
      <B s={[w + 0.06, 0.05, d + 0.04]} p={[0, 0.925, 0]} c="#6d6f78" />
      {Array.from({ length: Math.floor(d / 0.6) }, (_, i) => (
        <B key={i} s={[0.02, 0.06, 0.02]} p={[-w / 2 - 0.01, 0.75, -d / 2 + 0.3 + i * 0.6]} c="#8a8d96" shadow={false} />
      ))}
    </group>
  )
}

function CoffeeMachine() {
  return (
    <group position={[0, 0.95, 0]}>
      <B s={[0.38, 0.5, 0.36]} p={[0, 0.25, 0]} c="#2c2f36" />
      <B s={[0.3, 0.12, 0.05]} p={[0, 0.4, 0.18]} c="#4a4e58" />
      <B s={[0.04, 0.04, 0.02]} p={[0.08, 0.4, 0.21]} c="#3ccf6e" shadow={false} />
      <Cyl rt={0.045} rb={0.04} h={0.1} p={[0, 0.06, 0.12]} c="#f3efe6" />
    </group>
  )
}

function Fridge() {
  return (
    <group>
      <B s={[0.8, 1.9, 0.75]} p={[0, 0.95, 0]} c="#dfe5ea" rough={0.4} />
      <B s={[0.78, 0.02, 0.02]} p={[0, 1.25, 0.38]} c="#9aa3ad" shadow={false} />
      <B s={[0.04, 0.4, 0.04]} p={[0.3, 1.5, 0.39]} c="#9aa3ad" shadow={false} />
      <B s={[0.04, 0.5, 0.04]} p={[0.3, 0.75, 0.39]} c="#9aa3ad" shadow={false} />
    </group>
  )
}

function HighTable() {
  return (
    <group>
      <Cyl rt={0.45} rb={0.45} h={0.05} p={[0, 1.05, 0]} c="#f3efe6" seg={12} />
      <Cyl rt={0.04} rb={0.04} h={1.0} p={[0, 0.52, 0]} c="#2f3340" />
      <Cyl rt={0.25} rb={0.25} h={0.04} p={[0, 0.02, 0]} c="#2f3340" seg={10} />
    </group>
  )
}

function Stool() {
  return (
    <group>
      <Cyl rt={0.19} rb={0.19} h={0.06} p={[0, 0.72, 0]} c="#e0784f" seg={10} />
      <Cyl rt={0.025} rb={0.025} h={0.7} p={[0, 0.36, 0]} c="#2f3340" />
      <Cyl rt={0.17} rb={0.17} h={0.03} p={[0, 0.02, 0]} c="#2f3340" seg={10} />
    </group>
  )
}

function MeetingTable() {
  return (
    <group>
      <B s={[3.2, 0.06, 1.4]} p={[0, 0.74, 0]} c="#9a7354" />
      <B s={[0.12, 0.7, 0.9]} p={[-1.1, 0.36, 0]} c="#3a3d46" />
      <B s={[0.12, 0.7, 0.9]} p={[1.1, 0.36, 0]} c="#3a3d46" />
      <B s={[0.3, 0.02, 0.2]} p={[0.4, 0.78, 0.1]} c="#2c2f36" />
    </group>
  )
}

function Tv() {
  return (
    <group position={[0, 1.65, 0]}>
      <B s={[2.0, 1.1, 0.06]} p={[0, 0, 0]} c="#1c1f26" />
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[1.88, 0.98]} />
        <meshBasicMaterial color="#26476b" toneMapped={false} />
      </mesh>
      <B s={[0.9, 0.06, 0.01]} p={[-0.3, 0.2, 0.04]} c="#79c0ff" shadow={false} />
      <B s={[1.3, 0.04, 0.01]} p={[0, 0.0, 0.04]} c="#a8c8e8" shadow={false} />
      <B s={[1.1, 0.04, 0.01]} p={[-0.1, -0.12, 0.04]} c="#a8c8e8" shadow={false} />
    </group>
  )
}

function WaterCooler() {
  return (
    <group>
      <B s={[0.38, 0.9, 0.38]} p={[0, 0.45, 0]} c="#e9edf1" />
      <Cyl rt={0.15} rb={0.17} h={0.38} p={[0, 1.1, 0]} c="#8cc8f0" seg={10} />
      <B s={[0.06, 0.04, 0.04]} p={[0, 0.65, 0.21]} c="#4f7fe0" shadow={false} />
    </group>
  )
}

function Beanbag({ color }: { color: string }) {
  return (
    <mesh position={[0, 0.25, 0]} scale={[1, 0.62, 1]} castShadow receiveShadow>
      <icosahedronGeometry args={[0.42, 1]} />
      <meshStandardMaterial color={color} roughness={0.95} flatShading />
    </mesh>
  )
}

function Door() {
  return (
    <group>
      <B s={[1.5, 2.3, 0.08]} p={[0, 1.15, 0]} c="#7a5a3e" />
      <B s={[0.7, 2.2, 0.05]} p={[-0.37, 1.1, -0.05]} c="#a37b55" />
      <B s={[0.7, 2.2, 0.05]} p={[0.37, 1.1, -0.05]} c="#a37b55" />
      <B s={[0.04, 0.3, 0.04]} p={[-0.08, 1.1, -0.1]} c="#d9c27a" metal={0.6} rough={0.3} />
      <B s={[0.04, 0.3, 0.04]} p={[0.08, 1.1, -0.1]} c="#d9c27a" metal={0.6} rough={0.3} />
    </group>
  )
}

export function FurnitureItem({ f }: { f: Furniture }) {
  let el: ReactNode = null
  switch (f.kind) {
    case 'plant': el = <Plant big />; break
    case 'plantSmall': el = <Plant big={false} />; break
    case 'bookshelf': el = <Bookshelf />; break
    case 'sofa': el = <Sofa />; break
    case 'coffeeTable': el = <CoffeeTable />; break
    case 'foosball': el = <Foosball />; break
    case 'counter': el = <Counter w={f.w ?? 1} d={f.d ?? 1} />; break
    case 'coffeeMachine': el = <CoffeeMachine />; break
    case 'fridge': el = <Fridge />; break
    case 'highTable': el = <HighTable />; break
    case 'stool': el = <Stool />; break
    case 'meetingTable': el = <MeetingTable />; break
    case 'meetingChair': el = <OfficeChair color="#7a6aa8" />; break
    case 'tv': el = <Tv />; break
    case 'waterCooler': el = <WaterCooler />; break
    case 'beanbag': el = <Beanbag color={f.color ?? '#e0784f'} />; break
    case 'door': el = <Door />; break
    case 'rug':
      return (
        <mesh position={[f.x, 0.012, f.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[f.w ?? 2, f.d ?? 2]} />
          <meshStandardMaterial color={f.color ?? '#888'} roughness={1} />
        </mesh>
      )
  }
  return <Place x={f.x} z={f.z} yaw={f.yaw}>{el}</Place>
}
