import { create } from 'zustand'
import { input } from './runtime'
import type { NoteDraft, NoteKind } from './data/notify'
import { STATUS_CYCLE, type Agent, type ChatInfo, type Company, type Issue } from './data/types'

interface Toast { id: number; text: string }
export interface Note { id: number; kind: NoteKind; text: string }

/** connecting: chưa có dữ liệu · live: đang nhận realtime · offline: mất Paperclip · demo: dữ liệu giả (?demo) */
export type Conn = 'connecting' | 'live' | 'offline' | 'demo'

const NOTE_MS = 9000
const MAX_NOTES = 5

interface CoopState {
  /** Mọi công ty trên Paperclip này, và công ty đang xem (null khi demo hoặc chưa đọc được) */
  companies: Company[]
  company: Company | null
  agents: Agent[]
  issues: Issue[]
  /** Cuộc trò chuyện Agent Chat của bạn với từng agent (đã nhắn ít nhất một lần) */
  chats: ChatInfo[]
  conn: Conn
  /** Đã từng nhận được dữ liệu thật chưa */
  hasData: boolean
  version: string | null
  /** Lúc sẽ thử kết nối lại (ms), khi offline */
  retryAt: number | null
  notes: Note[]
  /** Agent đang được đánh dấu trên minimap */
  ping: { id: string; at: number } | null
  nearId: string | null
  /** Agent đang được xem màn hình (camera zoom vào, hiện CLI) */
  focusId: string | null
  /** Đứng trước bảng ticket (bấm E để xem) */
  nearBoard: boolean
  /** Đang xem bảng ticket phóng to */
  boardOpen: boolean
  /** Tủ đồ đang mở cho ai ('player' = bạn, hoặc id agent) */
  wardrobeId: string | null
  settingsOpen: boolean
  locked: boolean
  toast: Toast | null

  setCompanies: (companies: Company[], company: Company | null) => void
  setSnapshot: (agents: Agent[], issues: Issue[], chats?: ChatInfo[]) => void
  setConn: (conn: Conn, retryAt?: number | null) => void
  setVersion: (v: string | null) => void
  pushNotes: (drafts: NoteDraft[]) => void
  dismissNote: (id: number) => void
  pingAgent: (id: string) => void
  setNear: (id: string | null, board?: boolean) => void
  setLocked: (v: boolean) => void
  showToast: (text: string) => void
  openFocus: (id: string) => void
  closeFocus: () => void
  openBoard: () => void
  closeBoard: () => void
  openWardrobe: (id?: string) => void
  closeWardrobe: () => void
  toggleSettings: () => void
  /** Esc: đóng lớp đang mở trên cùng. Trả về false nếu không có gì để đóng. */
  closeTop: () => boolean
  /** Chỉ bản demo: bấm vào tên trong danh sách để đổi trạng thái */
  cycleStatus: (id: string) => void
  interact: () => void
}

let seq = 0

export const useCoop = create<CoopState>((set, get) => ({
  companies: [],
  company: null,
  agents: [],
  issues: [],
  chats: [],
  conn: 'connecting',
  hasData: false,
  version: null,
  retryAt: null,
  notes: [],
  ping: null,
  nearId: null,
  focusId: null,
  nearBoard: false,
  boardOpen: false,
  wardrobeId: null,
  settingsOpen: false,
  locked: false,
  toast: null,

  setCompanies: (companies, company) => set({ companies, company }),
  setSnapshot: (agents, issues, chats = []) => set({ agents, issues, chats, hasData: true }),
  setConn: (conn, retryAt = null) => set({ conn, retryAt }),
  setVersion: (version) => set({ version }),
  pushNotes: (drafts) => {
    if (!drafts.length) return
    const added = drafts.map((d) => ({ ...d, id: ++seq }))
    set((s) => ({ notes: [...s.notes, ...added].slice(-MAX_NOTES) }))
    for (const n of added) setTimeout(() => get().dismissNote(n.id), NOTE_MS)
  },
  dismissNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
  pingAgent: (id) => set({ ping: { id, at: performance.now() } }),
  setNear: (id, board = false) => set({ nearId: id, nearBoard: board }),
  setLocked: (v) => set({ locked: v }),
  showToast: (text) => set({ toast: { id: ++seq, text } }),
  cycleStatus: (id) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === id ? { ...a, status: STATUS_CYCLE[(STATUS_CYCLE.indexOf(a.status) + 1) % STATUS_CYCLE.length] } : a,
      ),
    })),
  openFocus: (id) => {
    // Nhả chuột để bấm được nút trong CLI
    if (document.pointerLockElement) document.exitPointerLock()
    input.keys.clear()
    set({ focusId: id, settingsOpen: false })
  },
  closeFocus: () => set({ focusId: null }),
  openBoard: () => {
    if (document.pointerLockElement) document.exitPointerLock()
    input.keys.clear()
    set({ boardOpen: true, settingsOpen: false })
  },
  closeBoard: () => set({ boardOpen: false }),
  openWardrobe: (id) => {
    if (document.pointerLockElement) document.exitPointerLock()
    input.keys.clear()
    // Mặc định: người đang đứng gần, không thì chính mình
    set((s) => ({ wardrobeId: id ?? s.nearId ?? 'player', settingsOpen: false }))
  },
  closeWardrobe: () => set({ wardrobeId: null }),
  // Bảng cài đặt nhỏ, không che màn hình: vẫn đi lại được khi đang mở
  toggleSettings: () => {
    if (!get().settingsOpen && document.pointerLockElement) document.exitPointerLock()
    set((s) => ({ settingsOpen: !s.settingsOpen, wardrobeId: null }))
  },
  closeTop: () => {
    const s = get()
    if (s.wardrobeId) set({ wardrobeId: null })
    else if (s.settingsOpen) set({ settingsOpen: false })
    else if (s.focusId) set({ focusId: null })
    else if (s.boardOpen) set({ boardOpen: false })
    else return false
    return true
  },
  /** Phím E: mở màn hình agent / bảng ticket đang đứng gần, hoặc đóng nếu đang xem */
  interact: () => {
    const { focusId, boardOpen, nearId, nearBoard, agents, openFocus, closeFocus, openBoard, closeBoard, showToast, wardrobeId } = get()
    if (wardrobeId) return
    if (focusId) return closeFocus()
    if (boardOpen) return closeBoard()
    if (nearBoard) return openBoard()
    const a = agents.find((x) => x.id === nearId)
    if (!a) return
    if (a.status === 'terminated') return showToast(`${a.name} đã nghỉ việc, máy đã tắt.`)
    openFocus(a.id)
  },
}))
