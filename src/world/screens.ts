import { CanvasTexture, SRGBColorSpace } from 'three'

const W = 256
const H = 160

function make(draw: (c: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  draw(ctx)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  return { canvas, ctx, tex }
}

// ── Màn hình đang chạy: các dòng "code" cuộn lên (giả lập CLI) ──
const COLORS = ['#7ee787', '#79c0ff', '#d2a8ff', '#e6edf3', '#e6edf3', '#ffa657']
const LINE_H = 11
type Line = { indent: number; segs: { w: number; c: string }[] }
const lines: Line[] = []
const newLine = (): Line => {
  const n = 1 + Math.floor(Math.random() * 4)
  return {
    indent: Math.floor(Math.random() * 3) * 10,
    segs: Array.from({ length: n }, () => ({ w: 12 + Math.random() * 50, c: COLORS[Math.floor(Math.random() * COLORS.length)] })),
  }
}
for (let i = 0; i < Math.ceil(H / LINE_H); i++) lines.push(newLine())

const code = make(() => {})

function drawCode() {
  const c = code.ctx
  c.fillStyle = '#0d1420'
  c.fillRect(0, 0, W, H)
  c.fillStyle = '#1b2638'
  c.fillRect(0, 0, W, 14)
  ;['#ef5a4c', '#f2b544', '#3ccf6e'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(9 + i * 10, 7, 3, 0, Math.PI * 2); c.fill() })
  lines.forEach((ln, i) => {
    let x = 8 + ln.indent
    const y = 20 + i * LINE_H
    for (const s of ln.segs) {
      c.fillStyle = s.c
      c.fillRect(x, y, s.w, 5)
      x += s.w + 5
    }
  })
  c.fillStyle = '#7ee787'
  c.fillRect(8, H - 10, 6, 7)
  code.tex.needsUpdate = true
}
drawCode()

let acc = 0
/** Gọi mỗi khung hình: cuộn thêm dòng mới (~9 lần/giây). */
export function tickScreens(dt: number) {
  acc += dt
  if (acc < 0.11) return
  acc = 0
  lines.shift()
  lines.push(newLine())
  drawCode()
}

export const codeTexture = code.tex

// ── Màn hình chờ (agent rảnh) ──
export const idleTexture = make((c) => {
  const g = c.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#2b5c8a')
  g.addColorStop(1, '#5aa3c9')
  c.fillStyle = g
  c.fillRect(0, 0, W, H)
  c.fillStyle = 'rgba(255,255,255,0.9)'
  c.font = 'bold 26px system-ui, sans-serif'
  c.textAlign = 'center'
  c.fillText('Coopverse', W / 2, H / 2 + 4)
  c.font = '14px system-ui, sans-serif'
  c.fillStyle = 'rgba(255,255,255,0.7)'
  c.fillText('đang chờ việc', W / 2, H / 2 + 26)
}).tex

// ── Màn hình lỗi ──
export const errorTexture = make((c) => {
  c.fillStyle = '#5a1414'
  c.fillRect(0, 0, W, H)
  c.fillStyle = '#ff8a7a'
  c.font = 'bold 30px system-ui, sans-serif'
  c.textAlign = 'center'
  c.fillText('LỖI', W / 2, H / 2 + 2)
  c.font = '13px ui-monospace, monospace'
  c.fillText('run failed · exit 1', W / 2, H / 2 + 26)
}).tex

// ── Màn hình ngủ (tạm dừng) ──
export const sleepTexture = make((c) => {
  c.fillStyle = '#141a26'
  c.fillRect(0, 0, W, H)
  c.fillStyle = '#5b6b8a'
  c.font = 'bold 28px system-ui, sans-serif'
  c.textAlign = 'center'
  c.fillText('z z z', W / 2, H / 2 + 8)
}).tex
