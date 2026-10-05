import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Application, Container, Sprite } from 'pixi.js'
import { ranking, useExp } from '../data/exp'
import { COLUMNS, groupIssues } from '../data/kanban'
import type { AgentStatus } from '../data/types'
import { lookOf } from '../characters/look'
import { agentPos, input, player } from '../runtime'
import { useCoop } from '../store'
import { BOARD, FAME, resolveCircle, type World } from '../world/layout'
import { assetsReady, loadSheets } from './assets'
import { PLAYER_ID } from '../characters/look'
import { charSheet, frameAt, type CharSheet } from './chars'
import { partsOf, usePixelLooks } from './look'
import { stage, ticks } from './stage'
import { MAP_H, MAP_W, dirOf, px, py, wx, wz, type Dir } from './geom'
import { buildOffice, drawFame, drawKanban, type OfficeView } from './office'
import { installDevHooks } from './devhooks'
import { view } from './view'

const RADIUS = 0.28
const AGENT_RADIUS = 0.28
const WALK = 2.8
const RUN = 4.8
const INTERACT_DIST = 1.7
/** Đứng cách bảng treo tường bao xa thì bấm E được */
const BOARD_DIST = 2.1
/** Pixel gốc theo chiều dọc màn hình ở mức phóng to mặc định (~21 ô) */
const VIEW_PX = 336

/** Khoảng cách tới mặt bảng treo tường bắc (chỉ tính khi đứng phía trước, tức phía nam bảng) */
function wallDist(b: { x: number; z: number; w: number }) {
  const bx = Math.max(b.x - b.w / 2, Math.min(player.x, b.x + b.w / 2))
  return player.z > b.z ? Math.hypot(player.x - bx, player.z - b.z) : Infinity
}

type Phase = 'loading' | 'missing' | 'ready' | 'error'

/**
 * Văn phòng pixel (PixiJS): sàn, tường, đồ đạc, bàn làm việc, bạn đi lại bằng WASD.
 * Phóng to theo bội số nguyên của pixel màn hình thật để hình luôn sắc nét.
 */
