import { paperclipUrl } from '../config'
import type { Agent, AgentStatus, ChatAsk, ChatInfo, ChatMessage, Comment, Company, Issue } from './types'

/**
 * Lớp adapter DUY NHẤT nói chuyện với Paperclip (bản 2026.916.1). Đây là API nội bộ, không cam kết ổn định:
 * Paperclip đổi gì thì chỉ sửa file này. Mọi lời gọi đi qua proxy /api của Vite (có allow-list).
 */
/** Công ty đang xem. Chọn lúc khởi động (src/data/sync.ts), đổi công ty thì tải lại trang. */
let companyId = ''
export const setCompanyId = (id: string) => { companyId = id }

// ── Dạng dữ liệu thô (chỉ những trường Coopverse dùng) ──

export interface PcHealth { status: string; version: string; deploymentMode: string }

interface PcCompany { id: string; name: string; status: string; issuePrefix: string | null }

interface PcAgent {
  id: string
  name: string
  title: string | null
  role: string
  status: string
  reportsTo: string | null
  pauseReason: string | null
  errorReason: string | null
}

interface PcIssue {
  id: string
  identifier: string
  title: string
  status: string
  assigneeAgentId: string | null
  updatedAt: string
  completedAt: string | null
  priority: string | null
  /** Có giá trị = đây là cuộc trò chuyện Agent Chat, không phải ticket công việc */
  conversationAgentId?: string | null
  conversationState?: string | null
}

interface PcComment {
  id: string
  body: string
  createdAt: string
  authorAgentId: string | null
  authorUserId?: string | null
  authorType: string
  deletedAt: string | null
}

/** Câu hỏi / thẻ duyệt agent tạo trên ticket (GET /issues/:id/interactions). */
interface PcInteraction {
  id: string
  kind: string
  status: string
  title: string | null
  summary: string | null
  payload: { prompt?: string; questions?: { prompt?: string; question?: string }[] } | null
}

/** GET /companies/:id/live-runs chỉ trả run đang `queued` hoặc `running`. */
interface PcLiveRun { id: string; agentId: string; status: string; issueId: string | null }

/** Sự kiện từ WebSocket /api/companies/:id/events/ws */
export interface PcLiveEvent { id: number; type: string; createdAt: string; payload: Record<string, unknown> }

export interface Snapshot { agents: Agent[]; issues: Issue[]; chats: ChatInfo[] }

export class PaperclipError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        accept: 'application/json',
        // Proxy Coopverse chỉ nhận lệnh ghi có header này (xem vite.config.ts)
        ...(method === 'POST' ? { 'content-type': 'application/json', 'x-coopverse': '1' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new PaperclipError(0, 'Không gọi được proxy Coopverse')
  }
  if (!res.ok) {
    let msg = `Paperclip trả ${res.status} cho ${path}`
    try {
      const j = (await res.json()) as { error?: unknown }
      if (typeof j.error === 'string') msg = j.error
    } catch { /* thân không phải JSON */ }
    throw new PaperclipError(res.status, msg)
  }
  return res.json() as Promise<T>
}

const get = <T>(path: string) => call<T>('GET', path)
const post = <T>(path: string, body?: unknown) => call<T>('POST', path, body ?? {})

/** Lượt chạy (heartbeat run) ở dạng Coopverse cần. */
export interface Run {
  id: string
  agentId: string
  status: string
  startedAt: string | null
  finishedAt: string | null
  /** Kích thước log hiện tại (byte), nếu Paperclip biết */
  logBytes: number | null
  issueId: string | null
  error: string | null
}

interface PcRun {
  id: string
  agentId: string
  status: string
  startedAt: string | null
  finishedAt: string | null
  logBytes: number | null
  lastOutputBytes: number | null
  error: string | null
  contextSnapshot: { issueId?: string } | null
}

const toRun = (r: PcRun): Run => ({
  id: r.id,
  agentId: r.agentId,
  status: r.status,
  startedAt: r.startedAt,
  finishedAt: r.finishedAt,
  logBytes: r.logBytes ?? r.lastOutputBytes ?? null,
  issueId: r.contextSnapshot?.issueId ?? null,
  error: r.error,
})

/** Run chưa kết thúc thì còn đọc tiếp log. */
export const isRunActive = (status: string) => status === 'queued' || status === 'running'

/** Một đoạn log thô: các dòng NDJSON `{ts, stream, chunk}`; `nextOffset` có nghĩa là còn nữa. */
export interface LogPage { content: string; nextOffset?: number }

/** Địa chỉ trang Paperclip (mở thẳng, không qua proxy). Tiền tố công ty lấy từ mã ticket, vd LAB-12 → LAB. */
export const PAPERCLIP_UI = paperclipUrl(import.meta.env.VITE_PAPERCLIP_URL)
export const issueUrl = (key: string) => `${PAPERCLIP_UI}/${key.split('-')[0]}/issues/${key}`
/** Trang chat với agent trong Paperclip (tiền tố công ty, vd LAB). */
export const chatUrl = (prefix: string, agentId: string) => `${PAPERCLIP_UI}/${prefix}/chats/${agentId}`

