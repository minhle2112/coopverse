import type { Agent } from './types'

/** Mỗi agent tối đa bao nhiêu agent con (luật trong AGENTS.md; Coopverse chỉ cảnh báo, bạn vẫn duyệt được) */
export const MAX_SUBS = 2

/** Cấp trong sơ đồ tổ chức: 0 = gốc (Lead / không báo cáo cho ai trong công ty), 1 = thành viên, 2+ = agent con. */
export function depthOf(agents: Agent[], id: string | null | undefined): number {
  const seen = new Set<string>()
  let cur = agents.find((a) => a.id === id)
  let d = 0
  while (cur?.reportsTo && !seen.has(cur.id)) {
    seen.add(cur.id)
    const up = agents.find((a) => a.id === cur!.reportsTo)
    if (!up) break
    d++
    cur = up
  }
  return d
}

/** Agent con đang làm (đã được duyệt, chưa nghỉ) của một agent */
export const subsOf = (agents: Agent[], id: string) =>
  agents.filter((a) => a.reportsTo === id && !a.candidate && a.status !== 'terminated')

export interface HireWarning { level: 'red' | 'warn'; text: string }

/**
 * Ứng viên có được quyền thuê tiếp không. Payload phiếu không chứa quyền, nên đọc từ agent ứng viên
 * (Paperclip tạo sẵn ở trạng thái chờ duyệt); không có thì xem payload (bản demo).
 */
export function candidateCanHire(agents: Agent[], payload: Record<string, unknown>): boolean | undefined {
  const cand = agents.find((a) => a.id === payload.agentId)
  if (cand?.canHire !== undefined) return cand.canHire
  const v = (payload.permissions as { canCreateAgents?: unknown } | undefined)?.canCreateAgents
  return typeof v === 'boolean' ? v : undefined
}

/**
 * Kiểm phiếu thuê theo luật đã thống nhất: tối đa 2 agent con mỗi agent, agent con không thuê tiếp,
 * agent con không được quyền thuê, model rẻ. Lead gốc thuê thành viên cho nhóm thì không giới hạn.
 */
export function hireWarnings(agents: Agent[], requesterId: string | null, payload: Record<string, unknown>): HireWarning[] {
  const out: HireWarning[] = []
  const who = agents.find((a) => a.id === requesterId)
  const name = (id: unknown) => agents.find((a) => a.id === id)?.name
  const reportsTo = typeof payload.reportsTo === 'string' ? payload.reportsTo : null
  // Cấp của agent mới = cấp người nó báo cáo + 1
  const newDepth = reportsTo ? depthOf(agents, reportsTo) + 1 : 0

  if (who) {
    const d = depthOf(agents, who.id)
    if (d >= 2) out.push({ level: 'red', text: `${who.name} là agent con. Theo luật, agent con không được thuê thêm.` })
    else if (d === 1) {
      const subs = subsOf(agents, who.id)
      if (subs.length >= MAX_SUBS) {
        out.push({ level: 'red', text: `${who.name} đã có ${subs.length} agent con (${subs.map((a) => a.name).join(', ')}). Giới hạn là ${MAX_SUBS}.` })
      }
    }
    if (reportsTo && reportsTo !== who.id) {
      out.push({ level: 'warn', text: `Agent mới báo cáo cho ${name(reportsTo) ?? 'người khác'}, không phải ${who.name}.` })
    }
  }
  if (!reportsTo) out.push({ level: 'warn', text: 'Agent mới không báo cáo cho ai, sẽ thành một Lead riêng.' })

  if (newDepth >= 2 && candidateCanHire(agents, payload) !== false) {
    out.push({ level: 'red', text: 'Agent con này sẽ có quyền thuê tiếp (phiếu không tắt canCreateAgents).' })
  }

  const model = String((payload.adapterConfig as { model?: unknown } | undefined)?.model ?? '')
  if (/opus/i.test(model)) out.push({ level: 'warn', text: `Model đắt (${model}). Việc lặp lại thường chỉ cần model rẻ hơn.` })
  return out
}
