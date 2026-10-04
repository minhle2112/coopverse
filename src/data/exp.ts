import { create } from 'zustand'
import { emptyLedger, type Kudos, type Ledger } from './ledger'
import type { Agent } from './types'

/**
 * EXP và cấp của agent. Tính hoàn toàn từ sổ (src/data/ledger.ts): Coopverse không ghi gì vào Paperclip.
 * Việc hỏng (run lỗi, bị huỷ) được 0 điểm, nên không bao giờ bị trừ.
 */
export const EXP = {
  /** Ticket xong, theo độ ưu tiên */
  ticket: { critical: 120, high: 80, medium: 50, low: 30 } as Record<string, number>,
  run: 10,
  approval: 30,
  kudos: 25,
}
export const ticketExp = (priority: string) => EXP.ticket[priority] ?? EXP.ticket.medium

/** EXP tích luỹ để đạt cấp L: cấp 2 = 100, cấp 3 = 300, cấp 4 = 600… (cấp sau cần thêm 100 × cấp hiện tại) */
export const expForLevel = (level: number) => 50 * level * (level - 1)

export function levelOf(exp: number) {
  let l = 1
  while (expForLevel(l + 1) <= exp) l++
  return l
}

export const TITLES = [
  'Thực tập sinh', 'Nhân viên mới', 'Nhân viên', 'Nhân viên chính', 'Chuyên viên',
  'Chuyên viên chính', 'Chuyên gia', 'Chuyên gia cao cấp', 'Bậc thầy', 'Huyền thoại',
]
export const titleOf = (level: number) => TITLES[Math.min(level, TITLES.length) - 1]

/**
 * Bàn nâng cấp theo cấp: 0 bàn thường · 1 (cấp 3) chậu cây · 2 (cấp 5) màn hình thứ hai
 * · 3 (cấp 7) đèn bàn + ghế da · 4 (cấp 9) cúp vàng + viền bàn vàng
 */
export const deskTier = (level: number) => Math.min(4, Math.floor((level - 1) / 2))
export const DESK_PERKS = ['Bàn thường', 'Chậu cây trên bàn', 'Màn hình thứ hai', 'Đèn bàn và ghế da', 'Cúp vàng và viền bàn vàng']

export interface Counts { tickets: number; runs: number; approvals: number; kudos: number }
export interface AgentExp {
  total: number
  /** EXP từ thứ Hai tuần này */
  week: number
  level: number
  counts: Counts
  weekCounts: Counts
}

/** 0 giờ thứ Hai tuần này (giờ máy) */
export function weekStart(now = new Date()) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

const zero = (): Counts => ({ tickets: 0, runs: 0, approvals: 0, kudos: 0 })

/** Cộng sổ thành EXP từng agent */
export function computeStats(L: Ledger, now = new Date()): Record<string, AgentExp> {
  const out: Record<string, AgentExp> = {}
  const since = weekStart(now)
  const add = (agentId: string, at: number, exp: number, k: keyof Counts) => {
    const s = (out[agentId] ??= { total: 0, week: 0, level: 1, counts: zero(), weekCounts: zero() })
    s.total += exp
    s.counts[k]++
    if (at >= since) {
      s.week += exp
      s.weekCounts[k]++
    }
  }
  for (const [agentId, at] of Object.values(L.runs)) add(agentId, at, EXP.run, 'runs')
  for (const [agentId, at, priority] of Object.values(L.tickets)) add(agentId, at, ticketExp(priority), 'tickets')
  for (const [agentId, at] of Object.values(L.approvals)) add(agentId, at, EXP.approval, 'approvals')
  for (const k of L.kudos) add(k.agentId, k.at, EXP.kudos, 'kudos')
  for (const s of Object.values(out)) s.level = levelOf(s.total)
  return out
}

