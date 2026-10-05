/**
 * Cửa hàng đồ trang trí: mọi món bán được, giá, chỗ chiếm trên lưới. Không phụ thuộc React hay PixiJS:
 * server dùng chung để kiểm giá. Hình của từng món (LimeZu) nằm ở src/pixel/catalogArt.ts.
 *
 * Lưới đặt đồ: ô 0,5 m (= một ô 16 px của LimeZu). Đồ treo tường chỉ treo trên tường bắc, theo cột ô.
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
  it('plantSmall', 'Chậu cây nhỏ', 'plant', 40, 1, 1, 'floor', 'flip', 0.8),
  it('plantBig', 'Chậu cây lá to', 'plant', 80, 1, 1, 'floor', 'flip', 1.4),
  it('plantTree', 'Cây cảnh cao', 'plant', 110, 1, 1, 'floor', 'flip', 1.8),
  it('plantPalm', 'Cây cọ', 'plant', 120, 1, 1, 'floor', 'flip', 1.8),
  it('lampFloor', 'Đèn đứng chụp vải', 'plant', 70, 1, 1, 'floor', 'flip', 1.6, 'lamp'),
  it('floorLamp', 'Đèn cây hiện đại', 'plant', 90, 1, 1, 'floor', 'flip', 1.6, 'lamp'),
  it('cabinet', 'Tủ thấp', 'plant', 100, 2, 1, 'floor', 'none', 1.0),
  it('bookshelf', 'Kệ sách', 'plant', 150, 2, 1, 'floor', 'none', 2.0),
  it('bookshelfWide', 'Kệ sách lớn', 'plant', 220, 3, 1, 'floor', 'none', 2.0),
  it('waterCooler', 'Bình nước', 'plant', 120, 1, 1, 'floor', 'none', 1.2),
  it('vending', 'Máy bán nước', 'plant', 280, 2, 1, 'floor', 'none', 1.9, 'screen'),
  it('whiteboard', 'Bảng trắng', 'plant', 130, 2, 1, 'floor', 'none', 1.6),
  it('chalkboard', 'Bảng đen', 'plant', 110, 2, 1, 'floor', 'none', 1.6),
  it('rugGrey', 'Thảm xám', 'plant', 90, 3, 2, 'rug', 'none', 0),
  it('rugGreen', 'Thảm xanh lá', 'plant', 100, 3, 2, 'rug', 'none', 0),
  it('rugBorder', 'Thảm viền', 'plant', 110, 3, 2, 'rug', 'none', 0),
  it('rugRed', 'Thảm đỏ lớn', 'plant', 140, 5, 3, 'rug', 'none', 0),
  it('rugBlue', 'Thảm xanh lớn', 'plant', 140, 5, 3, 'rug', 'none', 0),

  // ── Treo tường (tường bắc) ──
  it('corkboard', 'Bảng ghim', 'wall', 50, 2, 0, 'wall', 'none', 0),
  it('painting1', 'Tranh phong cảnh', 'wall', 60, 2, 0, 'wall', 'none', 0),
  it('painting2', 'Tranh trừu tượng', 'wall', 80, 2, 0, 'wall', 'none', 0),
  it('painting3', 'Tranh hoa', 'wall', 80, 2, 0, 'wall', 'none', 0),
  it('moChart', 'Biểu đồ tăng trưởng', 'wall', 70, 2, 0, 'wall', 'none', 0),
  it('moChart2', 'Biểu đồ cột', 'wall', 70, 2, 0, 'wall', 'none', 0),
  it('clock', 'Đồng hồ cúc cu', 'wall', 160, 1, 0, 'wall', 'none', 0),
  it('tvWall', 'TV treo tường', 'wall', 300, 2, 0, 'wall', 'none', 0, 'screen'),
  it('fame', 'Bảng vinh danh', 'wall', 400, 6, 0, 'wall', 'none', 0),

  // ── Nghỉ ngơi & bếp (đợt 3: agent dùng được) ──
  it('sofa', 'Sofa xám', 'lounge', 280, 3, 2, 'floor', 'four', 0.8),
  it('armRed', 'Ghế bành đỏ', 'lounge', 120, 1, 1, 'floor', 'four', 0.8),
  it('armBlue', 'Ghế bành xanh', 'lounge', 120, 1, 1, 'floor', 'four', 0.8),
  it('coffeeTable', 'Bàn trà', 'lounge', 90, 3, 1, 'floor', 'none', 0.4),
  it('tableHoney', 'Bàn ăn gỗ', 'lounge', 150, 3, 2, 'floor', 'none', 0.75),
  it('meetingTable', 'Bàn họp', 'lounge', 380, 4, 2, 'floor', 'none', 0.75),
  it('meetingChair', 'Ghế họp', 'lounge', 40, 1, 1, 'floor', 'two', 0),
  it('highTable', 'Bàn cao', 'lounge', 100, 2, 1, 'floor', 'none', 1.05),
  it('stool', 'Ghế đẩu', 'lounge', 30, 1, 1, 'floor', 'none', 0),
  it('bench', 'Ghế băng', 'lounge', 60, 2, 1, 'floor', 'flip', 0.5),
  it('kitCounter', 'Tủ bếp', 'lounge', 80, 2, 1, 'floor', 'none', 0.95),
  it('kitSink', 'Bồn rửa', 'lounge', 120, 1, 1, 'floor', 'none', 0.95),
  it('kitStove', 'Bếp nấu', 'lounge', 150, 1, 1, 'floor', 'none', 0.95),
  it('kitFridge', 'Tủ lạnh nhỏ', 'lounge', 180, 1, 1, 'floor', 'none', 1.9),
  it('fridge', 'Tủ lạnh lớn', 'lounge', 260, 2, 1, 'floor', 'none', 1.9),
  it('coffeeBar', 'Quầy cà phê', 'lounge', 320, 2, 1, 'floor', 'none', 1.2),

  // ── Giải trí ──
  it('arcade1', 'Máy game thùng', 'fun', 450, 1, 1, 'floor', 'none', 1.6, 'screen'),
  it('arcade2', 'Máy game đỏ', 'fun', 450, 1, 1, 'floor', 'none', 1.6, 'screen'),
  it('tvStand', 'Kệ TV', 'fun', 400, 4, 1, 'floor', 'none', 1.0, 'screen'),
  it('pingpong', 'Bàn bóng bàn', 'fun', 650, 2, 3, 'floor', 'none', 0.9),
  it('pool', 'Bàn bi-a', 'fun', 900, 3, 2, 'floor', 'none', 0.9),
  it('cat', 'Mèo văn phòng', 'fun', 1200, 2, 1, 'floor', 'flip', 0.3),

  // ── Xây vách ──
  it('door', 'Cửa kính', 'build', 120, 2, 1, 'door', 'none', 0),
]

export const itemById = new Map(ITEMS.map((i) => [i.id, i]))

/** Vách tự xây: thấp ngang hông, kính, hoặc cao đầy đủ (che người phía sau, tự mờ đi) */
export type WallKind = 'low' | 'glass' | 'tall'
export const WALLS: { kind: WallKind; name: string; price: number; hint: string }[] = [
  { kind: 'low', name: 'Vách thấp', price: 5, hint: 'Ngang hông, luôn thấy người' },
  { kind: 'glass', name: 'Vách kính', price: 9, hint: 'Kính trong, luôn thấy người' },
  { kind: 'tall', name: 'Tường cao', price: 12, hint: 'Như tường thật, mờ đi khi có người phía sau' },
]
export const wallPrice = (k: WallKind) => WALLS.find((w) => w.kind === k)!.price

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
