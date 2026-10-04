import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, DoubleSide, MeshBasicMaterial, type Group, type Mesh } from 'three'
import { LEVEL_FX_MS, useExp } from '../data/exp'
import { agentPos } from '../runtime'

const DUR = LEVEL_FX_MS / 1000
const SPARKS = 18

/** Hiệu ứng lên cấp: vòng sáng loang trên sàn, cột sáng vàng, sao lấp lánh xoáy lên quanh agent. */
export function LevelFx() {
  const ups = useExp((s) => s.levelUps)
  return <>{ups.map((u) => <Burst key={u.id} agentId={u.agentId} />)}</>
}

function Burst({ agentId }: { agentId: string }) {
  const root = useRef<Group>(null!)
  const ring = useRef<Mesh>(null!)
  const column = useRef<Mesh>(null!)
  const sparkRoot = useRef<Group>(null!)
  const t0 = useRef<number | null>(null)

  const mats = useMemo(() => {
    const m = (color: string, opacity: number, add = false) =>
      new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, side: DoubleSide, ...(add ? { blending: AdditiveBlending } : {}) })
    return { ring: m('#ffd36b', 1), column: m('#ffe08a', 0.35, true), spark: m('#ffd23c', 1), spark2: m('#fff6d0', 1) }
  }, [])
  useEffect(() => () => Object.values(mats).forEach((x) => x.dispose()), [mats])

  // Mỗi tia sáng: góc, bán kính, tốc độ bay lên, cỡ (cố định cho mỗi lần lên cấp)
  const sparks = useMemo(
    () => Array.from({ length: SPARKS }, (_, i) => ({ a: (i / SPARKS) * Math.PI * 2, r: 0.35 + Math.random() * 0.3, v: 0.7 + Math.random() * 0.9, s: 0.035 + Math.random() * 0.035 })),
    [],
  )

  useFrame(({ clock }) => {
    if (t0.current === null) t0.current = clock.elapsedTime
    const t = clock.elapsedTime - t0.current
    const p = agentPos.get(agentId)
    if (p) root.current.position.set(p.x, 0, p.z)
    const k = Math.min(1, t / DUR)

    // Vòng loang ra rồi mờ dần (hai đợt)
    const w = (t % 0.9) / 0.9
    ring.current.scale.setScalar(0.4 + w * 1.6)
    mats.ring.opacity = Math.max(0, 1 - w) * (t < 1.8 ? 1 : 0)
    // Cột sáng: hiện nhanh, mờ dần
    mats.column.opacity = 0.35 * Math.min(1, t * 5) * (1 - k)
    column.current.scale.set(1 - k * 0.4, 0.4 + Math.min(1, t * 2) * 0.6, 1 - k * 0.4)
    column.current.position.y = column.current.scale.y * 1.3
    // Sao xoáy lên
    sparkRoot.current.children.forEach((c, i) => {
      const s = sparks[i]
      const a = s.a + t * 2.4
      const r = s.r + t * 0.12
      c.position.set(Math.sin(a) * r, 0.2 + t * s.v * 1.2, Math.cos(a) * r)
      c.rotation.set(t * 4, t * 3, 0)
    })
    mats.spark.opacity = mats.spark2.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3
  })

  return (
    <group ref={root}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} material={mats.ring}>
        <ringGeometry args={[0.55, 0.7, 40]} />
      </mesh>
      <mesh ref={column} material={mats.column}>
        <cylinderGeometry args={[0.45, 0.6, 2.6, 24, 1, true]} />
      </mesh>
      <group ref={sparkRoot}>
        {sparks.map((s, i) => (
          <mesh key={i} material={i % 2 ? mats.spark2 : mats.spark}>
            <octahedronGeometry args={[s.s, 0]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
