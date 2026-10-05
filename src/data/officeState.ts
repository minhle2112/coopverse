import { OFFICE, WINDOWS } from '../world/layout'

/**
 * Trạng thái văn phòng của một công ty (riêng của Coopverse, không phải của Paperclip): chỗ nào đã dọn,
 * đã tiêu bao nhiêu Xu vào việc gì. Lưu thành file cạnh sổ EXP (server/coopData.ts); bản demo lưu trong trình duyệt.
 * Không phụ thuộc React: server dùng chung để kiểm giá và số dư.
 *
 * Văn phòng lúc đầu: một phòng lớn trống, phủ bụi. Sàn chia 5 × 3 mảng; tường bắc, từng cửa sổ và bảng ticket
 * dọn riêng. Mảng càng xa cửa vào càng đắt.
 */

export interface Spend {
  id: string
  at: number
  kind: 'clean'
  /** Việc đã trả tiền (id trong JOBS) */
  ref: string
  xu: number
}

export interface OfficeState {
  v: 1
  /** id việc dọn → lúc dọn xong */
  cleaned: Record<string, number>
  spent: Spend[]
}

export const emptyOffice = (): OfficeState => ({ v: 1, cleaned: {}, spent: [] })

export const spentXu = (o: OfficeState) => o.spent.reduce((s, x) => s + x.xu, 0)

export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

export interface CleanJob {
  id: string
  kind: 'floor' | 'wall' | 'window' | 'board'
  label: string
  price: number
  /** Mảng sàn (mét) */
  rect?: Rect
  /** Cửa sổ: toạ độ x tâm (mét) */
  x?: number
}

export const PATCH_COLS = 5
export const PATCH_ROWS = 3
const COL = ['góc trái', 'bên trái', 'chính giữa', 'bên phải', 'góc phải']
const ROW = ['sát tường', 'giữa phòng', 'gần cửa']

const pw = (OFFICE.maxX - OFFICE.minX) / PATCH_COLS
const ph = (OFFICE.maxZ - OFFICE.minZ) / PATCH_ROWS
/** Cửa vào ở giữa tường nam: mảng chứa cửa */
const DOOR_COL = Math.floor((0 - OFFICE.minX) / pw)
const DOOR_ROW = PATCH_ROWS - 1

export const patchId = (c: number, r: number) => `floor-${c}-${r}`

function floorJobs(): CleanJob[] {
  const out: CleanJob[] = []
  for (let r = 0; r < PATCH_ROWS; r++) {
    for (let c = 0; c < PATCH_COLS; c++) {
      // Số bước (theo mảng) từ cửa vào: mảng ở cửa 30 Xu, mỗi bước thêm 25
      const d = Math.abs(c - DOOR_COL) + (DOOR_ROW - r)
      out.push({
        id: patchId(c, r),
        kind: 'floor',
        label: `Sàn ${ROW[r]}, ${COL[c]}`,
        price: 30 + 25 * d,
        rect: { minX: OFFICE.minX + c * pw, maxX: OFFICE.minX + (c + 1) * pw, minZ: OFFICE.minZ + r * ph, maxZ: OFFICE.minZ + (r + 1) * ph },
      })
    }
  }
  return out
}

export const JOBS: CleanJob[] = [
  { id: 'board', kind: 'board', label: 'Bảng ticket', price: 20 },
  ...floorJobs(),
  ...WINDOWS.map((x, i): CleanJob => ({ id: `window-${i}`, kind: 'window', label: `Cửa sổ ${i + 1}`, price: 40, x })),
  { id: 'wall', kind: 'wall', label: 'Tường bắc (vết ố, mạng nhện)', price: 150 },
]

export const jobById = new Map(JOBS.map((j) => [j.id, j]))

/** Mảng sàn chứa điểm (x, z) */
export function patchAt(x: number, z: number): CleanJob | undefined {
  const c = Math.floor((x - OFFICE.minX) / pw), r = Math.floor((z - OFFICE.minZ) / ph)
  if (c < 0 || c >= PATCH_COLS || r < 0 || r >= PATCH_ROWS) return undefined
  return jobById.get(patchId(c, r))
}

export const isClean = (o: OfficeState, id: string) => o.cleaned[id] !== undefined

/** Đã dọn sạch hết chưa */
export const allClean = (o: OfficeState) => JOBS.every((j) => isClean(o, j.id))
