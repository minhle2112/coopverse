import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Graphics } from 'pixi.js'
import { JOBS, isClean, type CleanJob } from '../data/officeState'
import { useBalance, useOffice } from '../data/officeSync'
import { fmtXu } from '../data/xu'
import { useCoop } from '../store'
import { jobBox } from './dirt'
import { stage, ticks, toScreen, type Tick } from './stage'

/**
 * Chế độ dọn dẹp (phím B / nút chổi): khung quanh mỗi chỗ còn bẩn kèm giá, rê chuột thì sáng lên,
 * bấm thì chọn chỗ đó (bảng Dọn dẹp bên trái hỏi lại trước khi trả Xu).
 */

/** Chỗ bẩn đang được rê chuột lên (Scene cập nhật mỗi khung hình) */
export const cleanHover: { id: string | null } = { id: null }

/** Thứ tự bấm: thứ nhỏ nằm trên thứ lớn (bảng, cửa sổ trên tường; tường trên sàn) */
const ORDER: Record<CleanJob['kind'], number> = { board: 0, window: 1, wall: 2, floor: 3 }

/** Chỗ còn bẩn dưới điểm (x, y) pixel gốc */
export function jobAt(x: number, y: number): CleanJob | undefined {
  const o = useOffice.getState().office
  return JOBS.filter((j) => !isClean(o, j.id))
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
    .find((j) => {
      const r = jobBox(j)
      return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
    })
}

const HL = 0xf4d35e

/** Điểm đặt nhãn giá của một chỗ (pixel gốc). Mảng sàn đang chọn / rê: nhãn lên mép trên, không che chỗ bẩn. */
function labelAt(j: CleanJob, on: boolean) {
  const r = jobBox(j)
  // Cửa sổ, bảng: ngay dưới; tường: sát chân tường bên trái (không đè mép trên màn hình)
  if (j.kind === 'window' || j.kind === 'board') return { x: r.x + r.w / 2, y: r.y + r.h + 5 }
  if (j.kind === 'wall') return { x: r.x + 40, y: r.y + r.h - 7 }
  return { x: r.x + r.w / 2, y: on ? r.y + 9 : r.y + r.h / 2 }
}

export function CleanOverlay() {
  const open = useCoop((s) => s.cleanOpen)
  const pick = useCoop((s) => s.cleanPick)
  const office = useOffice((s) => s.office)
  const balance = useBalance()
  const labels = useRef(new Map<string, HTMLDivElement>())
  const dirty = open ? JOBS.filter((j) => !isClean(office, j.id)) : []

  // Khung chỗ đang rê / đang chọn (lớp fx, trên cả ngày/đêm) + đặt nhãn theo camera mỗi khung hình.
  // Lúc này ẩn bảng tên agent (body.clean-mode) cho bớt rối.
  useEffect(() => {
    if (!open || !stage.fx) return
    document.body.classList.add('clean-mode')
    const g = new Graphics()
    stage.fx.addChild(g)
    let last = ''
    const tick: Tick = (_dt, t) => {
      const o = useOffice.getState().office
      const sel = useCoop.getState().cleanPick
      const hv = cleanHover.id
      const ants = Math.floor(t * 8) % 4
      const key = `${hv}|${sel}|${Object.keys(o.cleaned).length}|${ants}`
      if (key !== last) {
        last = key
        g.clear()
        for (const id of new Set([hv, sel])) {
          const j = id ? JOBS.find((x) => x.id === id) : undefined
          if (!j || isClean(o, j.id)) continue
          const r = jobBox(j)
          g.rect(r.x, r.y, r.w, r.h).fill({ color: HL, alpha: j.id === sel ? 0.08 : 0.05 })
          // Viền tối bên ngoài để nét kiến bò nổi ở mức xa nhất
          g.rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2).stroke({ color: 0x2a1f14, alpha: 0.8, width: 1, alignment: 1 })
          // Viền sáng mảnh phía trong
          g.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2).stroke({ color: HL, alpha: 0.35, width: 1, alignment: 1 })
          // Viền "kiến bò": nét đứt 2 px chạy quanh khung
          const dash = (x0: number, y0: number, len: number, horiz: boolean) => {
            for (let k = ants; k < len; k += 4) {
              if (horiz) g.rect(x0 + k, y0, Math.min(2, len - k), 1).fill(HL)
              else g.rect(x0, y0 + k, 1, Math.min(2, len - k)).fill(HL)
            }
          }
          dash(r.x, r.y, r.w, true)
          dash(r.x, r.y + r.h - 1, r.w, true)
          dash(r.x, r.y, r.h, false)
          dash(r.x + r.w - 1, r.y, r.h, false)
        }
      }
      for (const [id, el] of labels.current) {
        const j = JOBS.find((x) => x.id === id)
        if (!j) continue
        const p = labelAt(j, id === hv || id === sel)
        const s = toScreen(p.x, p.y)
        el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`
        el.classList.toggle('hv', id === hv)
      }
    }
    ticks.add(tick)
    return () => {
      document.body.classList.remove('clean-mode')
      ticks.delete(tick)
      g.removeFromParent()
      g.destroy()
    }
  }, [open])

  if (!open || !stage.overlay) return null
  return createPortal(
    <>
      {dirty.map((j) => (
        <div
          key={j.id}
          className={`px-anchor clean-tag${balance >= j.price ? ' ok' : ' poor'}${pick === j.id ? ' on' : ''}`}
          style={{ transform: 'translate(-9999px, -9999px)' }}
          ref={(el) => { if (el) labels.current.set(j.id, el); else labels.current.delete(j.id) }}
        >
          {/* Chỉ số Xu; rê chuột / đang chọn thì hiện đủ "Dọn · 40 Xu" */}
          <span><i>Dọn · </i>{fmtXu(j.price)}<i> Xu</i></span>
        </div>
      ))}
    </>,
    stage.overlay,
  )
}
