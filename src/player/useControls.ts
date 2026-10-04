import { useEffect, type RefObject } from 'react'
import { clamp } from '../lib/math'
import { cam, input } from '../runtime'
import { useSettings } from '../settings'
import { useCoop } from '../store'

const BLOCK_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

/**
 * Bàn phím + chuột. Bấm vào màn hình để khoá chuột (pointer lock); nếu trình duyệt không cho khoá
 * thì kéo chuột trái để xoay camera.
 */
export function useControls(stage: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = stage.current
    if (!el) return
    let dragging = false

    // Ô nhập chữ thật: mọi phím thuộc về ô đó. Ô tick, thanh kéo, ô chọn màu, nút bấm thì không.
    const TEXT_TYPES = new Set(['text', 'search', 'email', 'number', 'password', 'url', 'tel'])
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      ((t instanceof HTMLInputElement && TEXT_TYPES.has(t.type)) || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
    // Phím mà các nút / ô tick / thanh kéo đang được chọn tự dùng (Space bấm nút, mũi tên kéo thanh)
    const isControl = (t: EventTarget | null) => t instanceof HTMLElement && /^(INPUT|BUTTON|A|LABEL)$/.test(t.tagName)
    const CONTROL_KEYS = new Set(['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

    /** Đang xem CLI / bảng ticket / tủ đồ: nhân vật đứng yên. Bảng cài đặt nhỏ thì vẫn đi lại được. */
    const focused = () => {
      const s = useCoop.getState()
      return s.focusId !== null || s.boardOpen || s.wardrobeId !== null || s.askId !== null
    }

    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) {
        // Esc trong ô nhập chữ: thoát khỏi ô trước (giữ bản nháp), bấm Esc lần nữa mới đóng bảng
        if (e.code === 'Escape') (e.target as HTMLElement).blur()
        return
      }
      if (e.code === 'Escape') {
        if (useCoop.getState().closeTop() && document.activeElement instanceof HTMLElement) document.activeElement.blur()
        return
      }
      if (isControl(e.target) && CONTROL_KEYS.has(e.code)) return
      // Ctrl+C, Ctrl+M… là phím của trình duyệt, không phải phím tắt của Coopverse
      const shortcut = !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat
      if (shortcut && e.code === 'KeyE') useCoop.getState().interact()
      // M: bật/tắt nhạc lofi · C: mở tủ đồ (người đứng gần, hoặc chính mình)
      if (shortcut && e.code === 'KeyM') {
        const st = useSettings.getState()
        st.set({ music: !st.music })
      }
      // Q: danh sách việc chờ bạn duyệt / trả lời
      if (shortcut && e.code === 'KeyQ' && !focused()) {
        useCoop.getState().toggleInbox()
        return
      }
      if (shortcut && e.code === 'KeyC' && !focused()) {
        useCoop.getState().openWardrobe()
        return
      }
      if (focused() || e.ctrlKey || e.metaKey) return
      input.keys.add(e.code)
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault()
    }
    const up = (e: KeyboardEvent) => input.keys.delete(e.code)
    const clear = () => input.keys.clear()

    const mouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || focused()) return
      dragging = true
      if (!document.pointerLockElement) {
        try {
          const p = el.requestPointerLock() as unknown
          if (p instanceof Promise) p.catch(() => {})
        } catch {
          /* không hỗ trợ: dùng kéo chuột */
        }
      }
    }
    const mouseUp = () => { dragging = false }
    const move = (e: MouseEvent) => {
      const locked = document.pointerLockElement === el
      if (!locked && !dragging) return
      cam.yaw -= e.movementX * 0.0026
      cam.pitch = clamp(cam.pitch + e.movementY * 0.0022, 0.06, 1.25)
    }
    const wheel = (e: WheelEvent) => {
      if (focused()) return
      cam.dist = clamp(cam.dist + e.deltaY * 0.004, 2.2, 10)
    }
    const lockChange = () => useCoop.getState().setLocked(document.pointerLockElement === el)

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    el.addEventListener('mousedown', mouseDown)
    window.addEventListener('mouseup', mouseUp)
    window.addEventListener('mousemove', move)
    el.addEventListener('wheel', wheel, { passive: true })
    document.addEventListener('pointerlockchange', lockChange)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      el.removeEventListener('mousedown', mouseDown)
      window.removeEventListener('mouseup', mouseUp)
      window.removeEventListener('mousemove', move)
      el.removeEventListener('wheel', wheel)
      document.removeEventListener('pointerlockchange', lockChange)
    }
  }, [stage])
}
