import { useEffect, useState } from 'react'
import { EXP, levelProgress, titleOf, useExp } from '../data/exp'
import { giveKudos } from '../data/expSync'
import { KUDOS_NOTE_MAX } from '../data/ledger'
import type { Agent } from '../data/types'
import { useCoop } from '../store'

/**
 * Hộp khen một agent: +25 EXP, kèm lời khen tuỳ chọn. Chỉ ghi vào sổ của Coopverse trên máy này,
 * không gửi gì sang Paperclip, không đánh thức agent. Nằm trong khung đang mở (CLI hoặc bảng vàng).
 */
export function KudosDialog({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const showToast = useCoop((s) => s.showToast)

  // Esc chỉ đóng hộp này (chạy trước listener của useControls); E trong ô chữ là gõ chữ
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'KeyE') return
      if (e.code === 'KeyE' && e.target instanceof HTMLTextAreaElement) return
      e.stopImmediatePropagation()
      if (e.code === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [busy, onClose])

  async function send() {
    setBusy(true)
    setErr(null)
    try {
      await giveKudos(agent.id, note)
      showToast(`Đã khen ${agent.name} · +${EXP.kudos} EXP`)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Không lưu được lời khen')
      setBusy(false)
    }
  }

  return (
    <div className="t-modal" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="t-dialog" role="dialog" aria-label={`Khen ${agent.name}`}>
        <div className="t-dialog-title">👏 Khen {agent.name}</div>
        <p>
          {agent.name} được <b>+{EXP.kudos} EXP</b>. Lời khen chỉ lưu trong Coopverse trên máy này: không gửi sang Paperclip,
          không đánh thức agent, không tốn token.
        </p>
        <textarea
          autoFocus
          value={note}
          maxLength={KUDOS_NOTE_MAX}
          rows={3}
          placeholder="Lời khen (không bắt buộc). Vd: Batch A sạch, không phải sửa gì"
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!busy) send() } }}
          disabled={busy}
        />
        {err && <div className="t-dialog-err">{err}</div>}
        <div className="t-dialog-btns">
          <button className="t-btn" onClick={onClose} disabled={busy}>Huỷ</button>
          <button className="t-btn t-primary t-btn-kudos" onClick={send} disabled={busy}>
            {busy ? 'Đang lưu…' : `Khen +${EXP.kudos} EXP`}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Cấp, danh hiệu, EXP của agent trên thanh tiêu đề CLI */
export function ExpBadge({ agentId }: { agentId: string }) {
  const s = useExp((x) => x.stats[agentId])
  const total = s?.total ?? 0
  const lv = s?.level ?? 1
  const [have, need] = levelProgress(total)
  return (
    <span className="exp-badge" title={`${total.toLocaleString('vi-VN')} EXP · còn ${need - have} EXP nữa lên cấp ${lv + 1}`}>
      <span className="lv-chip">Lv {lv}</span>
      <span className="exp-title">{titleOf(lv)}</span>
      <span className="exp-mini"><i style={{ width: `${Math.round((100 * have) / need)}%` }} /></span>
    </span>
  )
}
