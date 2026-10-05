/**
 * Cửa hàng đồ trang trí: mọi món bán được, giá, chỗ chiếm trên lưới. Không phụ thuộc React hay PixiJS:
 * server dùng chung để kiểm giá. Hình của từng món (LimeZu) nằm ở src/pixel/catalogArt.ts.
 *
 * Lưới đặt đồ: ô 0,5 m (= một ô 16 px của LimeZu). Đồ treo tường chỉ treo trên tường bắc, theo cột ô.
 *
 * Giá theo tốc độ kiếm Xu thật: một công ty bình thường được khoảng 150 Xu mỗi ngày có việc.
 * Đồ nhỏ mua được ngay ngày đầu; món đắt nhất (mèo văn phòng) cần dành dụm khoảng một tuần.
 */

export type Group = 'plant' | 'wall' | 'lounge' | 'fun' | 'build'

/** floor: đứng trên sàn, chặn đường · rug: trải sàn, đi qua được, đồ khác đặt lên được · wall: treo tường bắc · door: lắp vào vách */
export type Mount = 'floor' | 'rug' | 'wall' | 'door'

/**
 * Xoay: four = 4 hướng (LimeZu có đủ hình) · two = quay mặt / quay lưng · flip = lật gương trái/phải · none = không xoay.
 * Hướng (rot): 0 nhìn xuống (về camera), 1 nhìn trái, 2 nhìn lên, 3 nhìn phải. Món `flip`: 0 thường, 1 lật.
 */
export type Turn = 'four' | 'two' | 'flip' | 'none'

export interface Item {
  id: string
  name: string
  group: Group
  price: number
  /** Số ô chiếm ở hướng 0: ngang (w) × dọc (d). Đồ treo tường: chỉ w (số cột trên tường) */
  w: number
  d: number
  mount: Mount
  turn: Turn
  /** Chiều cao (m), để biết món chặn đường; 0 = đi qua được */
  h: number
  /** Toả sáng ban đêm */
  light?: 'lamp' | 'screen'
}

export const GROUPS: { id: Group; name: string; icon: string }[] = [
  { id: 'plant', name: 'Cây & đồ nhỏ', icon: '🪴' },
  { id: 'wall', name: 'Treo tường', icon: '🖼️' },
  { id: 'lounge', name: 'Nghỉ ngơi & bếp', icon: '🛋️' },
  { id: 'fun', name: 'Giải trí', icon: '🎮' },
  { id: 'build', name: 'Xây vách', icon: '🧱' },
]

const it = (id: string, name: string, group: Group, price: number, w: number, d: number, mount: Mount, turn: Turn, h: number, light?: Item['light']): Item =>
  ({ id, name, group, price, w, d, mount, turn, h, light })

