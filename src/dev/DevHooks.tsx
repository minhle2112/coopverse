import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { injectLiveEvent } from '../data/sync'
import type { PcLiveEvent } from '../data/paperclip'
import { actors } from '../life/actors'
import { clock, useLife } from '../life/store'
import { agentPos, cam, dev, input, player } from '../runtime'
import { useSettings } from '../settings'
import { useCoop } from '../store'

/**
 * Chỉ chạy ở chế độ dev. Cho phép tự chạy từng khung hình khi tab bị ẩn (rAF dừng),
 * dùng để kiểm tra tự động: window.__coop.step(2) chạy 2 giây mô phỏng.
 * window.__coop.inject(event, { noRefresh: true }) bơm sự kiện realtime giả của Paperclip.
 * window.__coop.store là store zustand (vd. __coop.store.getState().openFocus(id) để mở CLI).
 * window.__coop.life: trạng thái sống của agent (actors), đồng hồ, bong bóng thoại.
 */
export function DevHooks() {
  const advance = useThree((s) => s.advance)
  const get = useThree((s) => s.get)
  useEffect(() => {
    const api = {
      runtime: { agentPos, cam, dev, input, player },
      store: useCoop,
      life: { actors, clock, store: useLife },
      /** Trạng thái R3F (scene, gl, camera) để soi khi debug */
      three: get,
      /** Cài đặt (âm thanh, đồ hoạ, giờ xem thử): __coop.settings.getState().set({ hour: 21 }) */
      settings: useSettings,
      step(seconds: number, fps = 30) {
        const st = get()
        st.setFrameloop('never')
        let t = st.clock.elapsedTime
        const n = Math.round(seconds * fps)
        for (let i = 0; i < n; i++) {
          t += 1 / fps
          advance(t, true)
        }
        return { player: { ...player }, agents: Object.fromEntries(agentPos) }
      },
      resume() { get().setFrameloop('always') },
      /** Số liệu hiệu năng: draw call, tam giác, số mesh; đo thời gian render trung bình qua n khung hình. */
      stats(n = 60) {
        const st = get()
        st.setFrameloop('never')
        let t = st.clock.elapsedTime
        const t0 = performance.now()
        for (let i = 0; i < n; i++) { t += 1 / 30; advance(t, true) }
        const ms = (performance.now() - t0) / n
        let meshes = 0, shadowCasters = 0
        st.scene.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh && o.visible) { meshes++; if (o.castShadow) shadowCasters++ } })
        const r = st.gl.info.render
        return { calls: r.calls, triangles: r.triangles, meshes, shadowCasters, geometries: st.gl.info.memory.geometries, textures: st.gl.info.memory.textures, programs: st.gl.info.programs?.length, msPerFrame: +ms.toFixed(2), dpr: st.gl.getPixelRatio() }
      },
      inject(e: PcLiveEvent, opts?: { noRefresh?: boolean }) { injectLiveEvent?.(e, opts) },
    }
    ;(window as unknown as { __coop: typeof api }).__coop = api
  }, [advance, get])
  return null
}
