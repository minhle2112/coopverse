import { create } from 'zustand'
import { input } from './runtime'
import type { NoteDraft, NoteKind } from './data/notify'
import { STATUS_CYCLE, type Agent, type Ask, type ChatInfo, type Company, type Issue } from './data/types'

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
  /** Việc đang chờ bạn quyết: phiếu duyệt + câu hỏi của agent */
  asks: Ask[]
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
  /** Người / bảng đang được rê chuột lên trên bản đồ pixel (id agent, 'player', '#board', '#fame') */
  hoverId: string | null
  /** Agent đang được xem màn hình (camera zoom vào, hiện CLI) */
  focusId: string | null
  /** Đứng trước bảng ticket (bấm E để xem) */
  nearBoard: boolean
  /** Đang xem bảng ticket phóng to */
  boardOpen: boolean
  /** Đứng trước bảng vàng (xếp hạng EXP) */
  nearFame: boolean
  /** Đang xem bảng vàng phóng to */
  fameOpen: boolean
  /** Tủ đồ đang mở cho ai ('player' = bạn, hoặc id agent) */
  wardrobeId: string | null
  settingsOpen: boolean
  /** Chế độ dọn dẹp (phím B): hiện giá từng chỗ bẩn, bấm chỗ nào để trả Xu dọn chỗ đó */
  cleanOpen: boolean
  /** Chỗ bẩn đang chọn trong chế độ dọn dẹp (id trong src/data/officeState.ts) */
  cleanPick: string | null
  /** Danh sách "Chờ duyệt" (phím Q) đang mở */
  inboxOpen: boolean
  /** Thẻ duyệt nhanh đang mở (id việc chờ): mở từ danh sách, không cần đi tới bàn */
  askId: string | null
  locked: boolean
  toast: Toast | null

  setCompanies: (companies: Company[], company: Company | null) => void
  /** `asks` không truyền = giữ danh sách việc chờ hiện tại */
  setSnapshot: (agents: Agent[], issues: Issue[], chats?: ChatInfo[], asks?: Ask[]) => void
  /** Bỏ một việc chờ ngay khi bạn vừa xử lý xong (không chờ Paperclip đọc lại) */
  removeAsk: (id: string) => void
  toggleInbox: () => void
  openAsk: (id: string) => void
  closeAsk: () => void
  setConn: (conn: Conn, retryAt?: number | null) => void
  setVersion: (v: string | null) => void
  pushNotes: (drafts: NoteDraft[]) => void
  dismissNote: (id: number) => void
  pingAgent: (id: string) => void
  setNear: (id: string | null, board?: boolean, fame?: boolean) => void
  setHover: (id: string | null) => void
  /** Mở thứ của một người: agent → CLI, ứng viên → phiếu thuê, đã nghỉ → báo. Dùng cho phím E, bấm chuột, danh sách nhân sự */
  openAgent: (id: string) => void
  setLocked: (v: boolean) => void
  showToast: (text: string) => void
  openFocus: (id: string) => void
  closeFocus: () => void
  openBoard: () => void
  closeBoard: () => void
  openFame: () => void
  closeFame: () => void
  openWardrobe: (id?: string) => void
  closeWardrobe: () => void
  toggleSettings: () => void
  toggleClean: () => void
  pickClean: (id: string | null) => void
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
  asks: [],
  conn: 'connecting',
  hasData: false,
  version: null,
  retryAt: null,
  notes: [],
  ping: null,
  nearId: null,
  hoverId: null,
  focusId: null,
  nearBoard: false,
  boardOpen: false,
  nearFame: false,
  fameOpen: false,
  wardrobeId: null,
  settingsOpen: false,
  cleanOpen: false,
  cleanPick: null,
  inboxOpen: false,
  askId: null,
  locked: false,
  toast: null,

  setCompanies: (companies, company) => set({ companies, company }),
  setSnapshot: (agents, issues, chats = [], asks) =>
    set((s) => {
      const list = asks ?? s.asks
      // Việc đang mở đã được xử lý ở nơi khác (vd trong Paperclip): đóng thẻ
      const askId = s.askId && list.some((a) => a.id === s.askId) ? s.askId : null
      return { agents, issues, chats, asks: list, askId, hasData: true }
    }),
  removeAsk: (id) => set((s) => ({ asks: s.asks.filter((a) => a.id !== id), askId: s.askId === id ? null : s.askId })),
  toggleInbox: () => {
    if (!get().inboxOpen && document.pointerLockElement) document.exitPointerLock()
    set((s) => ({ inboxOpen: !s.inboxOpen }))
  },
  openAsk: (id) => {
    if (document.pointerLockElement) document.exitPointerLock()
    input.keys.clear()
    set({ askId: id, settingsOpen: false })
  },
  closeAsk: () => set({ askId: null }),
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
  setNear: (id, board = false, fame = false) => set({ nearId: id, nearBoard: board, nearFame: fame }),
  setHover: (id) => set({ hoverId: id }),
  openAgent: (id) => {
    const { agents, asks, openAsk, openFocus, showToast } = get()
    const a = agents.find((x) => x.id === id)
    if (!a) return
    // Mở từ danh sách nhân sự khi đang xem thứ khác: đóng cái đang xem, không chồng hai bảng lên nhau
    set({ focusId: null, boardOpen: false, fameOpen: false, wardrobeId: null, askId: null, inboxOpen: false })
    // Ứng viên ở sảnh: mở hồ sơ (phiếu thuê) để duyệt
    if (a.candidate) {
      const hire = asks.find((x) => x.candidateId === a.id)
      return hire ? openAsk(hire.id) : showToast(`Hồ sơ của ${a.name} chưa tải xong, thử lại sau giây lát.`)
    }
    if (a.status === 'terminated') return showToast(`${a.name} đã nghỉ việc, máy đã tắt.`)
    openFocus(a.id)
  },
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
    set({ focusId: id, settingsOpen: false, inboxOpen: false })
  },
  closeFocus: () => set({ focusId: null }),
  openBoard: () => {
    if (document.pointerLockElement) document.exitPointerLock()
    input.keys.clear()
    set({ boardOpen: true, settingsOpen: false, inboxOpen: false })
  },
  closeBoard: () => set({ boardOpen: false }),
  openFame: () => {
    if (document.pointerLockElement) document.exitPointerLock()
    input.keys.clear()
    set({ fameOpen: true, settingsOpen: false, inboxOpen: false })
  },
  closeFame: () => set({ fameOpen: false }),
  openWardrobe: (id) => {
    if (document.pointerLockElement) document.exitPointerLock()
    input.keys.clear()
    // Mặc định: người đang đứng gần, không thì chính mình
    set((s) => ({ wardrobeId: id ?? s.nearId ?? 'player', settingsOpen: false, inboxOpen: false }))
  },
  closeWardrobe: () => set({ wardrobeId: null }),
  // Bảng cài đặt nhỏ, không che màn hình: vẫn đi lại được khi đang mở
  toggleSettings: () => {
    if (!get().settingsOpen && document.pointerLockElement) document.exitPointerLock()
    set((s) => ({ settingsOpen: !s.settingsOpen, wardrobeId: null, cleanOpen: false, cleanPick: null }))
  },
  // Như cài đặt: bảng nhỏ bên cạnh, vẫn đi lại được
  toggleClean: () => {
    if (!get().cleanOpen && document.pointerLockElement) document.exitPointerLock()
    set((s) => ({ cleanOpen: !s.cleanOpen, cleanPick: null, settingsOpen: false }))
  },
  pickClean: (id) => set({ cleanPick: id }),
  closeTop: () => {
    const s = get()
    if (s.askId) set({ askId: null })
    else if (s.cleanPick) set({ cleanPick: null })
    else if (s.wardrobeId) set({ wardrobeId: null })
    else if (s.inboxOpen) set({ inboxOpen: false })
    else if (s.settingsOpen) set({ settingsOpen: false })
    else if (s.cleanOpen) set({ cleanOpen: false })
    else if (s.focusId) set({ focusId: null })
    else if (s.boardOpen) set({ boardOpen: false })
    else if (s.fameOpen) set({ fameOpen: false })
    else return false
    return true
  },
  /** Phím E: mở màn hình agent / bảng ticket đang đứng gần, hoặc đóng nếu đang xem */
  interact: () => {
    const { focusId, boardOpen, nearId, nearBoard, closeFocus, openBoard, closeBoard, wardrobeId, askId } = get()
    if (wardrobeId || askId) return
    if (focusId) return closeFocus()
    if (boardOpen) return closeBoard()
    if (get().fameOpen) return get().closeFame()
    if (nearBoard) return openBoard()
    if (get().nearFame) return get().openFame()
    if (nearId) get().openAgent(nearId)
  },
}))
