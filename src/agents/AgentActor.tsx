import { useEffect, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { Group } from 'three'
import { Character, type Pose } from '../characters/Character'
import { useLook } from '../characters/look'
import { titleOf, useExp, useLevel } from '../data/exp'
import { STATUS_COLOR, STATUS_LABEL, type Agent } from '../data/types'
import { actorFor, dropActor, placeActor, stepActor, type Asking } from '../life/brain'
import { reactToStatus } from '../life/director'
import { useLife } from '../life/store'
import { useCoop } from '../store'
import type { DeskSlot } from '../world/layout'

/**
 * Lớp DOM cố định cho bảng tên. Nếu để drei tự chọn chỗ gắn, chỗ đó đổi khi Canvas nối sự kiện xong,
 * và agent nào xuất hiện sau lượt render đầu (dữ liệu Paperclip về muộn) sẽ bị gỡ root giữa lúc render.
 */
const nameplateLayer = { current: document.getElementById('nameplates')! }

/** Agent sát camera thì ẩn chữ trên đầu (nếu không, bảng tên phóng to che màn hình) */
const HIDE_LABEL_DIST = 2.2
/** Gần hơn khoảng này thì bảng tên thôi phóng to (giữ cỡ như lúc ở 5 m) */
const LABEL_FULL_DIST = 5

/**
 * Một agent trong văn phòng 3D. Di chuyển, chọn chỗ, dáng do life/brain quyết định; ở đây chỉ vẽ.
 * Lời thoại và hội thoại do life/director điều khiển.
 */
export function AgentActor({ agent, slot, isLead }: { agent: Agent; slot: DeskSlot; isLead: boolean }) {
  const group = useRef<Group>(null!)
  const pose = useRef<Pose>({ mode: 'sit' })
  const overhead = useRef<HTMLDivElement>(null)
  const status = useRef(agent.status)
  status.current = agent.status
  const look = useLook(agent.id, agent.name, isLead)
  const asking = useCoop((s): Asking => {
    const mine = s.asks.filter((a) => a.agentId === agent.id)
    return !mine.length ? null : mine.some((a) => a.kind === 'approval') ? 'approval' : 'question'
  })
  const askingRef = useRef(asking)
  askingRef.current = asking

  const actorRef = useRef(actorFor(agent.id, slot))

  useEffect(() => placeActor(actorRef.current, slot), [slot])
  useEffect(() => () => dropActor(agent.id), [agent.id])

  // Trạng thái đổi → biểu tượng, dáng, câu nói (bỏ qua lần đầu)
  const prev = useRef({ status: agent.status, task: agent.task })
  useEffect(() => {
    const p = prev.current
    if (p.status !== agent.status) reactToStatus(agent, p.status, p.task)
    prev.current = { status: agent.status, task: agent.task }
  }, [agent])

  useFrame(({ camera }, dt) => {
    const a = actorRef.current
    const b = stepActor(a, status.current, askingRef.current, dt)
    const p = pose.current
    p.mode = b.mode
    p.mood = b.mood
    p.seat = b.seat
    p.lift = b.lift
    group.current.position.set(a.x, 0, a.z)
    group.current.rotation.y = a.yaw

    const el = overhead.current
    if (el) {
      const d = Math.hypot(camera.position.x - a.x, camera.position.y - 1.9, camera.position.z - a.z)
      const vis = d < HIDE_LABEL_DIST ? 'hidden' : ''
      if (el.style.visibility !== vis) el.style.visibility = vis
      // Html của drei phóng to theo 1/khoảng cách; thu lại khi ở gần để bảng tên không che màn hình
      const tf = d < LABEL_FULL_DIST ? `scale(${(d / LABEL_FULL_DIST).toFixed(2)})` : ''
      if (el.style.transform !== tf) el.style.transform = tf
    }
  })

  return (
    <group ref={group}>
      <Character look={look} pose={pose} />
      <Overhead agent={agent} innerRef={overhead} asking={asking} />
    </group>
  )
}

/** Biểu tượng thường trực theo trạng thái */
const STATUS_EMOTE: Partial<Record<Agent['status'], string>> = { paused: '💤', error: '❗' }

/** Trên đầu agent: bong bóng thoại, biểu tượng cảm xúc, bảng tên. */
function Overhead({ agent, innerRef, asking }: { agent: Agent; innerRef: RefObject<HTMLDivElement | null>; asking: Asking }) {
  const near = useCoop((s) => s.nearId === agent.id)
  const bubble = useLife((s) => s.bubbles[agent.id])
  const em = useLife((s) => s.emotes[agent.id])
  // Dấu "?" chờ bạn thay cho biểu tượng trạng thái (💤, ❗); biểu cảm thoáng qua vẫn hiện trước
  const icon = em?.icon ?? (asking ? null : STATUS_EMOTE[agent.status])
  const lv = useLevel(agent.id)
  // +EXP vừa nhận và lên cấp: chỉ hiện khi còn mới (bảng tên dựng lại sau đó thì không chạy lại hiệu ứng)
  const pop = useExp((s) => s.pops[agent.id])
  const up = useExp((s) => s.levelUps.find((u) => u.agentId === agent.id))
  const fresh = pop && Date.now() - pop.at < 2500
  return (
    <Html portal={nameplateLayer} position={[0, 1.95, 0]} center distanceFactor={12} zIndexRange={[10, 0]} pointerEvents="none">
      <div className="overhead" ref={innerRef}>
        {bubble && (
          <div key={bubble.id} className={`bubble${bubble.real ? ' real' : ''}`}>
            {bubble.text}
          </div>
        )}
        {icon && (
          <div key={em?.id ?? agent.status} className={`emote${em ? ' pop' : ` st-${agent.status}`}`}>
            {icon}
          </div>
        )}
        {!icon && asking && <div className={`ask-mark mark-${asking}`} aria-hidden>?</div>}
        {up && <div key={up.id} className="lvup">⭐ LÊN CẤP {up.level}</div>}
        {fresh && <div key={pop.id} className="xp-pop">+{pop.amount} EXP</div>}
        <div className={`nameplate${near ? ' near' : ''}${lv >= 9 ? ' np-gold' : ''}`}>
          <div className="np-row">
            <span className="np-dot" style={{ background: STATUS_COLOR[agent.status] }} />
            <span className="np-lv" title={`Cấp ${lv}`}>{lv}</span>
            <span className="np-name">{agent.name}</span>
            {agent.demo && <span className="np-demo">demo</span>}
          </div>
          <div className="np-rank">{titleOf(lv)}</div>
          <div className={`np-sub${asking ? ' np-ask' : ''}`}>
            {asking === 'approval' ? '🙋 Chờ bạn duyệt' : asking ? '🙋 Chờ bạn trả lời' : agent.status === 'running' && agent.task ? agent.task : STATUS_LABEL[agent.status]}
          </div>
        </div>
      </div>
    </Html>
  )
}