/** EXP mỗi agent vừa nhận thêm giữa hai bản sổ (chỉ tính mục mới) */
export function gainedBetween(prev: Ledger, next: Ledger): Map<string, number> {
  const g = new Map<string, number>()
  const add = (id: string, n: number) => g.set(id, (g.get(id) ?? 0) + n)
  for (const [id, [agentId]] of Object.entries(next.runs)) if (!prev.runs[id]) add(agentId, EXP.run)
  for (const [id, [agentId, , p]] of Object.entries(next.tickets)) if (!prev.tickets[id]) add(agentId, ticketExp(p))
  for (const [id, [agentId]] of Object.entries(next.approvals)) if (!prev.approvals[id]) add(agentId, EXP.approval)
  const seen = new Set(prev.kudos.map((k) => k.id))
  for (const k of next.kudos) if (!seen.has(k.id)) add(k.agentId, EXP.kudos)
  return g
}

/** Chữ "+EXP" bay lên trên đầu agent */
export interface ExpPop { id: number; amount: number; at: number }
/** Một lần lên cấp (hiệu ứng 3D + băng rôn trên đầu) */
export interface LevelUp { id: number; agentId: string; level: number }

interface ExpState {
  ledger: Ledger
  stats: Record<string, AgentExp>
  /** Đã có sổ lần đầu chưa */
  ready: boolean
  pops: Record<string, ExpPop>
  levelUps: LevelUp[]
}

export const useExp = create<ExpState>(() => ({ ledger: emptyLedger(), stats: {}, ready: false, pops: {}, levelUps: [] }))

/** Cấp của một agent (1 khi chưa có điểm nào) */
export const useLevel = (agentId: string) => useExp((s) => s.stats[agentId]?.level ?? 1)

export const LEVEL_FX_MS = 3200

let seq = 0

/**
 * Nhận sổ mới: tính lại EXP, và (trừ lần đầu) cho agent nào vừa được cộng điểm hiện "+EXP",
 * agent nào vừa lên cấp thì báo cho `onLevelUp` (thông báo, tiếng, agent ăn mừng).
 */
export function applyLedger(next: Ledger, onLevelUp?: (agentId: string, level: number) => void) {
  const s = useExp.getState()
  const stats = computeStats(next)
  if (!s.ready) {
    useExp.setState({ ledger: next, stats, ready: true })
    return
  }
  const gains = gainedBetween(s.ledger, next)
  const pops = { ...s.pops }
  for (const [id, amount] of gains) if (amount > 0) pops[id] = { id: ++seq, amount, at: Date.now() }
  const ups: LevelUp[] = []
  for (const [id, st] of Object.entries(stats)) {
    const before = s.stats[id]?.level ?? 1
    if (st.level > before) ups.push({ id: ++seq, agentId: id, level: st.level })
  }
  useExp.setState({ ledger: next, stats, pops, levelUps: [...s.levelUps, ...ups] })
  for (const u of ups) {
    onLevelUp?.(u.agentId, u.level)
    setTimeout(() => useExp.setState((x) => ({ levelUps: x.levelUps.filter((v) => v.id !== u.id) })), LEVEL_FX_MS)
  }
}

/** Lời khen tạo ngay trên trang (bản demo không có server) */
export const localKudos = (agentId: string, note: string): Kudos => ({
  id: `local-${Date.now()}-${++seq}`,
  agentId,
  at: Date.now(),
  note,
})

export type RankBy = 'week' | 'total'
export interface RankRow { agent: Agent; exp: number; stats: AgentExp | undefined }

/** Bảng xếp hạng: nhân viên đang làm (không tính ứng viên, người đã nghỉ), nhiều EXP trước */
export function ranking(agents: Agent[], stats: Record<string, AgentExp>, by: RankBy): RankRow[] {
  return agents
    .filter((a) => !a.candidate && a.status !== 'terminated')
    .map((a) => ({ agent: a, stats: stats[a.id], exp: stats[a.id]?.[by] ?? 0 }))
    .sort((x, y) => y.exp - x.exp || (y.stats?.total ?? 0) - (x.stats?.total ?? 0) || x.agent.name.localeCompare(y.agent.name))
}

/** Tiến độ tới cấp sau: [đã có trong cấp này, cần cho cả cấp] */
export function levelProgress(total: number): [number, number] {
  const lv = levelOf(total)
  return [total - expForLevel(lv), expForLevel(lv + 1) - expForLevel(lv)]
}
