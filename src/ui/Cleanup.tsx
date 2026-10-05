import { useState } from 'react'
import { JOBS, allClean, isClean, jobById } from '../data/officeState'
import { cleanJob, resetDemoOffice, useBalance, useOffice } from '../data/officeSync'
import { XU_TICKET, fmtXu } from '../data/xu'
import { useCoop } from '../store'

/**
 * Bảng Dọn dẹp (phím B / nút chổi): số Xu trong quỹ, chỗ đang chọn trên bản đồ, các chỗ trên tường,
 * tiến độ dọn, ai góp nhiều Xu nhất. Bảng nhỏ bên trái như Cài đặt: vẫn đi lại được khi đang mở.
 */
export function CleanupPanel() {
  const close = useCoop((s) => s.toggleClean)
  const pick = useCoop((s) => s.cleanPick)
  const setPick = useCoop((s) => s.pickClean)
  const showToast = useCoop((s) => s.showToast)
  const agents = useCoop((s) => s.agents)
  const demo = useCoop((s) => s.conn === 'demo')
  const office = useOffice((s) => s.office)
  const ready = useOffice((s) => s.ready)
  const byAgent = useOffice((s) => s.earned.byAgent)
  const balance = useBalance()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const job = pick ? jobById.get(pick) : undefined
  const floors = JOBS.filter((j) => j.kind === 'floor')
  const floorsDone = floors.filter((j) => isClean(office, j.id)).length
  const done = JOBS.filter((j) => isClean(office, j.id)).length
  const others = JOBS.filter((j) => j.kind !== 'floor')
  const top = Object.entries(byAgent)
    .map(([id, xu]) => ({ name: agents.find((a) => a.id === id)?.name, xu }))
    .filter((r) => r.name && r.xu > 0)
    .sort((a, b) => b.xu - a.xu)
    .slice(0, 3)

  async function clean(id: string) {
    const j = jobById.get(id)
    if (!j) return
    setBusy(id)
    setErr(null)
    try {
      await cleanJob(id)
      showToast(`✨ Đã dọn ${j.label.toLowerCase()} · −${fmtXu(j.price)} Xu`)
      if (pick === id) setPick(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Không dọn được')
    }
    setBusy(null)
  }

  const btn = (id: string, price: number) => (
    <button type="button" className="desk-btn primary" disabled={!!busy || balance < price} onClick={() => void clean(id)}
      title={balance < price ? `Còn thiếu ${fmtXu(price - balance)} Xu` : undefined}>
      {busy === id ? 'Đang dọn…' : `Dọn · ${fmtXu(price)} Xu`}
    </button>
  )

  return (
    <section className="panel settings cleanup" aria-label="Dọn dẹp văn phòng">
      <div className="set-head">
        <b>🧹 Dọn dẹp</b>
        <button className="term-close" onClick={close}><kbd>Esc</kbd> Đóng</button>
      </div>
      <div className="xu-big" title="Xu trong quỹ văn phòng">🪙 {fmtXu(balance)} <small>Xu</small></div>
      <div className="clean-bar" title={`${done}/${JOBS.length} chỗ đã sạch`}>
        <i style={{ width: `${Math.round((100 * done) / JOBS.length)}%` }} />
      </div>
      <p className="set-hint">
        {!ready ? 'Đang đọc văn phòng…' : allClean(office)
          ? 'Văn phòng sạch bong! Đợt sau: cửa hàng đồ trang trí.'
          : `Đã sạch ${done}/${JOBS.length} chỗ (sàn ${floorsDone}/${floors.length} mảng). Bấm chỗ có khung trên bản đồ để chọn.`}
      </p>

      {job && !isClean(office, job.id) && (
        <div className="clean-pick">
          <div><b>{job.label}</b></div>
          <div className="set-row set-btns">
            {btn(job.id, job.price)}
            <button type="button" className="desk-btn" onClick={() => setPick(null)}>Bỏ chọn</button>
          </div>
          {balance < job.price && <p className="set-hint">Còn thiếu {fmtXu(job.price - balance)} Xu: chờ agent làm xong thêm ticket.</p>}
        </div>
      )}
      {err && <p className="set-hint clean-err">{err}</p>}

      <div className="set-sec">Tường, cửa sổ, bảng</div>
      {others.map((j) => (
        <div key={j.id} className="set-row clean-row">
          <span className={isClean(office, j.id) ? 'muted' : ''}>{j.label}</span>
          {isClean(office, j.id) ? <span className="muted">✨ sạch</span> : btn(j.id, j.price)}
        </div>
      ))}

      <div className="set-sec">Xu từ đâu ra</div>
      <p className="set-hint">
        Agent làm xong ticket trên board thì quỹ có Xu: ưu tiên thấp {XU_TICKET.low}, vừa {XU_TICKET.medium}, cao {XU_TICKET.high},
        khẩn {XU_TICKET.critical} Xu; agent cấp càng cao càng được nhiều (mỗi cấp +10%). Mảng sàn càng xa cửa càng đắt.
      </p>
      {top.length > 0 && (
        <p className="set-hint">Góp nhiều nhất: {top.map((r) => `${r.name} ${fmtXu(r.xu)}`).join(' · ')}</p>
      )}
      {demo && (
        <div className="set-row set-btns">
          <button type="button" className="desk-btn" onClick={resetDemoOffice}>Làm bẩn lại (demo)</button>
        </div>
      )}
    </section>
  )
}

/** Số Xu trong quỹ dưới logo: bấm để mở bảng Dọn dẹp */
export function XuBadge() {
  const balance = useBalance()
  const ready = useOffice((s) => s.ready)
  const toggle = useCoop((s) => s.toggleClean)
  if (!ready) return null
  return (
    <button type="button" className="xu-badge" onClick={toggle} title="Quỹ văn phòng · bấm để dọn dẹp (phím B)">
      🪙 {fmtXu(balance)} Xu
    </button>
  )
}
