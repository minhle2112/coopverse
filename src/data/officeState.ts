import type { WallKind } from './catalog'
import { OFFICE, WINDOWS } from '../world/room'

/**
 * Trạng thái văn phòng của một công ty (riêng của Coopverse, không phải của Paperclip): chỗ nào đã dọn,
 * đã tiêu bao nhiêu Xu vào việc gì. Lưu thành file cạnh sổ EXP (server/coopData.ts); bản demo lưu trong trình duyệt.
 * Không phụ thuộc React: server dùng chung để kiểm giá và số dư.
 *
 * Văn phòng lúc đầu: một phòng lớn trống, phủ bụi. Sàn chia 5 × 3 mảng; tường bắc, từng cửa sổ và bảng ticket
 * dọn riêng. Mảng càng xa cửa vào càng đắt. Dọn xong thì mua đồ (src/data/catalog.ts), xây vách, dời bàn
 * (luật ở src/data/decor.ts).
 */

export interface Spend {
  id: string
  at: number
  /**
   * clean: dọn · buy: mua đồ · sell: bán lại (xu âm) · wall: xây vách · unwall: dỡ vách (xu âm)
   * · deskBuy / deskSell: đồ để bàn của một agent (ref = "agentId:món")
   * · gift: Xu thêm để thử, chỉ có ở bản demo (xu âm; server không bao giờ tạo khoản này)
   */
  kind: 'clean' | 'buy' | 'sell' | 'wall' | 'unwall' | 'deskBuy' | 'deskSell' | 'gift'
  /** Việc dọn (id trong JOBS), món đồ (id trong ITEMS), hoặc "agentId:món" (đồ để bàn) */
  ref: string
  xu: number
}

/** Một món đã mua: đang đặt trong phòng, hoặc cất trong kho */
export interface Placed {
  uid: string
  item: string
  /** Ô góc trên-trái (lưới 0,5 m). Đồ treo tường: c = cột trên tường bắc, r = 0 */
  c: number
  r: number
  /** Hướng (xem Turn trong catalog.ts) */
  rot: number
  at: number
  stored?: boolean
}

/** Chỗ ngồi đã dời: vị trí ghế (mét) và hướng nhìn */
export interface DeskPos { x: number; z: number; yaw: number }

export interface OfficeState {
  v: 1
  /** id việc dọn → lúc dọn xong */
  cleaned: Record<string, number>
  spent: Spend[]
  items: Placed[]
  /** "c,r" → loại vách */
  walls: Record<string, WallKind>
  /** id chỗ ngồi (DeskSlot.id) → chỗ mới */
  desks: Record<string, DeskPos>
  /** agentId → đồ để bàn đã mua (id trong DESK_ITEMS): đi theo agent khi đổi chỗ */
  deskItems: Record<string, string[]>
}

export const emptyOffice = (): OfficeState => ({ v: 1, cleaned: {}, spent: [], items: [], walls: {}, desks: {}, deskItems: {} })

/** Đọc từ file / bộ nhớ trình duyệt: thiếu trường (file của đợt trước) thì lấy mặc định */
export const normOffice = (raw: Partial<OfficeState> | null | undefined): OfficeState => ({ ...emptyOffice(), ...(raw ?? {}), v: 1 })

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

// ───────────────────────── Lưới đặt đồ ─────────────────────────

/** Ô 0,5 m = một ô 16 px của LimeZu */
export const CELL = 0.5
export const COLS = Math.round((OFFICE.maxX - OFFICE.minX) / CELL)
export const ROWS = Math.round((OFFICE.maxZ - OFFICE.minZ) / CELL)
export const cellKey = (c: number, r: number) => `${c},${r}`
/** Mép trái / trên của ô (mét) */
export const cellX = (c: number) => OFFICE.minX + c * CELL
export const cellZ = (r: number) => OFFICE.minZ + r * CELL
export const colOf = (x: number) => Math.floor((x - OFFICE.minX) / CELL)
export const rowOf = (z: number) => Math.floor((z - OFFICE.minZ) / CELL)

/** Đã dọn sạch hết chưa */
export const allClean = (o: OfficeState) => JOBS.every((j) => isClean(o, j.id))
