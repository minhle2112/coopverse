import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { Group } from 'three'
import { uiTick } from '../audio/engine'
import { Character, type Pose } from '../characters/Character'
import {
  HAIR, HAT_COLORS, PANTS, PLAYER_ID, SHIRT, SKIN, baseLook, randomLook, useLook, useLooks, type Look,
} from '../characters/look'
import { useCoop } from '../store'

const HAIR_STYLES = ['Ngắn', 'Mái vuốt', 'Dài', 'Búi', 'Xoăn', 'Đầu đinh']
const HATS = ['Không', 'Lưỡi trai', 'Mũ len', 'Tai nghe']

/** Nhân vật xoay chậm, kéo chuột để xoay tay; thỉnh thoảng vẫy tay chào. */
function Model({ look, spin }: { look: Look; spin: { yaw: number; dragging: boolean } }) {
  const g = useRef<Group>(null!)
  const pose = useRef<Pose>({ mode: 'stand', mood: 'happy' })
  const t = useRef(0)
  useFrame((_, dt) => {
    t.current += dt
    if (!spin.dragging) spin.yaw += dt * 0.5
    g.current.rotation.y = spin.yaw
    pose.current.mode = t.current % 6 > 4.6 ? 'wave' : 'stand'
  })
  return (
    <group ref={g}>
      <Character look={look} pose={pose} />
    </group>
  )
}

/** Chỉ khi dev: cho phép test tự chạy khung hình của ô xem trước khi tab bị ẩn */
function PreviewHook() {
  const advance = useThree((s) => s.advance)
  const get = useThree((s) => s.get)
  useEffect(() => {
    const w = window as unknown as { __coop?: Record<string, unknown> }
    if (!w.__coop) return
    w.__coop.preview = (sec = 1) => {
      get().setFrameloop('never')
      let t = get().clock.elapsedTime
      for (let i = 0; i < sec * 30; i++) { t += 1 / 30; advance(t, true) }
    }
    return () => { delete w.__coop?.preview }
  }, [advance, get])
  return null
}

function Preview({ look }: { look: Look }) {
  const spin = useRef({ yaw: 0.5, dragging: false, x: 0 }).current
  return (
    <div
      className="wd-preview"
      onPointerDown={(e) => { spin.dragging = true; spin.x = e.clientX; (e.target as HTMLElement).setPointerCapture(e.pointerId) }}
      onPointerMove={(e) => { if (spin.dragging) { spin.yaw += (e.clientX - spin.x) * 0.012; spin.x = e.clientX } }}
      onPointerUp={() => { spin.dragging = false }}
      onPointerCancel={() => { spin.dragging = false }}
      onLostPointerCapture={() => { spin.dragging = false }}
      title="Kéo để xoay"
      role="img"
      aria-label="Hình xem trước nhân vật, kéo để xoay"
    >
      <Canvas dpr={[1, 1.5]} camera={{ fov: 30, position: [0, 1.05, 4.6] }} onCreated={({ camera }) => camera.lookAt(0, 0.88, 0)}>
        <hemisphereLight args={['#fff6e8', '#6a6070', 1.4]} />
        <directionalLight position={[2.5, 4, 3]} intensity={2} />
        <Model look={look} spin={spin} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
          <circleGeometry args={[0.75, 32]} />
          <meshStandardMaterial color="#3a4256" roughness={1} />
        </mesh>
        {import.meta.env.DEV && <PreviewHook />}
      </Canvas>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="wd-row" role="group" aria-label={label}>
      <div className="wd-label" aria-hidden>{label}</div>
      <div className="wd-opts">{children}</div>
    </div>
  )
}

function Swatches({ list, value, onPick, name }: { list: readonly string[]; value: string; onPick: (c: string) => void; name: string }) {
  const custom = !list.includes(value.toLowerCase())
  return (
    <>
      {list.map((c, i) => (
        <button
          key={c} className={`wd-sw${c === value.toLowerCase() ? ' on' : ''}`} style={{ background: c }} onClick={() => onPick(c)}
          title={c} aria-label={`${name} ${i + 1}`} aria-pressed={c === value.toLowerCase()}
        />
      ))}
      <label className={`wd-sw wd-pick${custom ? ' on' : ''}`} style={custom ? { background: value } : undefined} title="Chọn màu khác">
        <input type="color" value={value} onChange={(e) => onPick(e.target.value)} aria-label={`${name}: chọn màu khác`} />
        <span aria-hidden>{!custom && '+'}</span>
      </label>
    </>
  )
}

function Choice<T extends number | boolean>({ items, value, onPick }: { items: [T, string][]; value: T; onPick: (v: T) => void }) {
  return (
    <>
      {items.map(([v, label]) => (
        <button key={String(v)} className={`wd-chip${v === value ? ' on' : ''}`} aria-pressed={v === value} onClick={() => onPick(v)}>{label}</button>
      ))}
    </>
  )
}

