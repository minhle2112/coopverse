import { useEffect, useState } from 'react'
import { PAPERCLIP_UI } from '../data/paperclip'
import { switchCompany } from '../data/sync'
import { STATUS_COLOR, STATUS_LABEL } from '../data/types'
import { useCoop } from '../store'
import type { World } from '../world/layout'
import { KanbanView } from './KanbanView'
import { Minimap } from './Minimap'
import { Clock, SettingsPanel, Toolbar } from './Settings'
import { Terminal } from './Terminal'
import { Wardrobe } from './Wardrobe'

function Toast() {
  const toast = useCoop((s) => s.toast)
  const [shown, setShown] = useState<number | null>(null)
  useEffect(() => {
    if (!toast) return
    setShown(toast.id)
    const t = setTimeout(() => setShown(null), 4200)
    return () => clearTimeout(t)
  }, [toast])
  if (!toast || shown !== toast.id) return null
  return <div className="toast">{toast.text}</div>
}

/** Số giây còn lại tới lúc thử kết nối lại. */
function useCountdown(at: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!at) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [at])
  return at ? Math.max(0, Math.ceil((at - now) / 1000)) : 0
}

function ConnBadge() {
  const conn = useCoop((s) => s.conn)
  const version = useCoop((s) => s.version)
  const retryAt = useCoop((s) => s.retryAt)
  const secs = useCountdown(conn === 'offline' ? retryAt : null)
  const text = {
    connecting: 'Đang kết nối Paperclip…',
    live: `Trực tiếp · Paperclip ${version ?? ''}`.trim(),
    offline: secs > 0 ? `Mất kết nối · thử lại sau ${secs}s` : 'Mất kết nối · đang thử lại…',
    demo: 'Bản demo · dữ liệu giả',
  }[conn]
  return (
    <div className={`badge conn-${conn}`}>
      <span className="conn-dot" />
      {text}
    </div>
  )
}

/** Tên công ty đang xem; Paperclip có nhiều công ty thì thành ô chọn để đổi. */
function CompanyLine() {
  const companies = useCoop((s) => s.companies)
  const company = useCoop((s) => s.company)
  const demo = useCoop((s) => s.conn === 'demo')
  if (demo) return <div className="brand-sub">Văn phòng demo</div>
  if (company && companies.length > 1) {
    return (
      <select className="brand-sub company-pick" value={company.id} onChange={(e) => switchCompany(e.target.value)} aria-label="Đổi công ty" title="Đổi công ty">
        {companies.map((c) => <option key={c.id} value={c.id}>Văn phòng {c.name}</option>)}
      </select>
    )
  }
  return <div className="brand-sub">{company ? `Văn phòng ${company.name}` : 'Văn phòng AI'}</div>
}

function Notes() {
  const notes = useCoop((s) => s.notes)
  const dismiss = useCoop((s) => s.dismissNote)
  return (
    <div className="notes">
      {notes.map((n) => (
        <button key={n.id} className={`note note-${n.kind}`} onClick={() => dismiss(n.id)} title="Bấm để ẩn">
          {n.text}
        </button>
      ))}
    </div>
  )
}

