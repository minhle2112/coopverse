import { useFrame } from '@react-three/fiber'
import { lifeTick } from './director'

/** Chạy đạo diễn đời sống văn phòng mỗi khung hình (đặt trong Canvas). */
export function OfficeLife() {
  useFrame((_, dt) => lifeTick(Math.min(dt, 0.1)))
  return null
}
