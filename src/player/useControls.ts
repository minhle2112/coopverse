import { useEffect, type RefObject } from 'react'
import { input } from '../runtime'
import { useSettings } from '../settings'
import { useCoop } from '../store'

const BLOCK_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

/**
 * Bàn phím + chuột. Bản pixel: camera nhìn từ trên cố định, không xoay; mức thu phóng chọn trong Cài đặt (không lăn chuột).
 */
export function useControls(stage: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = stage.current
    if (!el) return

    // Ô nhập chữ thật: mọi phím thuộc về ô đó. Ô tick, thanh kéo, ô chọn màu, nút bấm thì không.
    const TEXT_TYPES = new Set(['text', 'search', 'email', 'number', 'password', 'url', 'tel'])
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      ((t instanceof HTMLInputElement && TEXT_TYPES.has(t.type)) || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
    // Phím mà các nút / ô tick / thanh kéo đang được chọn tự dùng (Space bấm nút, mũi tên kéo thanh)
    const isControl = (t: EventTarget | null) => t instanceof HTMLElement && /^(INPUT|BUTTON|A|LABEL)$/.test(t.tagName)
    const CONTROL_KEYS = new Set(['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

    /** Đang xem CLI / bảng ticket / bảng vàng / tủ đồ: nhân vật đứng yên. Bảng cài đặt nhỏ thì vẫn đi lại được. */
    const focused = () => {
      const s = useCoop.getState()
      return s.focusId !== null || s.boardOpen || s.fameOpen || s.wardrobeId !== null || s.askId !== null
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

    // Bấm vào văn phòng: bỏ chọn ô nhập / nút đang giữ phím, để WASD về lại nhân vật
    const mouseDown = () => {
      if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur()
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    el.addEventListener('mousedown', mouseDown)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      el.removeEventListener('mousedown', mouseDown)
    }
  }, [stage])
}