/** Paperclip tắt và chưa từng có dữ liệu: hướng dẫn bật. */
function OfflineCard() {
  const conn = useCoop((s) => s.conn)
  const hasData = useCoop((s) => s.hasData)
  if (hasData || conn !== 'offline') return null
  return (
    <div className="panel center-card">
      <div className="center-title">Chưa kết nối được Paperclip</div>
      <p>
        Coopverse cần Paperclip chạy ở <code>{PAPERCLIP_UI.replace(/^https?:\/\//, '')}</code>. Bấm đúp{' '}
        <code>start-coopverse.cmd</code> (tự bật Paperclip nếu đã khai báo trong <code>.env</code>), hoặc tự chạy{' '}
        <code>paperclipai run</code>.
      </p>
      <p className="muted">Paperclip chạy ở địa chỉ khác thì sửa <code>VITE_PAPERCLIP_URL</code> trong file <code>.env</code>.</p>
      <p className="muted">Coopverse tự kết nối lại khi Paperclip bật xong.</p>
      <a href="?demo">Xem bản demo với dữ liệu giả</a>
    </div>
  )
}

export function Hud({ world }: { world: World }) {
  const agents = useCoop((s) => s.agents)
  const conn = useCoop((s) => s.conn)
  const hasData = useCoop((s) => s.hasData)
  const nearId = useCoop((s) => s.nearId)
  const locked = useCoop((s) => s.locked)
  const ping = useCoop((s) => s.ping)
  const cycleStatus = useCoop((s) => s.cycleStatus)
  const pingAgent = useCoop((s) => s.pingAgent)
  const focusId = useCoop((s) => s.focusId)
  const nearBoard = useCoop((s) => s.nearBoard)
  const boardOpen = useCoop((s) => s.boardOpen)
  const wardrobeId = useCoop((s) => s.wardrobeId)
  const settingsOpen = useCoop((s) => s.settingsOpen)
  const company = useCoop((s) => s.company)
  const near = agents.find((a) => a.id === nearId)
  const focused = agents.find((a) => a.id === focusId)
  const viewing = !!focusId || boardOpen || !!wardrobeId

  // Đang xem CLI / bảng ticket: ẩn bảng tên và các bảng HUD che màn hình
  useEffect(() => {
    document.body.classList.toggle('focus-mode', viewing)
  }, [viewing])
  const working = agents.filter((a) => a.status === 'running').length
  const demo = conn === 'demo'

  return (
    <div className="hud">
      <div className="left-col">
        <div className="panel brand">
          <div className="brand-title">COOPVERSE</div>
          <CompanyLine />
          <ConnBadge />
          <Clock />
        </div>
        <Toolbar />
        {settingsOpen && <SettingsPanel />}
        <Notes />
      </div>

      <div className="panel roster">
        <div className="roster-head">
          <span>Nhân sự</span>
          <span className="roster-count">{working}/{agents.length} đang làm</span>
        </div>
        {agents.map((a) => (
          <button
            key={a.id}
            className={`roster-item${ping?.id === a.id ? ' pinged' : ''}`}
            onClick={() => (demo ? cycleStatus(a.id) : pingAgent(a.id))}
            title={demo ? 'Demo: bấm để đổi trạng thái' : 'Bấm để đánh dấu trên bản đồ'}
          >
            <span className="np-dot" style={{ background: STATUS_COLOR[a.status] }} />
            <span className="roster-main">
              <span className="roster-row">
                <span className="roster-name">{a.name}</span>
                <span className="roster-status">{STATUS_LABEL[a.status]}</span>
              </span>
              {a.status === 'running' && a.task && <span className="roster-task">{a.task}</span>}
              {(a.status === 'error' || a.status === 'paused') && a.reason && <span className="roster-task">{a.reason}</span>}
            </span>
          </button>
        ))}
        {hasData && agents.length === 0 && (
          <div className="roster-hint">
            {company || demo ? 'Công ty chưa có agent nào.' : 'Paperclip chưa có công ty nào. Tạo công ty trong Paperclip, Coopverse sẽ tự nhận.'}
          </div>
        )}
        {!hasData && <div className="roster-hint">Đang chờ dữ liệu từ Paperclip…</div>}
        {agents.length > 0 && (
          <div className="roster-hint">
            {locked ? 'Esc để nhả chuột rồi bấm vào tên' : demo ? 'Bấm vào tên để đổi trạng thái (demo)' : 'Bấm vào tên để tìm trên bản đồ'}
          </div>
        )}
      </div>

      {nearBoard && !viewing && (
        <div className="prompt">
          <kbd>E</kbd>
          <span>Xem bảng ticket</span>
        </div>
      )}

      {near && !viewing && (
        <div className="prompt">
          <kbd>E</kbd>
          <span>
            {near.status === 'running'
              ? `Chat / xem CLI · ${near.name}`
              : near.status === 'terminated'
                ? `${near.name} · ${STATUS_LABEL[near.status]}`
                : `Chat / mở máy · ${near.name} · ${STATUS_LABEL[near.status]}`}
          </span>
        </div>
      )}

      <div className="help">
        {!locked && <div className="help-start">Bấm vào màn hình để điều khiển bằng chuột</div>}
        <div className="help-keys">
          <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> đi</span>
          <span><kbd>Shift</kbd> chạy</span>
          <span>Chuột: xoay</span>
          <span>Lăn chuột: gần/xa</span>
          <span><kbd>E</kbd> chat với agent / xem bảng ticket</span>
          <span><kbd>C</kbd> tủ đồ</span>
          <span><kbd>M</kbd> nhạc</span>
          <span><kbd>Esc</kbd> nhả chuột / đóng</span>
        </div>
      </div>

      <Minimap world={world} />
      <OfflineCard />
      {focused && <Terminal key={focused.id} agent={focused} />}
      {boardOpen && <KanbanView />}
      {wardrobeId && <Wardrobe id={wardrobeId} />}
      <Toast />
    </div>
  )
}
