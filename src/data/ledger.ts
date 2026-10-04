/**
 * Sổ EXP của một công ty: mọi việc làm được tính điểm mà Coopverse đã thấy trên Paperclip, cộng lời khen của bạn.
 * Dùng chung cho trang (src/data/exp.ts) và server nhỏ của Coopverse (server/coopData.ts, lưu sổ thành file).
 * Thời điểm lưu bằng mili giây.
 */
export interface Ledger {
  v: 1
  /** Lượt chạy thành công: runId → [agentId, lúc xong] */
  runs: Record<string, [string, number]>
  /** Ticket xong: issueId → [agentId người được giao, lúc xong, độ ưu tiên, mã ticket] */
  tickets: Record<string, [string, number, string, string]>
  /** Phiếu agent gửi được duyệt: approvalId → [agentId, lúc duyệt, loại phiếu] */
  approvals: Record<string, [string, number, string]>
  /** Lời khen bạn bấm trong Coopverse */
  kudos: Kudos[]
}

export interface Kudos { id: string; agentId: string; at: number; note: string }

export const emptyLedger = (): Ledger => ({ v: 1, runs: {}, tickets: {}, approvals: {}, kudos: [] })

/** Lời khen dài tối đa bao nhiêu ký tự */
export const KUDOS_NOTE_MAX = 200
