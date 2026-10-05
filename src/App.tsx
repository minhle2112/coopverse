import { useEffect, useMemo, useRef } from 'react'
import { deskTier, useExp } from './data/exp'
import { startExpSync } from './data/expSync'
import { startSync } from './data/sync'
import type { AgentStatus } from './data/types'
import { PixelScene } from './pixel/Scene'
import { useControls } from './player/useControls'
import { useCoop } from './store'
import { Hud } from './ui/Hud'
import { buildWorld } from './world/layout'

export default function App() {
  const stage = useRef<HTMLDivElement>(null)
  useControls(stage)
  useEffect(() => startSync(), [])
  useEffect(() => startExpSync(), [])

  const agents = useCoop((s) => s.agents)
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

  return (
    <>
      <div ref={stage} className="stage-wrap">
        <PixelScene world={world} tierOfSlot={tierOfSlot} tierKey={tierKey} statusOfSlot={statusOfSlot} />
      </div>
      <Hud world={world} />
    </>
  )
}
