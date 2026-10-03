import { useEffect, useState } from 'react'
import { uiTick, unlockAudio } from '../audio/engine'
import { useSettings, type Quality } from '../settings'
import { useCoop } from '../store'
import { fmtHour, periodOf, sceneHour, sunElevation } from '../world/time'

/** Giờ đang hiển thị trong văn phòng, cập nhật mỗi 10 giây (hoặc ngay khi kéo thanh xem thử). */
function useSceneHour() {
  const override = useSettings((s) => s.hour)
  const [h, setH] = useState(sceneHour)
  useEffect(() => {
    setH(sceneHour())
    if (override !== null) return
    const id = setInterval(() => setH(sceneHour()), 10_000)
    return () => clearInterval(id)
  }, [override])
  return h
}

const icon = (h: number) => {
  const e = sunElevation(h)
  if (e < -0.05) return '🌙'
  if (e < 0.25) return h < 12 ? '🌅' : '🌇'
  return '☀️'
}

export function Clock() {
  const h = useSceneHour()
  const preview = useSettings((s) => s.hour !== null)
  return (
    <div className="clock" title={preview ? 'Đang xem thử giờ khác (đổi trong Cài đặt)' : 'Giờ Việt Nam (GMT+7)'}>
      <span>{icon(h)}</span>
      <b>{fmtHour(h)}</b>
      <span className="muted">{periodOf(h)}{preview ? ' · xem thử' : ''}</span>
    </div>
  )
}

/** Hàng nút nhanh dưới bảng thương hiệu: âm thanh, nhạc, tủ đồ, cài đặt. */
export function Toolbar() {
  const sfx = useSettings((s) => s.sfx)
  const music = useSettings((s) => s.music)
  const set = useSettings((s) => s.set)
  const openWardrobe = useCoop((s) => s.openWardrobe)
  const toggleSettings = useCoop((s) => s.toggleSettings)
  const settingsOpen = useCoop((s) => s.settingsOpen)
  const tap = (fn: () => void) => () => { unlockAudio(); fn(); uiTick() }
  return (
    <div className="toolbar">
      <button className={`tb-btn${sfx ? ' on' : ''}`} onClick={tap(() => set({ sfx: !sfx }))} title="Âm thanh văn phòng (gõ phím, thông báo)" aria-label="Âm thanh văn phòng" aria-pressed={sfx}>
        <span aria-hidden>{sfx ? '🔊' : '🔇'}</span>
      </button>
      <button className={`tb-btn${music ? ' on' : ''}`} onClick={tap(() => set({ music: !music }))} title="Nhạc lofi (phím M)" aria-label="Nhạc lofi" aria-pressed={music} aria-keyshortcuts="M">
        <span aria-hidden>🎵</span>
      </button>
      <button className="tb-btn" onClick={tap(() => openWardrobe('player'))} title="Tủ đồ (phím C)" aria-label="Tủ đồ" aria-keyshortcuts="C">
        <span aria-hidden>🎨</span>
      </button>
      <button className={`tb-btn${settingsOpen ? ' on' : ''}`} onClick={tap(toggleSettings)} title="Cài đặt" aria-label="Cài đặt" aria-expanded={settingsOpen}>
        <span aria-hidden>⚙️</span>
      </button>
    </div>
  )
}

function Slider({ value, onChange, disabled, label }: { value: number; onChange: (v: number) => void; disabled?: boolean; label: string }) {
  return (
    <input
      type="range" min={0} max={1} step={0.05} value={value} disabled={disabled} aria-label={label}
      aria-valuetext={`${Math.round(value * 100)}%`}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

const QUALITY: [Quality, string, string][] = [
  ['auto', 'Tự động', 'Tự giảm độ nét khi máy chạy chậm'],
  ['high', 'Cao', 'Nét nhất, có bóng đổ'],
  ['low', 'Nhẹ', 'Tắt bóng đổ, độ nét thấp, hợp máy yếu'],
]

export function SettingsPanel() {
  const s = useSettings()
  const close = useCoop((st) => st.toggleSettings)
  const h = useSceneHour()
  const set = (patch: Parameters<typeof s.set>[0]) => { unlockAudio(); s.set(patch) }
  return (
    <section className="panel settings" aria-label="Cài đặt">
      <div className="set-head">
        <b>Cài đặt</b>
        <button className="term-close" onClick={close}><kbd>Esc</kbd> Đóng</button>
      </div>

      <div className="set-sec">Âm thanh</div>
      <div className="set-row">
        <label className="set-check">
          <input type="checkbox" checked={s.sfx} onChange={(e) => set({ sfx: e.target.checked })} />
          <span>Âm thanh văn phòng</span>
        </label>
        <Slider label="Âm lượng âm thanh văn phòng" value={s.sfxVol} disabled={!s.sfx} onChange={(v) => set({ sfxVol: v })} />
      </div>
      <div className="set-row">
        <label className="set-check">
          <input type="checkbox" checked={s.music} onChange={(e) => set({ music: e.target.checked })} />
          <span>Nhạc lofi <kbd>M</kbd></span>
        </label>
        <Slider label="Âm lượng nhạc lofi" value={s.musicVol} disabled={!s.music} onChange={(v) => set({ musicVol: v })} />
      </div>
      <p className="set-hint">Tiếng gõ phím khi agent làm việc, tiếng "ting" khi có thông báo, tiếng bước chân và bong bóng chat. Nhạc do máy tự sáng tác, không lặp lại.</p>

      <div className="set-sec">Đồ hoạ</div>
      <div className="set-seg" role="group" aria-label="Chất lượng đồ hoạ">
        {QUALITY.map(([q, label, hint]) => (
          <button key={q} className={s.quality === q ? 'on' : ''} title={hint} aria-pressed={s.quality === q} onClick={() => { uiTick(); set({ quality: q }) }}>{label}</button>
        ))}
      </div>
      <p className="set-hint">{QUALITY.find(([q]) => q === s.quality)?.[2]}</p>

      <div className="set-sec">Giờ trong văn phòng</div>
      <label className="set-row set-check">
        <input type="checkbox" checked={s.hour === null} onChange={(e) => set({ hour: e.target.checked ? null : (Math.round(h * 4) / 4) % 24 })} />
        <span>Theo giờ Việt Nam</span>
      </label>
      <div className="set-row set-hour">
        <input
          type="range" min={0} max={23.75} step={0.25} value={s.hour ?? h} aria-label="Giờ xem thử" aria-valuetext={fmtHour(s.hour ?? h)}
          onChange={(e) => set({ hour: Number(e.target.value) })}
        />
        <b>{fmtHour(s.hour ?? h)}</b>
      </div>
      <p className="set-hint">Kéo để xem thử văn phòng lúc bình minh, hoàng hôn hay ban đêm. Mở lại trang là về giờ thật.</p>
    </section>
  )
}