export const ITEMS: Item[] = [
  // ── Cây & đồ nhỏ ──
  it('plantSmall', 'Chậu cây nhỏ', 'plant', 30, 1, 1, 'floor', 'flip', 0.8),
  it('plantBig', 'Chậu cây lá to', 'plant', 60, 1, 1, 'floor', 'flip', 1.4),
  it('plantTree', 'Cây cảnh cao', 'plant', 90, 1, 1, 'floor', 'flip', 1.8),
  it('plantPalm', 'Cây cọ', 'plant', 100, 1, 1, 'floor', 'flip', 1.8),
  it('lampFloor', 'Đèn đứng chụp vải', 'plant', 60, 1, 1, 'floor', 'flip', 1.6, 'lamp'),
  it('floorLamp', 'Đèn cây hiện đại', 'plant', 75, 1, 1, 'floor', 'flip', 1.6, 'lamp'),
  it('cabinet', 'Tủ thấp', 'plant', 80, 2, 1, 'floor', 'none', 1.0),
  it('bookshelf', 'Kệ sách', 'plant', 120, 2, 1, 'floor', 'none', 2.0),
  it('bookshelfWide', 'Kệ sách lớn', 'plant', 180, 3, 1, 'floor', 'none', 2.0),
  it('waterCooler', 'Bình nước', 'plant', 100, 1, 1, 'floor', 'none', 1.2),
  it('vending', 'Máy bán nước', 'plant', 220, 2, 1, 'floor', 'none', 1.9, 'screen'),
  it('whiteboard', 'Bảng trắng', 'plant', 110, 2, 1, 'floor', 'none', 1.6),
  it('chalkboard', 'Bảng đen', 'plant', 90, 2, 1, 'floor', 'none', 1.6),
  it('rugGrey', 'Thảm xám', 'plant', 70, 3, 2, 'rug', 'none', 0),
  it('rugGreen', 'Thảm xanh lá', 'plant', 80, 3, 2, 'rug', 'none', 0),
  it('rugBorder', 'Thảm viền', 'plant', 90, 3, 2, 'rug', 'none', 0),
  it('rugRed', 'Thảm đỏ lớn', 'plant', 120, 5, 3, 'rug', 'none', 0),
  it('rugBlue', 'Thảm xanh lớn', 'plant', 120, 5, 3, 'rug', 'none', 0),

  // ── Treo tường (tường bắc) ──
  it('corkboard', 'Bảng ghim', 'wall', 40, 2, 0, 'wall', 'none', 0),
  it('painting1', 'Tranh phong cảnh', 'wall', 50, 2, 0, 'wall', 'none', 0),
  it('painting2', 'Tranh trừu tượng', 'wall', 60, 2, 0, 'wall', 'none', 0),
  it('painting3', 'Tranh hoa', 'wall', 60, 2, 0, 'wall', 'none', 0),
  it('moChart', 'Biểu đồ tăng trưởng', 'wall', 55, 2, 0, 'wall', 'none', 0),
  it('moChart2', 'Biểu đồ cột', 'wall', 55, 2, 0, 'wall', 'none', 0),
  it('clock', 'Đồng hồ cúc cu', 'wall', 130, 1, 0, 'wall', 'none', 0),
  it('tvWall', 'TV treo tường', 'wall', 250, 2, 0, 'wall', 'none', 0, 'screen'),
  it('fame', 'Bảng vinh danh', 'wall', 300, 6, 0, 'wall', 'none', 0),

  // ── Nghỉ ngơi & bếp (agent rảnh và bạn dùng được: ngồi, pha cà phê, mở tủ lạnh...) ──
  it('sofa', 'Sofa xám', 'lounge', 240, 3, 2, 'floor', 'four', 0.8),
  it('armRed', 'Ghế bành đỏ', 'lounge', 100, 1, 1, 'floor', 'four', 0.8),
  it('armBlue', 'Ghế bành xanh', 'lounge', 100, 1, 1, 'floor', 'four', 0.8),
  it('coffeeTable', 'Bàn trà', 'lounge', 70, 3, 1, 'floor', 'none', 0.4),
  it('tableHoney', 'Bàn ăn gỗ', 'lounge', 120, 3, 2, 'floor', 'none', 0.75),
  it('meetingTable', 'Bàn họp', 'lounge', 300, 4, 2, 'floor', 'none', 0.75),
  it('meetingChair', 'Ghế họp', 'lounge', 35, 1, 1, 'floor', 'two', 0),
  it('highTable', 'Bàn cao', 'lounge', 80, 2, 1, 'floor', 'none', 1.05),
  it('stool', 'Ghế đẩu', 'lounge', 25, 1, 1, 'floor', 'none', 0),
  it('bench', 'Ghế băng', 'lounge', 50, 2, 1, 'floor', 'flip', 0.5),
  it('kitCounter', 'Tủ bếp', 'lounge', 70, 2, 1, 'floor', 'none', 0.95),
  it('kitSink', 'Bồn rửa', 'lounge', 100, 1, 1, 'floor', 'none', 0.95),
  it('kitStove', 'Bếp nấu', 'lounge', 120, 1, 1, 'floor', 'none', 0.95),
  it('kitFridge', 'Tủ lạnh nhỏ', 'lounge', 150, 1, 1, 'floor', 'none', 1.9),
  it('fridge', 'Tủ lạnh lớn', 'lounge', 220, 2, 1, 'floor', 'none', 1.9),
  it('coffeeBar', 'Quầy cà phê', 'lounge', 260, 2, 1, 'floor', 'none', 1.2),

  // ── Giải trí ──
  it('arcade1', 'Máy game thùng', 'fun', 380, 1, 1, 'floor', 'none', 1.6, 'screen'),
  it('arcade2', 'Máy game đỏ', 'fun', 380, 1, 1, 'floor', 'none', 1.6, 'screen'),
  it('tvStand', 'Kệ TV', 'fun', 330, 4, 1, 'floor', 'none', 1.0, 'screen'),
  it('pingpong', 'Bàn bóng bàn', 'fun', 550, 2, 3, 'floor', 'none', 0.9),
  it('pool', 'Bàn bi-a', 'fun', 750, 3, 2, 'floor', 'none', 0.9),
  it('cat', 'Mèo văn phòng', 'fun', 1000, 2, 1, 'floor', 'flip', 0.3),

  // ── Xây vách ──
  it('door', 'Cửa kính', 'build', 100, 2, 1, 'door', 'none', 0),
]

