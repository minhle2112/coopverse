import { useEffect, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { Group } from 'three'
import { Character, type Pose } from '../characters/Character'
import { useLook } from '../characters/look'
import type { Agent } from '../data/types'
import { damp, lerpAngle } from '../lib/math'
import { agentPos, lobbyPos, player } from '../runtime'
import { useCoop } from '../store'
import type { LOBBY } from '../world/layout'

const nameplateLayer = { current: document.getElementById('nameplates')! }

const HIDE_LABEL_DIST = 2.2
const LABEL_FULL_DIST = 5
/** Bạn lại gần thì ứng viên quay sang nhìn bạn */
const LOOK_DIST = 3.2

/**
 * Ứng viên chờ duyệt thuê: đứng ở sảnh cạnh cửa vào, cầm hồ sơ. Lại gần bấm E để xem hồ sơ và duyệt.
 * Không có bàn, không đi lại (chưa phải nhân viên).
 */
export function Candidate({ agent, spot }: { agent: Agent; spot: (typeof LOBBY)[number] }) {
  const group = useRef<Group>(null!)
  const pose = useRef<Pose>({ mode: 'cv' })
  const overhead = useRef<HTMLDivElement>(null)
  const yaw = useRef(spot.yaw)
  const look = useLook(agent.id, agent.name, false)

  useEffect(() => {
    agentPos.set(agent.id, { x: spot.x, z: spot.z })
    lobbyPos.set(agent.id, { x: spot.x, z: spot.z })
    return () => { agentPos.delete(agent.id) }
  }, [agent.id, spot])

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const pd = Math.hypot(player.x - spot.x, player.z - spot.z)
    const want = pd < LOOK_DIST ? Math.atan2(player.x - spot.x, player.z - spot.z) : spot.yaw
    yaw.current = lerpAngle(yaw.current, want, damp(4, dt))
    group.current.position.set(spot.x, 0, spot.z)
    group.current.rotation.y = yaw.current
    pose.current.mode = 'cv'
    pose.current.mood = pd < LOOK_DIST ? 'happy' : 'normal'

    const el = overhead.current
    if (el) {
      const d = Math.hypot(camera.position.x - spot.x, camera.position.y - 1.9, camera.position.z - spot.z)
      const vis = d < HIDE_LABEL_DIST ? 'hidden' : ''
      if (el.style.visibility !== vis) el.style.visibility = vis
      const tf = d < LABEL_FULL_DIST ? `scale(${(d / LABEL_FULL_DIST).toFixed(2)})` : ''
      if (el.style.transform !== tf) el.style.transform = tf
    }
  })

  return (
    <group ref={group}>
      <Character look={look} pose={pose} />
      <CandidateTag agent={agent} innerRef={overhead} />
    </group>
  )
}

function CandidateTag({ agent, innerRef }: { agent: Agent; innerRef: RefObject<HTMLDivElement | null> }) {
  const near = useCoop((s) => s.nearId === agent.id)
  const boss = useCoop((s) => s.agents.find((a) => a.id === agent.reportsTo)?.name)
  const hasAsk = useCoop((s) => s.asks.some((a) => a.candidateId === agent.id))
  return (
    <Html portal={nameplateLayer} position={[0, 1.95, 0]} center distanceFactor={12} zIndexRange={[10, 0]} pointerEvents="none">
      <div className="overhead" ref={innerRef}>
        {hasAsk && <div className="ask-mark mark-approval" aria-hidden>?</div>}
        <div className={`nameplate np-cand${near ? ' near' : ''}`}>
          <div className="np-row">
            <span className="np-cv" aria-hidden>📄</span>
            <span className="np-name">{agent.name}</span>
          </div>
          <div className="np-sub np-ask">Ứng viên{boss ? ` của ${boss}` : ''}</div>
        </div>
      </div>
    </Html>
  )
}
