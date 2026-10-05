import { MAP_MARKERS as M } from './mapMarkers'

/*
 * Kích thước và đồ cố định của căn phòng: layout.ts, trạng thái văn phòng và server dùng chung.
 * Vị trí cửa sổ, bảng ticket, cửa, chỗ xuất hiện, sảnh chờ lấy từ các mốc trong bản đồ Tiled (maps/office.tmj,
 * qua file sinh mapMarkers.ts, không phụ thuộc gì nên server cũng dùng được).
 */

export interface Vec2 { x: number; z: number }

/** Hộp va chạm theo trục. h = chiều cao; cam = chặn camera (tường đặc). */
export interface AABB { minX: number; maxX: number; minZ: number; maxZ: number; h: number; cam?: boolean }

export interface DeskSlot {
  id: string
  /** side = bàn phụ của agent con, nối dài dãy bàn của agent cha */
  zone: 'open' | 'side'
  seat: Vec2
  /** Hướng agent nhìn khi ngồi (bàn nằm phía trước). forward = (sin yaw, cos yaw) */
  yaw: number
}

/** Việc agent làm khi dừng ở một chỗ (quyết định dáng, đồ cầm tay, câu nói) */
export type Activity =
  | 'coffee' | 'fridge' | 'water' | 'window' | 'tv' | 'foos' | 'books' | 'sofa' | 'beanbag' | 'stool' | 'meeting' | 'kanban' | 'fame'
  // Đồ mua ở cửa hàng: máy game, bi-a, mèo, bảng trắng, bếp, máy bán nước
  | 'game' | 'pool' | 'pet' | 'board' | 'cook' | 'snack'
  // Phòng trống: đứng tán gẫu, đứng nhìn chỗ bụi bẩn
  | 'chat' | 'dust'

/** 27 × 15 m */
export const OFFICE = { minX: -13.5, maxX: 13.5, minZ: -8, maxZ: 7, wallH: 3.2, wallT: 0.3 }

/** Pixel của bản đồ mỗi mét: mốc "room" (sàn) phủ đúng cả phòng */
const MAP_PPM = M.room.w / (OFFICE.maxX - OFFICE.minX)
if (M.room.h !== (OFFICE.maxZ - OFFICE.minZ) * MAP_PPM) throw new Error('maps/office.tmj: mốc "room" phải có tỉ lệ đúng như phòng 27 × 15 m')
/** Toạ độ pixel trong bản đồ → mét, làm tròn để khỏi lệch ô lưới (5.1999… thay vì 5.2) */
const round = (v: number) => Math.round(v * 1e4) / 1e4
const mx = (p: number) => round((p - M.room.x) / MAP_PPM + OFFICE.minX)
const mz = (p: number) => round((p - M.room.y) / MAP_PPM + OFFICE.minZ)

export const SPAWN: Vec2 = { x: mx(M.spawn.x), z: mz(M.spawn.y) }

/** Sảnh chờ bên phải cửa vào: ứng viên đứng chờ bạn duyệt hồ sơ, mặt nhìn vào văn phòng (hơi xoay vào giữa). */
const LOBBY_YAW = [Math.PI - 0.2, Math.PI + 0.25]
export const LOBBY: (Vec2 & { yaw: number })[] = M.lobby.map((p, i) => ({ x: mx(p.x), z: mz(p.y), yaw: LOBBY_YAW[i % 2] }))

/**
 * Bảng ticket treo ở tường bắc (mặt bảng nhìn về hướng nam, +z).
 * Bản pixel nhìn từ trên xuống nghiêng về phía bắc: chỉ thấy được mặt tường bắc.
 */
export const BOARD = { x: mx(M.kanban.x + M.kanban.w / 2), y: 1.55, z: OFFICE.minZ + OFFICE.wallT / 2 + 0.04, w: round(M.kanban.w / MAP_PPM), h: 1.6 }

/** Cửa sổ trên tường bắc (toạ độ x tâm, mét) */
export const WINDOWS = M.windows.map((w) => mx(w.x + w.w / 2))

/** Cửa ra vào ở tường nam (toạ độ x tâm, mét) */
export const DOOR_X = mx(M.door.x + M.door.w / 2)

/**
 * Vùng chặn cố định vẽ trong layer Collision của bản đồ (cột, quầy xây sẵn...): không đi qua, không đặt đồ / xây vách lên.
 * Không ghi chiều cao thì cao như tường, chặn cả camera bản 3D.
 */
export const BLOCKS: AABB[] = M.blocks.map((b) => {
  const h = b.height ?? OFFICE.wallH
  return { minX: mx(b.x), maxX: mx(b.x + b.w), minZ: mz(b.y), maxZ: mz(b.y + b.h), h, cam: h >= OFFICE.wallH }
})

/** Khoảng cách từ ghế tới tâm bàn */
export const SEAT_TO_DESK = 0.83
export const DESK_W = 1.4
export const DESK_D = 0.75

export const forward = (yaw: number): Vec2 => ({ x: Math.sin(yaw), z: Math.cos(yaw) })

export function box(cx: number, cz: number, w: number, d: number, h: number, cam = false): AABB {
  return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h, cam }
}

export const turned = (yaw = 0) => Math.abs(Math.sin(yaw)) > 0.5

export function deskCenter(s: DeskSlot): Vec2 {
  const f = forward(s.yaw)
  return { x: s.seat.x + f.x * SEAT_TO_DESK, z: s.seat.z + f.z * SEAT_TO_DESK }
}