/**
 * Tủ đồ (phím C): đổi ngoại hình của bạn hoặc từng agent. Lưu trên trình duyệt này,
 * agent mặc đồ mới ngay trong văn phòng.
 */
export function Wardrobe({ id }: { id: string }) {
  const agents = useCoop((s) => s.agents)
  const close = useCoop((s) => s.closeWardrobe)
  const open = useCoop((s) => s.openWardrobe)
  const setLook = useLooks((s) => s.setLook)
  const reset = useLooks((s) => s.reset)
  const custom = useLooks((s) => s.custom)
  const leads = useMemo(() => new Set(agents.map((a) => a.reportsTo).filter(Boolean)), [agents])
  const dialog = useRef<HTMLDivElement>(null)

  // Mở tủ đồ: đưa con trỏ bàn phím vào trong; đóng: trả lại chỗ cũ
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    return () => { if (before?.isConnected) before.focus() }
  }, [])
  const agent = agents.find((a) => a.id === id)
  const name = id === PLAYER_ID ? 'Bạn' : agent?.name ?? '?'
  const isLead = leads.has(id)
  const look = useLook(id, name, isLead)
  const edited = !!custom[id]

  const set = (patch: Partial<Look>) => { uiTick(); setLook(id, patch) }
  const people = [{ id: PLAYER_ID, name: 'Bạn', lead: false }, ...agents.filter((a) => a.status !== 'terminated').map((a) => ({ id: a.id, name: a.name, lead: leads.has(a.id) }))]

  return (
    <div className="term-wrap wd-wrap" onPointerDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div className="wardrobe" role="dialog" aria-modal="true" aria-label={`Tủ đồ · ${name}`} tabIndex={-1} ref={dialog}>
        <div className="term-bar">
          <span className="term-dots"><i /><i /><i /></span>
          <span className="term-title">Tủ đồ <span className="muted">· {name}{edited ? ' · đã chỉnh' : ''}</span></span>
          <button className="term-close" onClick={close} title="Đóng tủ đồ"><kbd>Esc</kbd> Xong</button>
        </div>
        <div className="wd-body">
          <nav className="wd-people" aria-label="Chọn người">
            {people.map((p) => {
              const shirt = (custom[p.id]?.shirt) ?? baseLook(p.id, p.name, p.lead).shirt
              return (
                <button key={p.id} className={`wd-person${p.id === id ? ' on' : ''}`} aria-current={p.id === id} onClick={() => { uiTick(); open(p.id) }}>
                  <i style={{ background: shirt }} aria-hidden />
                  <span>{p.name}</span>
                  {custom[p.id] && <em title="Đã chỉnh">✎</em>}
                </button>
              )
            })}
          </nav>
          <Preview look={look} />
          <div className="wd-controls">
            <Row label="Kiểu tóc">
              <Choice items={HAIR_STYLES.map((l, i) => [i, l] as [number, string])} value={look.hairStyle} onPick={(v) => set({ hairStyle: v as Look['hairStyle'] })} />
            </Row>
            <Row label="Màu tóc"><Swatches name="Màu tóc" list={HAIR} value={look.hair} onPick={(c) => set({ hair: c })} /></Row>
            <Row label="Màu da"><Swatches name="Màu da" list={SKIN} value={look.skin} onPick={(c) => set({ skin: c })} /></Row>
            <Row label="Áo"><Swatches name="Màu áo" list={SHIRT} value={look.shirt} onPick={(c) => set({ shirt: c })} /></Row>
            <Row label="Quần"><Swatches name="Màu quần" list={PANTS} value={look.pants} onPick={(c) => set({ pants: c })} /></Row>
            <Row label="Kính">
              <Choice items={[[false, 'Không'], [true, 'Có']]} value={look.glasses} onPick={(v) => set({ glasses: v })} />
            </Row>
            <Row label="Mũ">
              <Choice items={HATS.map((l, i) => [i, l] as [number, string])} value={look.hat} onPick={(v) => set({ hat: v as Look['hat'] })} />
            </Row>
            {look.hat > 0 && (
              <Row label={look.hat === 3 ? 'Màu tai nghe' : 'Màu mũ'}>
                <Swatches name={look.hat === 3 ? 'Màu tai nghe' : 'Màu mũ'} list={HAT_COLORS} value={look.hatColor} onPick={(c) => set({ hatColor: c })} />
              </Row>
            )}
            <div className="wd-actions">
              <button className="t-btn" onClick={() => { uiTick(); setLook(id, randomLook()) }}>🎲 Ngẫu nhiên</button>
              <button className="t-btn" disabled={!edited} onClick={() => { uiTick(); reset(id) }}>↺ Về mặc định</button>
            </div>
            <p className="wd-note">Lưu trên trình duyệt này. Paperclip không bị đổi gì.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