export function PixelScene({ world, tierOfSlot, tierKey, statusOfSlot, children }: {
  world: World
  tierOfSlot: Map<string, number>
  tierKey: string
  statusOfSlot: Map<string, AgentStatus>
  /** Người trong văn phòng: chỉ dựng khi sân khấu đã sẵn sàng */
  children?: ReactNode
}) {
  const host = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  /** Sheet nhân vật của bạn, đổi khi chỉnh trong tủ đồ */
  const playerSheet = useRef<CharSheet | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [err, setErr] = useState('')
  const appRef = useRef<Application | null>(null)
  const layers = useRef<{ root: Container; floor: Container; sorted: Container; top: Container } | null>(null)
  const office = useRef<OfficeView | null>(null)
  const statusRef = useRef(statusOfSlot)
  statusRef.current = statusOfSlot
  const worldRef = useRef(world)
  worldRef.current = world

  // ── Khởi tạo Pixi, nạp hình, vòng lặp khung hình ──
  useEffect(() => {
    let dead = false
    const app = new Application()
    let playerSprite: Sprite | null = null
    let facing: Dir = 'up'
    let lastNear: string | null = null
    let t = 0
    let screenAcc = 0

    ;(async () => {
      if (!(await assetsReady())) {
        if (!dead) setPhase('missing')
        return
      }
      const el = host.current!
      await app.init({
        resizeTo: el,
        background: 0x1c1a26,
        antialias: false,
        roundPixels: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      })
      if (dead) {
        app.destroy(true)
        return
      }
      el.appendChild(app.canvas)
      app.canvas.style.imageRendering = 'pixelated'
      // Rê chuột lên một người: hiện bảng tên (người ngồi bàn mặc định chỉ có bong bóng trạng thái)
      app.canvas.addEventListener('pointermove', (e) => {
        const r = stage.root
        if (!r) return
        const rect = app.canvas.getBoundingClientRect()
        const mx = wx((e.clientX - rect.left - r.position.x) / r.scale.x)
        const mz = wz((e.clientY - rect.top - r.position.y) / r.scale.y)
        let best: string | null = null
        let bd = Infinity
        for (const [id, a] of agentPos) {
          // Hình người vẽ từ chân lên ~0,8 m phía trên (theo chiều màn hình)
          const dx = Math.abs(mx - a.x), up = a.z - mz
          if (dx < 0.35 && up > -0.15 && up < 0.95 && dx + Math.abs(up - 0.4) < bd) { bd = dx + Math.abs(up - 0.4); best = id }
        }
        stage.hover = best
        app.canvas.style.cursor = best ? 'pointer' : ''
      })
      app.canvas.addEventListener('pointerleave', () => { stage.hover = null })
      await loadSheets()
      playerSheet.current = await charSheet(partsOf(PLAYER_ID, 'Bạn', false))
      if (dead) return

      const root = new Container()
      const floor = new Container()
      const sorted = new Container()
      sorted.sortableChildren = true
      const top = new Container()
      root.addChild(floor, sorted, top)
      app.stage.addChild(root)
      layers.current = { root, floor, sorted, top }
      appRef.current = app
      Object.assign(stage, { app, root, sorted, top, overlay: overlay.current })

      playerSprite = new Sprite(playerSheet.current.frame('idle', 'up', 0))
      playerSprite.anchor.set(0.5, 1)
      sorted.addChild(playerSprite)
      view.x = px(player.x)
      view.y = py(player.z)

      app.ticker.add((tk) => {
        const dt = Math.min(tk.deltaMS / 1000, 0.05)
        t += dt
        const w = worldRef.current
        const k = input.keys

        // ── Di chuyển: W lên (bắc), S xuống, A trái, D phải ──
        let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)
        let mz = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0)
        const len = Math.hypot(mx, mz)
        const running = k.has('ShiftLeft') || k.has('ShiftRight')
        if (len > 0) {
          mx /= len
          mz /= len
          const sp = running ? RUN : WALK
          player.x += mx * sp * dt
          player.z += mz * sp * dt
          player.facing = Math.atan2(mx, mz)
          facing = dirOf(player.facing)
        }
        const p = { x: player.x, z: player.z }
        resolveCircle(p, RADIUS, w.colliders)
        for (const a of agentPos.values()) {
          const dx = p.x - a.x, dz = p.z - a.z
          const d = Math.hypot(dx, dz), min = RADIUS + AGENT_RADIUS
          if (d < min && d > 1e-5) { p.x = a.x + (dx / d) * min; p.z = a.z + (dz / d) * min }
        }
        resolveCircle(p, RADIUS, w.colliders)
        player.x = p.x
        player.z = p.z

        const sheet = playerSheet.current
        if (playerSprite && sheet) {
          const anim = len > 0 ? 'walk' : 'idle'
          playerSprite.texture = sheet.frame(anim, facing, frameAt(anim, running ? t * 1.5 : t))
          playerSprite.position.set(Math.round(px(player.x)), Math.round(py(player.z)) + 2)
          playerSprite.zIndex = Math.round(py(player.z))
        }

        // ── Camera: phóng to nguyên lần pixel màn hình thật, bám theo bạn, không ra ngoài bản đồ ──
        const res = app.renderer.resolution
        const sw = app.screen.width, sh = app.screen.height
        const auto = Math.max(2, Math.round((sh * res) / VIEW_PX))
        const zDev = Math.max(1, auto + view.zoomBias)
        const z = zDev / res
        view.zoom = zDev
        // Dịch chuyển tức thời (dev / tìm agent): nhảy luôn, không trượt
        const ease = Number.isFinite(view.x) ? 1 - Math.exp(-8 * dt) : 1
        if (!Number.isFinite(view.x)) { view.x = px(player.x); view.y = py(player.z) - 12 }
        view.x += (px(player.x) - view.x) * ease
        view.y += (py(player.z) - 12 - view.y) * ease
        const halfW = sw / z / 2, halfH = sh / z / 2
        const cx = MAP_W <= halfW * 2 ? MAP_W / 2 : Math.min(MAP_W - halfW, Math.max(halfW, view.x))
        const cy = MAP_H <= halfH * 2 ? MAP_H / 2 : Math.min(MAP_H - halfH, Math.max(halfH, view.y))
        root.scale.set(z)
        root.position.set(Math.round((sw / 2 - cx * z) * res) / res, Math.round((sh / 2 - cy * z) * res) / res)

        // ── Người trong văn phòng (agent, ứng viên), đạo diễn đời sống ──
        for (const f of ticks) f(dt, t)

        // ── Màn hình máy tính: vẽ lại ~8 lần mỗi giây ──
        screenAcc += dt
        if (screenAcc > 0.12 && office.current) {
          screenAcc = 0
          for (const s of office.current.screens) s.draw(statusRef.current.get(s.slotId) ?? null, t)
        }

        // ── Thứ gần nhất để bấm E: agent, bảng ticket, bảng vàng ──
        let best: string | null = null
        let bd = INTERACT_DIST
        for (const [id, a] of agentPos) {
          const dd = Math.hypot(a.x - player.x, a.z - player.z)
          if (dd < bd) { bd = dd; best = id }
        }
        const boardD = wallDist(BOARD)
        const fameD = wallDist(FAME)
        const board = boardD < BOARD_DIST && (!best || boardD - 0.8 < bd)
        const fame = !board && fameD < BOARD_DIST && (!best || fameD - 0.8 < bd)
        if (board || fame) best = null
        const key = board ? '#board' : fame ? '#fame' : best
        if (key !== lastNear) {
          lastNear = key
          useCoop.getState().setNear(best, board, fame)
        }
      })
      setPhase('ready')
    })().catch((e: unknown) => {
      if (dead) return
      setErr(e instanceof Error ? e.message : String(e))
      setPhase('error')
    })

    return () => {
      dead = true
      Object.assign(stage, { app: null, root: null, sorted: null, top: null, overlay: null })
      appRef.current = null
      layers.current = null
      office.current = null
      try { app.destroy(true, { children: true }) } catch { /* chưa init xong */ }
    }
  }, [])

  // ── Tủ đồ: đổi bộ đồ của bạn ──
  const playerLook = usePixelLooks((s) => s.custom[PLAYER_ID])
  useEffect(() => {
    if (phase !== 'ready') return
    let live = true
    charSheet(partsOf(PLAYER_ID, 'Bạn', false)).then((s) => { if (live) playerSheet.current = s })
    return () => { live = false }
  }, [phase, playerLook])

  // ── Dựng (lại) văn phòng khi sơ đồ chỗ ngồi hoặc bậc bàn đổi ──
  useEffect(() => {
    const L = layers.current
    if (phase !== 'ready' || !L) return
    const old = office.current
    if (old) {
      // Chỉ gỡ đồ của văn phòng cũ: người, bong bóng, mũi tên đánh dấu cũng nằm trong các lớp này
      for (const c of [old.floor, old.top, ...old.sorted]) { c.removeFromParent(); c.destroy({ children: true }) }
    }
    const v = buildOffice(world, tierOfSlot)
    L.floor.addChild(v.floor)
    L.top.addChildAt(v.top, 0)
    for (const c of v.sorted) L.sorted.addChild(c)
    office.current = v
    redrawBoards()
  }, [phase, world, tierKey])

  // ── Bảng ticket / bảng vàng trên tường: vẽ lại khi dữ liệu đổi ──
  const issues = useCoop((s) => s.issues)
  const agents = useCoop((s) => s.agents)
  const stats = useExp((s) => s.stats)
  function redrawBoards() {
    const v = office.current
    if (!v) return
    const g = groupIssues(useCoop.getState().issues)
    drawKanban(v.kanban, COLUMNS.map((c) => ({ color: c.color, n: g[c.id].length })))
    const all = useCoop.getState().agents
    const leads = new Set(all.map((a) => a.reportsTo).filter(Boolean))
    const rows = ranking(all, useExp.getState().stats, 'total').filter((r) => r.exp > 0)
    const max = rows[0]?.exp || 1
    drawFame(v.fame, rows.slice(0, 3).map((r) => ({ color: lookOf(r.agent.id, r.agent.name, leads.has(r.agent.id)).shirt, frac: r.exp / max })))
  }
  useEffect(redrawBoards, [issues, agents, stats])

  // ── Công cụ cho dev ──
  useEffect(() => {
    if (!import.meta.env.DEV || phase !== 'ready') return
    const w = window as unknown as { __pixel?: unknown }
    w.__pixel = { app: appRef.current, view, layers: layers.current, office: () => office.current, player }
    return appRef.current ? installDevHooks(appRef.current) : undefined
  }, [phase])

  return (
    <div id="stage" ref={host} className="pixel-stage">
      <div ref={overlay} className="px-overlay" />
      {phase === 'ready' && children}
      {phase === 'missing' && <MissingAssets />}
      {phase === 'error' && (
        <div className="panel center-card">
          <div className="center-title">Không vẽ được văn phòng pixel</div>
          <p className="muted">{err}</p>
        </div>
      )}
    </div>
  )
}

/** Máy này chưa có gói hình LimeZu */
function MissingAssets() {
  return (
    <div className="panel center-card">
      <div className="center-title">Chưa có gói hình pixel</div>
      <p>
        Bản pixel vẽ bằng 2 gói của LimeZu: <b>Modern Interiors</b> (
        <a href="https://limezu.itch.io/moderninteriors" target="_blank" rel="noreferrer">limezu.itch.io/moderninteriors</a>) và{' '}
        <b>Modern Office</b> (
        <a href="https://limezu.itch.io/modernoffice" target="_blank" rel="noreferrer">limezu.itch.io/modernoffice</a>).
        Gói có bản quyền nên không nằm trong repo: mỗi máy tự mua, giải nén, rồi trỏ Coopverse tới thư mục đó
        (Modern Office giải nén vào thư mục con <code>Modern_Office</code>).
      </p>
      <p className="muted">
        Mặc định Coopverse tìm ở <code>../coopverse-assets/limezu</code> (cạnh thư mục dự án). Để chỗ khác thì đặt{' '}
        <code>COOPVERSE_ASSETS</code> trong file <code>.env</code>, rồi chạy lại Coopverse.
      </p>
    </div>
  )
}
