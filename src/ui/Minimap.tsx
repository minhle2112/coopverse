import { useEffect, useRef } from 'react'
import { STATUS_COLOR } from '../data/types'
import { agentPos, player } from '../runtime'
import { useCoop } from '../store'
import { BOARD, DESK_D, DESK_W, LEAD_ROOM, MEET_ROOM, OFFICE, deskCenter, type World } from '../world/layout'

const PX = 7 // điểm ảnh mỗi mét
const W = (OFFICE.maxX - OFFICE.minX) * PX
const H = (OFFICE.maxZ - OFFICE.minZ) * PX
const sx = (x: number) => (x - OFFICE.minX) * PX
const sz = (z: number) => (z - OFFICE.minZ) * PX
const PING_MS = 5000

type Box = { minX: number; maxX: number; minZ: number; maxZ: number }
const PANTRY: Box = { minX: 9, maxX: 16, minZ: 3.6, maxZ: 11 }
const LOUNGE: Box = { minX: -16, maxX: -9, minZ: 3.6, maxZ: 11 }

function drawStatic(ctx: CanvasRenderingContext2D, world: World) {
  ctx.fillStyle = '#2b3242'
  ctx.fillRect(0, 0, W, H)

  const zone = (b: Box, fill: string, label: string, glass = false) => {
    ctx.fillStyle = fill
    ctx.fillRect(sx(b.minX), sz(b.minZ), (b.maxX - b.minX) * PX, (b.maxZ - b.minZ) * PX)
    if (glass) {
      ctx.strokeStyle = 'rgba(170, 215, 240, 0.7)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(sx(b.minX), sz(b.minZ), (b.maxX - b.minX) * PX, (b.maxZ - b.minZ) * PX)
    }
    ctx.fillStyle = 'rgba(244, 241, 234, 0.55)'
    ctx.font = '600 9px "Segoe UI", system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(label, sx((b.minX + b.maxX) / 2), sz(b.maxZ) - 4)
  }
  zone(LEAD_ROOM, 'rgba(122, 143, 184, 0.28)', 'Lead', true)
  zone(MEET_ROOM, 'rgba(138, 123, 176, 0.28)', 'Họp', true)
  zone(PANTRY, 'rgba(242, 181, 68, 0.14)', 'Bếp')
  zone(LOUNGE, 'rgba(79, 157, 148, 0.24)', 'Góc nghỉ')

  ctx.fillStyle = '#9b7a55'
  for (const s of world.slots) {
    const c = deskCenter(s)
    const side = Math.abs(Math.sin(s.yaw)) > 0.5
    const w = side ? DESK_D : DESK_W
    const d = side ? DESK_W : DESK_D
    ctx.fillRect(sx(c.x - w / 2), sz(c.z - d / 2), w * PX, d * PX)
  }

  // Bảng ticket trên tường nam
  ctx.fillStyle = '#f7f4ec'
  ctx.fillRect(sx(BOARD.x - BOARD.w / 2), sz(BOARD.z) - 3, BOARD.w * PX, 3)

  ctx.strokeStyle = '#dfe4ec'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, W - 2, H - 2)
  // Cửa vào ở tường nam
  ctx.fillStyle = '#c4553f'
  ctx.fillRect(sx(-0.75), H - 3, 1.5 * PX, 3)
}

/** Bản đồ nhỏ góc dưới phải: bắc ở trên, chấm màu theo trạng thái, mũi tên là bạn. */
export function Minimap({ world }: { world: World }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')!

    const bg = document.createElement('canvas')
    bg.width = W * dpr
    bg.height = H * dpr
    const bctx = bg.getContext('2d')!
    bctx.scale(dpr, dpr)
    drawStatic(bctx, world)

    // setInterval thay vì rAF: vẫn chạy khi tab bị ẩn, 10 khung/giây là đủ cho bản đồ
    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(bg, 0, 0)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const { agents, ping } = useCoop.getState()

      for (const a of agents) {
        const p = agentPos.get(a.id)
        if (!p) continue
        ctx.beginPath()
        ctx.arc(sx(p.x), sz(p.z), 3.4, 0, Math.PI * 2)
        ctx.fillStyle = STATUS_COLOR[a.status]
        ctx.fill()
        ctx.lineWidth = 1
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'
        ctx.stroke()
      }

      if (ping) {
        const t = performance.now() - ping.at
        const p = agentPos.get(ping.id)
        if (p && t < PING_MS) {
          const k = (t % 1000) / 1000
          ctx.beginPath()
          ctx.arc(sx(p.x), sz(p.z), 4 + k * 12, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(242, 181, 68, ${1 - k})`
          ctx.lineWidth = 2
          ctx.stroke()
        }
      }

      // Bạn: mũi tên theo hướng nhìn
      const fx = Math.sin(player.facing), fz = Math.cos(player.facing)
      const x = sx(player.x), z = sz(player.z)
      ctx.beginPath()
      ctx.moveTo(x + fx * 6, z + fz * 6)
      ctx.lineTo(x - fx * 3.5 + fz * 3.8, z - fz * 3.5 - fx * 3.8)
      ctx.lineTo(x - fx * 3.5 - fz * 3.8, z - fz * 3.5 + fx * 3.8)
      ctx.closePath()
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.strokeStyle = '#1d2230'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    draw()
    const id = setInterval(draw, 100)
    return () => clearInterval(id)
  }, [world])

  return (
    <div className="panel minimap">
      <canvas ref={ref} style={{ width: W, height: H }} />
    </div>
  )
}
