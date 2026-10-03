import { useEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { AgentActor } from './agents/AgentActor'
import { SoundDirector } from './audio/SoundDirector'
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
import { buildWorld } from './world/layout'
import { KanbanBoard } from './world/Kanban'
import { Office } from './world/Office'

export default function App() {
  const stage = useRef<HTMLDivElement>(null)
  useControls(stage)
  useEffect(() => startSync(), [])

  const agents = useCoop((s) => s.agents)
  const quality = useSettings((s) => s.quality)
  // Bố cục chỉ dựng lại khi sơ đồ tổ chức đổi, không phải khi trạng thái đổi
  const orgKey = agents.map((a) => `${a.id}>${a.reportsTo}`).join('|')
  const world = useMemo(() => buildWorld(useCoop.getState().agents), [orgKey])

  const statusOfSlot = useMemo(() => {
    const m = new Map<string, AgentStatus>()
    for (const a of agents) {
      const s = world.seatOf.get(a.id)
      if (s) m.set(s.id, a.status)
    }
    return m
  }, [agents, world])

  const leadIds = useMemo(() => new Set(agents.map((a) => a.reportsTo).filter(Boolean)), [agents])

  return (
    <>
      <div id="stage" ref={stage}>
        <Canvas shadows dpr={quality === 'low' ? 1 : [1, 2]} camera={{ fov: 55, near: 0.1, far: 300, position: [0, 4, 15] }}>
          <AutoQuality />
          <DayNight />
          <SoundDirector />
          <Office world={world} statusOfSlot={statusOfSlot} />
          <KanbanBoard />
          <OfficeLife />
          {agents
            .filter((a) => a.status !== 'terminated' && world.seatOf.has(a.id))
            .map((a) => (
              <AgentActor key={a.id} agent={a} slot={world.seatOf.get(a.id)!} isLead={leadIds.has(a.id)} />
            ))}
          <Player world={world} />
          {import.meta.env.DEV && <DevHooks />}
        </Canvas>
      </div>
      <Hud world={world} />
    </>
  )
}
