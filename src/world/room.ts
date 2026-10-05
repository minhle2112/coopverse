/*
 * Kích thước và đồ cố định của căn phòng (không phụ thuộc gì): layout.ts, trạng thái văn phòng và server dùng chung.
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
  // Phòng trống: đứng tán gẫu, đứng nhìn chỗ bụi bẩn
  | 'chat' | 'dust'

/** 27 × 15 m */
export const OFFICE = { minX: -13.5, maxX: 13.5, minZ: -8, maxZ: 7, wallH: 3.2, wallT: 0.3 }
export const SPAWN: Vec2 = { x: 0, z: 5.2 }

/** Sảnh chờ bên phải cửa vào: ứng viên đứng chờ bạn duyệt hồ sơ, mặt nhìn vào văn phòng. */
export const LOBBY: (Vec2 & { yaw: number })[] = [
  { x: 3.0, z: 5.7, yaw: Math.PI - 0.2 },
  { x: 5.2, z: 5.7, yaw: Math.PI + 0.25 },
  { x: 3.1, z: 4.85, yaw: Math.PI - 0.2 },
  { x: 5.1, z: 4.85, yaw: Math.PI + 0.25 },
]

/**
 * Bảng ticket treo ở tường bắc (mặt bảng nhìn về hướng nam, +z).
 * Bản pixel nhìn từ trên xuống nghiêng về phía bắc: chỉ thấy được mặt tường bắc.
 */
export const BOARD = { x: -4.6, y: 1.55, z: OFFICE.minZ + OFFICE.wallT / 2 + 0.04, w: 3.0, h: 1.6 }

/** Cửa sổ trên tường bắc (toạ độ x tâm, mét) */
export const WINDOWS = [-10.5, -1.5, 1.5, 10.5]

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
