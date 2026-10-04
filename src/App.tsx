import { useEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { AgentActor } from './agents/AgentActor'
import { Candidate } from './agents/Candidate'
import { SoundDirector } from './audio/SoundDirector'
import { deskTier, useExp } from './data/exp'
import { startExpSync } from './data/expSync'
import { startSync } from './data/sync'
import type { AgentStatus } from './data/types'
import { DevHooks } from './dev/DevHooks'
import { OfficeLife } from './life/OfficeLife'
import { Player } from './player/Player'
import { useControls } from './player/useControls'
import { useSettings } from './settings'
import { useCoop } from './store'
import { AutoQuality } from './world/Quality'
import { Hud } from './ui/Hud'
import { DayNight } from './world/DayNight'
import { LOBBY, buildWorld } from './world/layout'
import { FameBoard } from './world/FameBoard'
import { KanbanBoard } from './world/Kanban'
import { LevelFx } from './world/LevelFx'
import { Office } from './world/Office'

export default function App() {
  const stage = useRef<HTMLDivElement>(null)
  useControls(stage)
  useEffect(() => startSync(), [])
  useEffect(() => startExpSync(), [])

  const agents = useCoop((s) => s.agents)
  const quality = useSettings((s) => s.quality)
  // Bố cục chỉ dựng lại khi sơ đồ tổ chức đổi, không phải khi trạng thái đổi
  const orgKey = agents.map((a) => `${a.id}>${a.reportsTo}${a.candidate ? '?' : ''}`).join('|')
  const world = useMemo(() => buildWorld(useCoop.getState().agents), [orgKey])

  const statusOfSlot = useMemo(() => {
    const m = new Map<string, AgentStatus>()
    for (const a of agents) {
      const s = world.seatOf.get(a.id)
      if (s) m.set(s.id, a.status)
    }
    return m
  }, [agents, world])

  // Bàn nâng cấp theo cấp: chỉ dựng lại khi bậc bàn của ai đó đổi
  const tierKey = useExp((s) => agents.map((a) => `${a.id}:${deskTier(s.stats[a.id]?.level ?? 1)}`).join('|'))
  const tierOfSlot = useMemo(() => {
    const m = new Map<string, number>()
    const { stats } = useExp.getState()
    for (const a of agents) {
      const s = world.seatOf.get(a.id)
      if (s) m.set(s.id, deskTier(stats[a.id]?.level ?? 1))
    }
    return m
  }, [tierKey, world])

  const leadIds = useMemo(() => new Set(agents.filter((a) => !a.candidate).map((a) => a.reportsTo).filter(Boolean)), [agents])
  // Ứng viên chờ duyệt thuê: đứng ở sảnh (tối đa số chỗ ở sảnh, còn lại xem trong danh sách Q)
  const candidates = agents.filter((a) => a.candidate && a.status !== 'terminated').slice(0, LOBBY.length)

  return (
    <>
      <div id="stage" ref={stage}>
        <Canvas shadows dpr={quality === 'low' ? 1 : [1, 2]} camera={{ fov: 55, near: 0.1, far: 300, position: [0, 4, 15] }}>
          <AutoQuality />
          <DayNight />
          <SoundDirector />
          <Office world={world} statusOfSlot={statusOfSlot} tierOfSlot={tierOfSlot} />
          <KanbanBoard />
          <FameBoard />
          <LevelFx />
          <OfficeLife />
          {agents
            .filter((a) => a.status !== 'terminated' && world.seatOf.has(a.id))
            .map((a) => (
              <AgentActor key={a.id} agent={a} slot={world.seatOf.get(a.id)!} isLead={leadIds.has(a.id)} />
            ))}
          {candidates.map((a, i) => <Candidate key={a.id} agent={a} spot={LOBBY[i]} />)}
          <Player world={world} />
          {import.meta.env.DEV && <DevHooks />}
        </Canvas>
      </div>
      <Hud world={world} />
    </>
  )
}
