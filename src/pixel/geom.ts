import { OFFICE } from '../world/layout'

/**
 * Bản pixel: nhìn từ trên xuống, nghiêng về phía bắc như Stardew Valley. Toạ độ thế giới vẫn là mét (x đông, z nam)
 * như bản 3D, để giữ nguyên bố cục, lối đi, đời sống agent. Màn hình: x → phải, z → xuống.
 */

/** Pixel (gốc, trước khi phóng to) mỗi mét: 1 m = 2 ô 16 px */
export const PPM = 32
export const TILE = 16

/** Mặt tường bắc cao bao nhiêu pixel (thấy được vì camera nghiêng về phía bắc) */
export const WALL_FACE = 48
/** Bề dày nắp tường nhìn từ trên */
export const CAP = 8

const MX = 16
const MY = WALL_FACE + CAP + 8

/** Kích thước cả bản đồ (pixel gốc) */
export const MAP_W = (OFFICE.maxX - OFFICE.minX) * PPM + MX * 2
export const MAP_H = (OFFICE.maxZ - OFFICE.minZ) * PPM + MY + 24

export const px = (x: number) => (x - OFFICE.minX) * PPM + MX
export const py = (z: number) => (z - OFFICE.minZ) * PPM + MY
/** Ngược lại: pixel → mét */
export const wx = (sx: number) => (sx - MX) / PPM + OFFICE.minX
export const wz = (sy: number) => (sy - MY) / PPM + OFFICE.minZ

/** Hướng 4 phía của sprite nhân vật, theo yaw của thế giới (forward = (sin yaw, cos yaw)) */
export type Dir = 'right' | 'up' | 'left' | 'down'
export function dirOf(yaw: number): Dir {
  const sx = Math.sin(yaw), sz = Math.cos(yaw)
  if (Math.abs(sx) > Math.abs(sz) * 1.05) return sx > 0 ? 'right' : 'left'
  return sz > 0 ? 'down' : 'up'
}