export const itemById = new Map(ITEMS.map((i) => [i.id, i]))

/** Vách tự xây: thấp ngang hông, kính, hoặc cao đầy đủ (che người phía sau, tự mờ đi) */
export type WallKind = 'low' | 'glass' | 'tall'
export const WALLS: { kind: WallKind; name: string; price: number; hint: string }[] = [
  { kind: 'low', name: 'Vách thấp', price: 4, hint: 'Ngang hông, luôn thấy người' },
  { kind: 'glass', name: 'Vách kính', price: 7, hint: 'Kính trong, luôn thấy người' },
  { kind: 'tall', name: 'Tường cao', price: 10, hint: 'Như tường thật, mờ đi khi có người phía sau' },
]
export const wallPrice = (k: WallKind) => WALLS.find((w) => w.kind === k)!.price

/**
 * Đồ để bàn: của riêng từng agent (đi theo agent khi đổi chỗ), mở khoá khi agent đạt cấp `level`, rồi mới mua bằng Xu.
 * Mỗi món một chỗ cố định trên bàn. Thứ tự = thứ tự hiện trong bảng chọn.
 */
export interface DeskItem { id: string; name: string; icon: string; price: number; level: number }
export const DESK_ITEMS: DeskItem[] = [
  { id: 'plant', name: 'Cây để bàn', icon: '🌱', price: 25, level: 2 },
  { id: 'frame', name: 'Khung ảnh', icon: '🖼️', price: 20, level: 2 },
  { id: 'monitor', name: 'Màn hình thứ hai', icon: '🖥️', price: 120, level: 3 },
  { id: 'lamp', name: 'Đèn bàn', icon: '💡', price: 60, level: 3 },
  { id: 'chair', name: 'Ghế da', icon: '🪑', price: 140, level: 4 },
  { id: 'trophy', name: 'Cúp vàng', icon: '🏆', price: 200, level: 5 },
]
export const deskItemById = new Map(DESK_ITEMS.map((d) => [d.id, d]))

/** Tên món giữa câu ("Đã mua sofa xám"), giữ nguyên chữ viết tắt ("TV treo tường") */
export const lowerName = (name: string) => (name.length > 1 && name[1] === name[1].toUpperCase() && /\p{L}/u.test(name[1]) ? name : name[0].toLowerCase() + name.slice(1))

/** Bán lại được nửa giá */
export const resale = (price: number) => Math.floor(price / 2)

/** Các hướng xoay của một món, theo thứ tự bấm R */
export function rotations(i: Item): number[] {
  if (i.turn === 'four') return [0, 1, 2, 3]
  if (i.turn === 'two') return [0, 2]
  if (i.turn === 'flip') return [0, 1]
  return [0]
}

export const nextRot = (i: Item, rot: number) => {
  const r = rotations(i)
  return r[(r.indexOf(rot) + 1) % r.length] ?? 0
}

/** Chỗ chiếm trên lưới ở hướng `rot` (món 4 hướng quay ngang thì đổi rộng / dọc) */
export function footprint(i: Item, rot: number): { w: number; d: number } {
  return i.turn === 'four' && rot % 2 === 1 ? { w: i.d, d: i.w } : { w: i.w, d: i.d }
}
