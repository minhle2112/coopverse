import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { paperclipUrl } from './src/config'
import { coopData } from './server/coopData'
import { paperclipGuard, wsAllowed } from './server/guard'
import { assetDir, limezu } from './server/limezu'

/** Trang của chính Coopverse bản pixel (dev 5179, preview 5180; bản 3D dùng 5177/5178 nên chạy song song được). */
const isOwnOrigin = (o: unknown) => typeof o === 'string' && /^http:\/\/(127\.0\.0\.1|localhost):(5179|5180)$/.test(o)

/** Bộ lọc /api (server/guard.ts), gắn trực tiếp (không return) để chạy trước middleware proxy của Vite */
function guardPlugin(): Plugin {
  const guard = paperclipGuard(isOwnOrigin)
  return {
    name: 'coopverse-paperclip-guard',
    configureServer(server) { server.middlewares.use(guard) },
    configurePreviewServer(server) { server.middlewares.use(guard) },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'COOPVERSE_'])
  const target = paperclipUrl(env.VITE_PAPERCLIP_URL)

  const proxy: Record<string, ProxyOptions> = {
    '/api': {
      target,
      changeOrigin: true,
      ws: true,
      configure(p) {
        // WebSocket không đi qua middleware ở trên nên kiểm riêng ở đây
        p.on('proxyReqWs', (proxyReq, req, socket) => {
          if (!wsAllowed(req.url, req.headers.origin, isOwnOrigin)) {
            proxyReq.destroy()
            socket.destroy()
          }
        })
      },
    },
  }

  // Chỉ mở trên máy này (127.0.0.1)
  return {
    plugins: [react(), guardPlugin(), coopData({ target, isOwnOrigin }), limezu(assetDir(env))],
    server: { host: '127.0.0.1', port: 5179, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: 5180, strictPort: true, proxy },
    build: {
      // three.js tự nó đã ~740 kB và không chia nhỏ được; app chỉ chạy localhost nên chấp nhận
      chunkSizeWarningLimit: 800,
      rolldownOptions: {
        output: {
          // Tách thư viện ra file riêng: trình duyệt giữ cache khi chỉ code Coopverse đổi
          codeSplitting: {
            groups: [
              { name: 'three', test: /node_modules[\/]three[\/]/ },
              { name: 'r3f', test: /node_modules[\/](@react-three|three-stdlib|troika|maath|zustand|suspend-react|its-fine)/ },
              { name: 'react', test: /node_modules[\/](react|react-dom|scheduler)[\/]/ },
            ],
          },
        },
      },
    },
  }
})
