import { useEffect } from 'react'
import { PerformanceMonitor } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useSettings } from '../settings'
import { useCoop } from '../store'

const MAX_DPR = () => Math.min(2, window.devicePixelRatio || 1)

/**
 * Chế độ đồ hoạ "Tự động": đo FPS, máy chạy chậm thì hạ độ nét xuống 1, khoẻ lại thì nâng lên.
 * "Cao" giữ độ nét tối đa, "Nhẹ" khoá ở 1 (bóng đổ tắt trong DayNight).
 */
export function AutoQuality() {
  const quality = useSettings((s) => s.quality)
  // Tủ đồ che gần hết văn phòng: hạ độ nét văn phòng phía sau để dành sức cho ô xem trước
  const covered = useCoop((s) => s.wardrobeId !== null)
  const setDpr = useThree((s) => s.setDpr)
  useEffect(() => {
    setDpr(quality === 'low' || covered ? 1 : MAX_DPR())
  }, [quality, covered, setDpr])
  if (quality !== 'auto' || covered) return null
  return (
    <PerformanceMonitor
      flipflops={4}
      onDecline={() => setDpr(1)}
      onIncline={() => setDpr(MAX_DPR())}
      onFallback={() => setDpr(1)}
    />
  )
}
