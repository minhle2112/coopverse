import { useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { lookOf, useLooks } from '../characters/look'
import { levelProgress, ranking, titleOf, useExp, weekStart, type RankBy } from '../data/exp'
import type { Agent } from '../data/types'
import { useCoop } from '../store'
import { B } from './Furniture'
import { FAME } from './layout'

const W = 2048
const H = Math.round((W * FAME.h) / FAME.w)
const PAD = 48
const HEAD = 150
const ROWS = 6
const FONT = '"Segoe UI", system-ui, sans-serif'

const GOLD = '#f2c14e'
const MEDAL = ['#f2c14e', '#c9d1db', '#d68a4c']

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Cắt tên dài cho vừa chiều rộng */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number) {
  if (ctx.measureText(text).width <= width) return text
  let t = text
  while (t && ctx.measureText(`${t}…`).width > width) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

const ddmm = (ms: number) => new Date(ms).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })

function drawColumn(ctx: CanvasRenderingContext2D, x: number, w: number, title: string, sub: string, by: RankBy, agents: Agent[]) {
  const { stats } = useExp.getState()
  const leads = new Set(agents.map((a) => a.reportsTo).filter(Boolean))
  const rows = ranking(agents, stats, by).filter((r) => r.exp > 0).slice(0, ROWS)
  const top = HEAD + 10

  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  rr(ctx, x, top, w, H - top - PAD + 10, 22)
  ctx.fill()
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = GOLD
  ctx.font = `800 40px ${FONT}`
  ctx.fillText(title, x + 28, top + 42)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = `500 28px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText(sub, x + w - 28, top + 44)

  const rowH = (H - top - PAD - 92) / ROWS
  if (!rows.length) {
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = `500 32px ${FONT}`
    ctx.fillText(by === 'week' ? 'Tuần mới, chưa ai có EXP' : 'Chưa có EXP nào', x + w / 2, top + 92 + rowH * 1.5)
  }
  rows.forEach((r, i) => {
    const y = top + 86 + i * rowH
    const cy = y + rowH / 2
    if (i < 3) {
      ctx.fillStyle = 'rgba(242,193,78,0.08)'
      rr(ctx, x + 14, y + 6, w - 28, rowH - 12, 16)
      ctx.fill()
    }
    // Hạng
    ctx.fillStyle = MEDAL[i] ?? 'rgba(255,255,255,0.18)'
    ctx.beginPath()
    ctx.arc(x + 62, cy, 28, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = i < 3 ? '#2a2f3a' : '#ffffff'
    ctx.font = `800 30px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(String(i + 1), x + 62, cy + 1)
    // Áo
    ctx.fillStyle = lookOf(r.agent.id, r.agent.name, leads.has(r.agent.id)).shirt
    ctx.beginPath()
    ctx.arc(x + 136, cy, 24, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = `800 24px ${FONT}`
    ctx.fillText(r.agent.name.slice(0, 1).toUpperCase(), x + 136, cy + 1)

    const lv = r.stats?.level ?? 1
    ctx.textAlign = 'right'
    ctx.fillStyle = '#ffffff'
    ctx.font = `800 44px ${FONT}`
    const num = r.exp.toLocaleString('vi-VN')
    ctx.fillText(num, x + w - 92, cy - 4)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = `700 24px ${FONT}`
    ctx.fillText('EXP', x + w - 30, cy)
    const numW = ctx.measureText(num).width

    ctx.textAlign = 'left'
    const nameX = x + 180
    const nameW = w - 180 - 92 - numW - 70
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 36px ${FONT}`
    ctx.fillText(fit(ctx, r.agent.name, nameW), nameX, cy - 18)
    ctx.fillStyle = GOLD
    ctx.font = `600 25px ${FONT}`
    ctx.fillText(fit(ctx, `Cấp ${lv} · ${titleOf(lv)}`, nameW), nameX, cy + 20)
    // Mọi lúc: thanh tiến độ tới cấp sau
    if (by === 'total' && r.stats) {
      const [have, need] = levelProgress(r.stats.total)
      const bw = Math.min(nameW, 300)
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      rr(ctx, nameX, cy + 40, bw, 8, 4)
      ctx.fill()
      ctx.fillStyle = GOLD
      rr(ctx, nameX, cy + 40, Math.max(8, (bw * have) / need), 8, 4)
      ctx.fill()
    }
  })
}

function drawFame(ctx: CanvasRenderingContext2D, agents: Agent[]) {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#23304a')
  g.addColorStop(1, '#161c2b')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 6
  rr(ctx, 14, 14, W - 28, H - 28, 26)
  ctx.stroke()

  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = GOLD
  ctx.font = `900 76px ${FONT}`
  ctx.fillText('BẢNG VÀNG', PAD + 10, HEAD / 2 + 8)
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = `500 30px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText('EXP: ticket xong · lượt chạy thành công · phiếu được duyệt · lời khen', W - PAD - 10, HEAD / 2 + 10)

  const colW = (W - PAD * 2 - 36) / 2
  drawColumn(ctx, PAD, colW, 'TUẦN NÀY', `từ thứ Hai ${ddmm(weekStart())}`, 'week', agents)
  drawColumn(ctx, PAD + colW + 36, colW, 'MỌI LÚC', 'cấp · tiến độ lên cấp', 'total', agents)
}

/** Bảng vàng treo tường nam cạnh cửa vào: xếp hạng EXP tuần này và mọi lúc. Đứng trước bảng bấm E để xem đủ. */
export function FameBoard() {
  const { canvas, tex } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 8
    return { canvas, tex }
  }, [])

  const agents = useCoop((s) => s.agents)
  const stats = useExp((s) => s.stats)
  const custom = useLooks((s) => s.custom)
  useEffect(() => {
    drawFame(canvas.getContext('2d')!, agents)
    tex.needsUpdate = true
  }, [agents, stats, custom, canvas, tex])

  const fw = FAME.w + 0.12, fh = FAME.h + 0.12
  return (
    <group position={[FAME.x, FAME.y, FAME.z]}>
      <B s={[fw, fh, 0.05]} p={[0, 0, 0.01]} c="#c99a3a" metal={0.3} rough={0.45} />
      <mesh position={[0, 0, -0.016]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[FAME.w, FAME.h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      {/* Ngôi sao trên đỉnh khung */}
      <mesh position={[0, fh / 2 + 0.12, -0.02]} rotation={[0, 0, Math.PI / 4]}>
        <octahedronGeometry args={[0.13, 0]} />
        <meshStandardMaterial color={GOLD} emissive="#a0700c" emissiveIntensity={0.8} metalness={0.4} roughness={0.35} flatShading />
      </mesh>
    </group>
  )
}
