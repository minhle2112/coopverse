import { ISSUE_STATUS_LABEL, type Agent, type Issue } from './types'

export type NoteKind = 'start' | 'done' | 'warn' | 'error' | 'info'
export interface NoteDraft { kind: NoteKind; text: string }

const short = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/** So sánh hai lượt dữ liệu và sinh thông báo tiếng Việt cho những gì vừa đổi. */
export function diffNotes(prevAgents: Agent[], agents: Agent[], prevIssues: Issue[], issues: Issue[]): NoteDraft[] {
  const out: NoteDraft[] = []

  const before = new Map(prevAgents.map((a) => [a.id, a]))
  for (const a of agents) {
    const p = before.get(a.id)
    if (!p) {
      out.push({ kind: 'info', text: `${a.name} vừa vào văn phòng` })
      continue
    }
    if (p.status === a.status) {
      if (a.status === 'running' && a.task && p.task && a.task !== p.task) {
        out.push({ kind: 'start', text: `${a.name} chuyển sang ${a.task}` })
      }
      continue
    }
    switch (a.status) {
      case 'running':
        out.push({ kind: 'start', text: a.task ? `${a.name} bắt đầu làm ${a.task}` : `${a.name} bắt đầu làm việc` })
        break
      case 'idle':
        out.push(
          p.status === 'running'
            ? { kind: 'done', text: `${a.name} làm xong, đang rảnh` }
            : { kind: 'info', text: `${a.name} đã sẵn sàng làm việc` },
        )
        break
      case 'paused':
        out.push({ kind: 'warn', text: `${a.name} tạm dừng${a.reason ? `: ${short(a.reason)}` : ''}` })
        break
      case 'error':
        out.push({ kind: 'error', text: `${a.name} gặp lỗi${a.reason ? `: ${short(a.reason)}` : ''}` })
        break
      case 'terminated':
        out.push({ kind: 'info', text: `${a.name} đã nghỉ việc` })
        break
    }
  }
  for (const p of prevAgents) {
    if (!agents.some((a) => a.id === p.id)) out.push({ kind: 'info', text: `${p.name} đã rời văn phòng` })
  }

  const nameOf = (id: string | null) => agents.find((a) => a.id === id)?.name
  const oldIssues = new Map(prevIssues.map((i) => [i.id, i]))
  for (const i of issues) {
    const p = oldIssues.get(i.id)
    const who = nameOf(i.assigneeId)
    if (!p) {
      out.push({ kind: 'info', text: `Ticket mới ${i.key}: ${short(i.title)}${who ? ` → ${who}` : ''}` })
      continue
    }
    if (p.status === i.status) continue
    const label = ISSUE_STATUS_LABEL[i.status] ?? i.status
    if (i.status === 'done') out.push({ kind: 'done', text: `${i.key} xong${who ? ` (${who})` : ''}` })
    else if (i.status === 'in_review') out.push({ kind: 'info', text: `${i.key} chờ duyệt${who ? ` · ${who}` : ''}` })
    else if (i.status === 'blocked') out.push({ kind: 'warn', text: `${i.key} bị chặn` })
    else if (i.status === 'cancelled') out.push({ kind: 'info', text: `${i.key} đã huỷ` })
    else if (i.status === 'todo' && p.status === 'done') out.push({ kind: 'info', text: `${i.key} mở lại · ${label}` })
  }
  return out
}