// ── Map sang dạng của Coopverse ──

const AGENT_STATUS: Record<string, AgentStatus> = {
  running: 'running',
  idle: 'idle',
  active: 'idle',
  paused: 'paused',
  pending_approval: 'paused',
  error: 'error',
  terminated: 'terminated',
}

export const toStatus = (s: string): AgentStatus => AGENT_STATUS[s] ?? 'idle'

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

function toIssues(raw: PcIssue[]): Issue[] {
  return raw.map((i) => ({
    id: i.id,
    key: i.identifier,
    title: i.title,
    status: i.status,
    assigneeId: i.assigneeAgentId,
    updatedAt: i.updatedAt,
    completedAt: i.completedAt,
    priority: i.priority ?? undefined,
  }))
}

function toChats(raw: PcIssue[]): ChatInfo[] {
  return raw
    .filter((i) => i.conversationAgentId)
    .map((i) => ({
      issueId: i.id,
      agentId: i.conversationAgentId!,
      key: i.identifier,
      state: i.conversationState === 'active' || i.status === 'in_progress' ? 'active' : 'waiting',
    }))
}

function toAgents(raw: PcAgent[], issues: Issue[], chats: ChatInfo[], runs: PcLiveRun[]): Agent[] {
  const issueById = new Map(issues.map((i) => [i.id, i]))
  const chatIds = new Set(chats.map((c) => c.issueId))
  return raw.map((a) => {
    const run = runs.find((r) => r.agentId === a.id && r.status === 'running') ?? runs.find((r) => r.agentId === a.id)
    let status = toStatus(a.status)
    // Trạng thái agent đôi khi cập nhật chậm hơn run
    if (status === 'idle' && run?.status === 'running') status = 'running'
    const chatting = !!run?.issueId && chatIds.has(run.issueId)
    const issue = chatting
      ? undefined
      : (run?.issueId ? issueById.get(run.issueId) : undefined) ??
        issues.find((i) => i.assigneeId === a.id && i.status === 'in_progress')
    return {
      id: a.id,
      name: a.name,
      title: a.title || a.role,
      status,
      reportsTo: a.reportsTo,
      task: chatting ? 'Đang trả lời chat' : issue ? `${issue.key} · ${short(issue.title, 34)}` : undefined,
      issueId: issue?.id,
      runId: run?.id,
      reason: (status === 'error' ? a.errorReason : status === 'paused' ? a.pauseReason : null) ?? undefined,
      chatting: chatting || undefined,
    }
  })
}

