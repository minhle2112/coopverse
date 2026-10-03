export type AgentStatus = 'running' | 'idle' | 'paused' | 'error' | 'terminated'

/** Dạng agent mà thế giới 3D dùng. Adapter Paperclip (`paperclip.ts`) map dữ liệu thật sang dạng này. */
export interface Agent {
  id: string
  name: string
  title: string
  status: AgentStatus
  reportsTo: string | null
  /** Ticket đang làm, dạng "LAB-14 · tiêu đề" */
  task?: string
  /** Ticket và run đang chạy (giai đoạn 3 dùng để mở log) */
  issueId?: string
  runId?: string
  /** Lý do tạm dừng / lỗi từ Paperclip */
  reason?: string
  /** Lượt chạy hiện tại là để trả lời chat (không phải làm ticket) */
  chatting?: boolean
  /** Agent giả chỉ để demo bố cục */
  demo?: boolean
}

/** Một công ty trên Paperclip (mỗi công ty là một văn phòng riêng). */
export interface Company {
  id: string
  name: string
  /** Tiền tố mã ticket, vd LAB */
  prefix: string
}

/** Ticket rút gọn từ Paperclip. */
export interface Issue {
  id: string
  key: string
  title: string
  status: string
  assigneeId: string | null
  updatedAt: string
  completedAt?: string | null
  /** critical | high | medium | low */
  priority?: string
}

/**
 * Cuộc trò chuyện (Agent Chat của Paperclip) giữa bạn và một agent. Trong Paperclip đây là một ticket đặc biệt,
 * nên Coopverse tách nó ra khỏi danh sách ticket (không lên bảng, không sinh thông báo ticket).
 */
export interface ChatInfo {
  issueId: string
  agentId: string
  key: string
  /** active = agent đang trả lời · waiting = chờ bạn nhắn */
  state: 'active' | 'waiting'
}

/** Một tin trong cuộc trò chuyện. */
export interface ChatMessage {
  id: string
  from: 'me' | 'agent' | 'system'
  body: string
  createdAt: string
  /** Tin của mình vừa gửi, chưa được Paperclip xác nhận */
  sending?: boolean
}

/** Câu hỏi / yêu cầu duyệt agent gửi trong chat, đang chờ bạn trả lời (trả lời trong Paperclip). */
export interface ChatAsk {
  id: string
  title: string
  text: string
}

/** Comment rút gọn của ticket. */
export interface Comment {
  id: string
  body: string
  createdAt: string
  authorAgentId: string | null
  authorType: string
}

export const STATUS_LABEL: Record<AgentStatus, string> = {
  running: 'Đang làm',
  idle: 'Rảnh',
  paused: 'Tạm dừng',
  error: 'Lỗi',
  terminated: 'Đã nghỉ',
}

export const STATUS_COLOR: Record<AgentStatus, string> = {
  running: '#3ccf6e',
  idle: '#f2b544',
  paused: '#8a94a6',
  error: '#ef5a4c',
  terminated: '#5b6270',
}

export const STATUS_CYCLE: AgentStatus[] = ['running', 'idle', 'paused', 'error', 'terminated']

export const ISSUE_STATUS_LABEL: Record<string, string> = {
  backlog: 'Tồn đọng',
  todo: 'Cần làm',
  in_progress: 'Đang làm',
  in_review: 'Chờ duyệt',
  done: 'Xong',
  blocked: 'Bị chặn',
  cancelled: 'Đã huỷ',
}
