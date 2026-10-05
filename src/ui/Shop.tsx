import { useState } from 'react'
import { GROUPS, ITEMS, WALLS, itemById, lowerName, resale, type Group, type Item } from '../data/catalog'
import { isClean } from '../data/officeState'
import { act, useBalance, useOffice } from '../data/officeSync'
import { fmtXu } from '../data/xu'
import { itemThumb } from '../pixel/catalogArt'
import { useCoop } from '../store'
import { DemoXu } from './Cleanup'
import { useDeco } from './decoStore'

/**
 * Bảng Trang trí (phím T / nút sofa): cửa hàng theo nhóm, công cụ xây / dỡ vách, đồ trong kho.
 * Bảng nhỏ bên trái như Dọn dẹp: vẫn đi lại được để xem các góc phòng.
 */

function Thumb({ item }: { item: Item }) {
  let src: string | null = null
  try { src = itemThumb(item) } catch { /* gói hình chưa nạp xong */ }
  return src ? <img className="shop-thumb" src={src} alt="" draggable={false} /> : <span className="shop-thumb" />
}

export function ShopPanel() {
  const close = useCoop((s) => s.toggleDeco)
  const draft = useDeco((s) => s.draft)
  const pending = useDeco((s) => s.pending)
  const setDraft = useDeco((s) => s.setDraft)
  const office = useOffice((s) => s.office)
  const ready = useOffice((s) => s.ready)
  const balance = useBalance()
  const [tab, setTab] = useState<Group>('plant')
  const busy = useDeco((s) => s.busy)
  const [selling, setSelling] = useState<string | null>(null)

  const sellStored = async (uid: string, name: string, back: number) => {
    const d = useDeco.getState()
    if (d.busy) return
    if (d.draft?.kind === 'move' && d.draft.uid === uid) d.setDraft(null)
    d.setBusy(true)
    try {
      await act({ action: 'sell', uid })
      useCoop.getState().showToast(`Đã bán ${lowerName(name)} · +${fmtXu(back)} Xu`)
    } catch (e) {
      useCoop.getState().showToast(e instanceof Error ? e.message : 'Không bán được')
    } finally {
      useDeco.getState().setBusy(false)
      setSelling(null)
    }
  }

  const stored = office.items.filter((p) => p.stored)
  const placed = office.items.filter((p) => !p.stored).length
  const wallClean = isClean(office, 'wall')
  const anyFloor = Object.keys(office.cleaned).some((k) => k.startsWith('floor-'))
  const wallCells = Object.keys(office.walls).length

  const hint = pending
    ? 'Bấm ✓ (Enter) để mua, ✕ (Esc) để bỏ. R: xoay.'
    : draft?.kind === 'new' || draft?.kind === 'move'
      ? 'Bấm lên phòng để đặt thử · R xoay · Esc thôi cầm.'
      : draft?.kind === 'desk' ? 'Bấm chỗ mới cho ghế (bàn nằm phía trước) · R xoay · Esc thôi.'
        : draft?.kind === 'wall' ? 'Giữ chuột kéo một đường thẳng trên sàn đã dọn, thả ra rồi bấm ✓.'
          : draft?.kind === 'erase' ? 'Kéo qua đoạn vách muốn dỡ, thả ra rồi bấm ✓ (được trả nửa giá).'
            : 'Chọn một món để đặt thử, hoặc bấm vào đồ / bàn / vách trên bản đồ để dời, xoay, cất, dỡ, mua đồ để bàn.'

  const items = ITEMS.filter((i) => i.group === tab)
  const card = (i: Item) => {
    const on = draft?.kind === 'new' && draft.item === i.id
    const poor = balance < i.price
    return (
      <button key={i.id} type="button" className={`shop-card${on ? ' on' : ''}${poor ? ' poor' : ''}`}
        onClick={() => setDraft(on ? null : { kind: 'new', item: i.id, rot: 0 })}
        title={poor ? `Còn thiếu ${fmtXu(i.price - balance)} Xu (vẫn đặt thử được)` : i.name}>
        <Thumb item={i} />
        <span className="shop-name">{i.name}</span>
        <span className="shop-price">🪙 {fmtXu(i.price)}</span>
      </button>
    )
  }

  return (
    <section className="panel settings cleanup shop" aria-label="Trang trí văn phòng">
      <div className="set-head">
        <b>🛋️ Trang trí</b>
        <button className="term-close" onClick={close}><kbd>Esc</kbd> Đóng</button>
      </div>
      <div className="xu-big" title="Xu trong quỹ văn phòng">🪙 {fmtXu(balance)} <small>Xu</small> <DemoXu /></div>
      <p className="set-hint">{!ready ? 'Đang đọc văn phòng…' : hint}</p>
      {ready && !anyFloor && <p className="set-hint clean-err">Sàn còn bẩn hết: dọn ít nhất một mảng sàn (phím B) rồi mới đặt đồ được.</p>}

      <div className="shop-tabs" role="tablist">
        {GROUPS.map((g) => (
          <button key={g.id} type="button" role="tab" aria-selected={tab === g.id} className={`shop-tab${tab === g.id ? ' on' : ''}`}
            onClick={() => setTab(g.id)} title={g.name}>
            {g.icon}
          </button>
        ))}
      </div>
      <div className="set-sec">{GROUPS.find((g) => g.id === tab)!.name}</div>
      {tab === 'wall' && !wallClean && <p className="set-hint clean-err">Dọn tường bắc trước (150 Xu ở bảng Dọn dẹp) rồi mới treo được.</p>}
      {(tab === 'lounge' || tab === 'fun') && <p className="set-hint">Agent rảnh sẽ tự tới ngồi, pha cà phê, chơi game. Bạn đứng gần bấm E để dùng.</p>}

      {tab === 'build' && (
        <>
          <div className="shop-tools">
            {WALLS.map((w) => {
              const on = draft?.kind === 'wall' && draft.wall === w.kind
              return (
                <button key={w.kind} type="button" className={`shop-tool${on ? ' on' : ''}`} title={w.hint}
                  onClick={() => setDraft(on ? null : { kind: 'wall', wall: w.kind })}>
                  <i className={`wall-sw ${w.kind}`} aria-hidden /><span><b>{w.name}</b><small>{fmtXu(w.price)} Xu / ô</small></span>
                </button>
              )
            })}
            <button type="button" className={`shop-tool${draft?.kind === 'erase' ? ' on' : ''}`} disabled={!wallCells}
              title="Dỡ vách đã xây, được trả nửa giá" onClick={() => setDraft(draft?.kind === 'erase' ? null : { kind: 'erase' })}>
              <i className="wall-sw erase" aria-hidden /><span><b>Dỡ vách</b><small>+½ giá</small></span>
            </button>
          </div>
          <p className="set-hint">Kéo chuột vẽ một đường thẳng. Tường cao mờ đi khi có người phía sau. Cửa lắp vào 2 ô vách liền nhau. Bấm vào một đoạn vách để dỡ cả đoạn.</p>
        </>
      )}

      <div className="shop-grid">{items.map(card)}</div>

      {stored.length > 0 && (
        <>
          <div className="set-sec">Trong kho ({stored.length})</div>
          <div className="shop-grid">
            {stored.map((p) => {
              const i = itemById.get(p.item)
              if (!i) return null
              const on = draft?.kind === 'move' && draft.uid === p.uid
              const back = resale(i.price)
              return (
                <div key={p.uid} className="shop-stored">
                  <button type="button" className={`shop-card${on ? ' on' : ''}`} title="Lấy ra đặt (miễn phí)"
                    onClick={() => setDraft(on ? null : { kind: 'move', uid: p.uid, item: p.item, rot: p.rot })}>
                    <Thumb item={i} />
                    <span className="shop-name">{i.name}</span>
                    <span className="shop-price">Đặt lại</span>
                  </button>
                  {/* Bán thẳng từ kho, bấm 2 lần cho chắc như bán món đang đặt */}
                  {selling === p.uid
                    ? <button type="button" className="desk-btn danger shop-sell" disabled={busy}
                      onClick={() => void sellStored(p.uid, i.name, back)}>Chắc chưa?</button>
                    : <button type="button" className="desk-btn shop-sell" disabled={busy}
                      onClick={() => setSelling(p.uid)} title="Bán lại nửa giá">Bán +{fmtXu(back)}</button>}
                </div>
              )
            })}
          </div>
        </>
      )}
      <p className="set-hint">Đã đặt {placed} món{wallCells ? ` · ${wallCells} ô vách` : ''}. Cất vào kho miễn phí, bán lại được nửa giá.</p>
    </section>
  )
}