/** Tin nhắn trong chat, cũ trước. `/new` của bạn là vạch "phiên mới". */
function toMessages(raw: PcComment[]): ChatMessage[] {
  return raw
    .filter((c) => !c.deletedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((c): ChatMessage => {
      if (c.authorAgentId) return { id: c.id, from: 'agent', body: c.body, createdAt: c.createdAt }
      if (c.body.trim() === '/new') return { id: c.id, from: 'system', body: 'Phiên trò chuyện mới', createdAt: c.createdAt }
      return { id: c.id, from: c.authorUserId || c.authorType === 'user' ? 'me' : 'system', body: c.body, createdAt: c.createdAt }
    })
}

function toAsk(i: PcInteraction): ChatAsk {
  const qs = i.payload?.questions?.map((q) => q.prompt ?? q.question).filter(Boolean) ?? []
  const text = i.payload?.prompt ?? (qs.length ? qs.join('\n') : i.summary ?? '')
  return { id: i.id, title: i.title ?? 'Agent đang hỏi bạn', text }
}

// ── API ──

export const paperclip = {
  health: () => get<PcHealth>('/health'),

  /** Mọi công ty trên Paperclip này (bỏ công ty đã lưu trữ). */
  async companies(): Promise<Company[]> {
    const raw = await get<PcCompany[]>('/companies')
    return raw.filter((c) => c.status !== 'archived').map((c) => ({ id: c.id, name: c.name, prefix: c.issuePrefix ?? '' }))
  },

  /** Một lượt đọc đầy đủ: agent + ticket + run đang chạy. */
  async snapshot(): Promise<Snapshot> {
    const [agents, issues, runs] = await Promise.all([
      get<PcAgent[]>(`/companies/${companyId}/agents`),
      get<PcIssue[]>(`/companies/${companyId}/issues`),
      get<PcLiveRun[]>(`/companies/${companyId}/live-runs`),
    ])
    // Cuộc trò chuyện Agent Chat cũng là "ticket" trong Paperclip: tách riêng
    const chats = toChats(issues)
    const iss = toIssues(issues.filter((i) => !i.conversationAgentId))
    return { agents: toAgents(agents, iss, chats, runs), issues: iss, chats }
  },

  /** Run mới nhất của một agent (kể cả đã xong). */
  async latestRun(agentId: string): Promise<Run | null> {
    const runs = await get<PcRun[]>(`/companies/${companyId}/heartbeat-runs?agentId=${agentId}&limit=1&summary=1`)
    return runs[0] ? toRun(runs[0]) : null
  },

  run: (runId: string) => get<PcRun>(`/heartbeat-runs/${runId}`).then(toRun),

  /** Đọc log từ `offset` (byte). Tối đa 1 MB mỗi lần. */
  log: (runId: string, offset: number, limitBytes = 512_000) =>
    get<LogPage>(`/heartbeat-runs/${runId}/log?offset=${offset}&limitBytes=${limitBytes}`),

  /** Comment của ticket, mới nhất trước. */
  async comments(issueId: string): Promise<Comment[]> {
    const raw = await get<PcComment[]>(`/issues/${issueId}/comments`)
    return raw
      .filter((c) => !c.deletedAt)
      .map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt, authorAgentId: c.authorAgentId, authorType: c.authorType }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  // ── Agent Chat (tính năng thử nghiệm của Paperclip, bật trong Instance settings → Experimental) ──

  async chatEnabled(): Promise<boolean> {
    const s = await get<{ enableAgentChat?: boolean }>('/instance/settings/experimental')
    return s.enableAgentChat === true
  },

  /** Cuộc trò chuyện của bạn với agent; null nếu chưa nhắn lần nào. Chỉ đọc, không tạo. */
  async chat(agentId: string): Promise<ChatInfo | null> {
    const i = await get<PcIssue | null>(`/companies/${companyId}/chats/${agentId}`)
    return i ? toChats([{ ...i, conversationAgentId: i.conversationAgentId ?? agentId }])[0] : null
  },

  /** Tạo cuộc trò chuyện (lần nhắn đầu tiên). Đã có thì Paperclip trả lại cái cũ. */
  async openChat(agentId: string): Promise<ChatInfo> {
    const i = await post<PcIssue>(`/companies/${companyId}/chats/${agentId}`)
    return toChats([{ ...i, conversationAgentId: i.conversationAgentId ?? agentId }])[0]
  },

  chatMessages: (issueId: string) => get<PcComment[]>(`/issues/${issueId}/comments`).then(toMessages),

  /** Câu hỏi / thẻ duyệt agent gửi trong chat mà bạn chưa trả lời. */
  async chatAsks(issueId: string): Promise<ChatAsk[]> {
    const raw = await get<PcInteraction[]>(`/issues/${issueId}/interactions`)
    return raw.filter((i) => i.status === 'pending').map(toAsk)
  },

  /**
   * Gửi một tin. Paperclip tự đánh thức agent trả lời (một lượt chạy, tốn hạn mức).
   * `clientRequestId` bắt buộc: gửi lại cùng id thì Paperclip không tạo tin trùng.
   */
  sendChat: (issueId: string, body: string, clientRequestId: string) =>
    post<PcComment>(`/issues/${issueId}/comments`, { body, clientRequestId }),

  // ── Lệnh (giao diện luôn hỏi xác nhận trước khi gọi) ──

  wake: (agentId: string) =>
    post(`/agents/${agentId}/wakeup`, { source: 'on_demand', triggerDetail: 'manual', reason: 'coopverse_manual_wake' }),
  pause: (agentId: string) => post(`/agents/${agentId}/pause`),
  resume: (agentId: string) => post(`/agents/${agentId}/resume`),
  comment: (issueId: string, body: string) => post(`/issues/${issueId}/comments`, { body }),

  /** Mở WebSocket sự kiện realtime. Trả về hàm đóng. */
  openEvents(h: { onOpen: () => void; onEvent: (e: PcLiveEvent) => void; onClose: () => void }): () => void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/api/companies/${companyId}/events/ws`)
    ws.onopen = h.onOpen
    ws.onmessage = (m) => {
      try { h.onEvent(JSON.parse(String(m.data)) as PcLiveEvent) } catch { /* bỏ qua gói lạ */ }
    }
    ws.onclose = h.onClose
    return () => { ws.onclose = null; ws.close() }
  },
}

/** Ý nghĩa của một sự kiện realtime đối với Coopverse. */
export type LiveChange =
  | { kind: 'agent-status'; agentId: string; status: AgentStatus }
  | { kind: 'refresh' }
  | { kind: 'ignore' }

export function classifyEvent(e: PcLiveEvent): LiveChange {
  switch (e.type) {
    case 'agent.status': {
      const { agentId, status } = e.payload
      if (typeof agentId === 'string' && typeof status === 'string') {
        return { kind: 'agent-status', agentId, status: toStatus(status) }
      }
      return { kind: 'refresh' }
    }
    case 'heartbeat.run.status':
    case 'heartbeat.run.queued':
    case 'activity.logged':
      return { kind: 'refresh' }
    default:
      // heartbeat.run.log / .event / .progress: giai đoạn 3 (CLI)
      return { kind: 'ignore' }
  }
}
