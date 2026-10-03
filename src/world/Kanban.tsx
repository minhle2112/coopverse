import { useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { lookOf, useLooks } from '../characters/look'
import { COLUMNS, PRIORITY, groupIssues } from '../data/kanban'
import type { Agent, Issue } from '../data/types'
import { useCoop } from '../store'
import { B } from './Furniture'
import { BOARD } from './layout'

const W = 2048
const H = 1024
const PAD = 40
const GAP = 22
const HEAD = 110
const COL_HEAD = 64
const CARD_H = 132
const CARD_GAP = 14

const FONT = '"Segoe UI", system-ui, sans-serif'

/** Cắt chữ thành tối đa `max` dòng vừa chiều rộng. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (ctx.measureText(next).width <= width) { cur = next; continue }
    if (cur) lines.push(cur)
    cur = w
    if (lines.length === max) break
  }
  if (lines.length < max && cur) lines.push(cur)
  if (lines.length === max && words.join(' ').length > lines.join(' ').length) {
    let last = lines[max - 1]
    while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1)
    lines[max - 1] = `${last.trimEnd()}…`
  }
  return lines.slice(0, max)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Vẽ bảng ticket lên canvas (cùng cách chia cột với bảng HTML khi bấm E). */
function drawBoard(ctx: CanvasRenderingContext2D, issues: Issue[], agents: Agent[]) {
  const byId = new Map(agents.map((a) => [a.id, a]))
  const leads = new Set(agents.map((a) => a.reportsTo).filter(Boolean))
  const cols = groupIssues(issues)

  ctx.fillStyle = '#f7f4ec'
  ctx.fillRect(0, 0, W, H)

  // Tiêu đề
  ctx.fillStyle = '#2b3242'
  ctx.font = `800 54px ${FONT}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText('BẢNG TICKET', PAD, HEAD / 2 + 6)
  ctx.font = `600 32px ${FONT}`
  ctx.fillStyle = '#5b6270'
  ctx.textAlign = 'right'
  const today = cols.done.filter((i) => new Date(i.completedAt ?? i.updatedAt).toDateString() === new Date().toDateString()).length
  ctx.fillText(`${cols.doing.length} đang làm · ${cols.review.length} chờ duyệt · ${today} xong hôm nay`, W - PAD, HEAD / 2 + 8)

  const colW = (W - PAD * 2 - GAP * (COLUMNS.length - 1)) / COLUMNS.length
  const maxCards = Math.floor((H - HEAD - COL_HEAD - PAD + CARD_GAP) / (CARD_H + CARD_GAP))

  COLUMNS.forEach((c, ci) => {
    const x = PAD + ci * (colW + GAP)
    const list = cols[c.id]
    // Nền cột
    ctx.fillStyle = 'rgba(43, 50, 66, 0.06)'
    roundRect(ctx, x, HEAD, colW, H - HEAD - PAD + 14, 18)
    ctx.fill()
    // Đầu cột
    ctx.fillStyle = c.color
    roundRect(ctx, x, HEAD, colW, COL_HEAD - 10, 14)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = `800 32px ${FONT}`
    ctx.textAlign = 'left'
    ctx.fillText(c.label.toUpperCase(), x + 18, HEAD + (COL_HEAD - 10) / 2 + 2)
    ctx.textAlign = 'right'
    ctx.fillText(String(list.length), x + colW - 18, HEAD + (COL_HEAD - 10) / 2 + 2)

    const shown = list.length > maxCards ? list.slice(0, maxCards - 1) : list
    shown.forEach((i, k) => {
      const y = HEAD + COL_HEAD + k * (CARD_H + CARD_GAP)
      ctx.fillStyle = c.id === 'done' ? '#f1eee6' : '#ffffff'
      ctx.shadowColor = 'rgba(0,0,0,0.12)'
      ctx.shadowBlur = 8
      ctx.shadowOffsetY = 3
      roundRect(ctx, x + 8, y, colW - 16, CARD_H, 12)
      ctx.fill()
      ctx.shadowColor = 'transparent'
      // Vạch ưu tiên bên trái
      ctx.fillStyle = PRIORITY[i.priority ?? '']?.color ?? '#c9ccd4'
      roundRect(ctx, x + 8, y, 10, CARD_H, 5)
      ctx.fill()

      ctx.textAlign = 'left'
      ctx.fillStyle = '#2b3242'
      ctx.font = `800 28px ${FONT}`
      ctx.fillText(i.key, x + 32, y + 28)
      ctx.font = `500 25px ${FONT}`
      ctx.fillStyle = c.id === 'done' ? '#6b7280' : '#30363f'
      wrap(ctx, i.title, colW - 56, 2).forEach((ln, li) => ctx.fillText(ln, x + 32, y + 62 + li * 30))

      const who = i.assigneeId ? byId.get(i.assigneeId) : undefined
      if (who) {
        ctx.fillStyle = lookOf(who.id, who.name, leads.has(who.id)).shirt
        ctx.beginPath()
        ctx.arc(x + colW - 34, y + 26, 13, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.font = `800 16px ${FONT}`
        ctx.textAlign = 'center'
        ctx.fillText(who.name.slice(0, 1).toUpperCase(), x + colW - 34, y + 27)
      }
    })
    if (list.length > shown.length) {
      const y = HEAD + COL_HEAD + shown.length * (CARD_H + CARD_GAP)
      ctx.fillStyle = '#5b6270'
      ctx.font = `700 28px ${FONT}`
      ctx.textAlign = 'center'
      ctx.fillText(`+${list.length - shown.length} thẻ nữa`, x + colW / 2, y + 40)
    }
    if (!list.length) {
      ctx.fillStyle = 'rgba(91, 98, 112, 0.6)'
      ctx.font = `500 26px ${FONT}`
      ctx.textAlign = 'center'
      ctx.fillText('trống', x + colW / 2, HEAD + COL_HEAD + 50)
    }
  })
}

/** Bảng ticket treo tường nam, vẽ lại mỗi khi ticket hoặc agent đổi. */
export function KanbanBoard() {
  const { canvas, tex } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 8
    return { canvas, tex }
  }, [])

  const issues = useCoop((s) => s.issues)
  const agents = useCoop((s) => s.agents)
  // Đổi màu áo trong tủ đồ thì chấm người nhận trên thẻ cũng đổi theo
  const custom = useLooks((s) => s.custom)
  useEffect(() => {
    drawBoard(canvas.getContext('2d')!, issues, agents)
    tex.needsUpdate = true
  }, [issues, agents, custom, canvas, tex])

  const fw = BOARD.w + 0.12, fh = BOARD.h + 0.12
  return (
    <group position={[BOARD.x, BOARD.y, BOARD.z]}>
      <B s={[fw, fh, 0.05]} p={[0, 0, 0.01]} c="#6b4f3a" />
      <mesh position={[0, 0, -0.016]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[BOARD.w, BOARD.h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      {/* Khay bút dưới bảng */}
      <B s={[1.2, 0.04, 0.1]} p={[0.9, -fh / 2 - 0.02, -0.05]} c="#5d5048" />
      <B s={[0.14, 0.03, 0.03]} p={[0.6, -fh / 2 + 0.015, -0.06]} c="#ef5a4c" />
      <B s={[0.14, 0.03, 0.03]} p={[0.8, -fh / 2 + 0.015, -0.06]} c="#3b7dd8" />
    </group>
  )
}
