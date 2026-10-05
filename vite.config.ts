import { defineConfig, loadEnv, type Connect, type Plugin, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { paperclipUrl } from './src/config'
import { coopData } from './server/coopData'
import { assetDir, limezu } from './server/limezu'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/**
 * Chỉ những endpoint Coopverse cần mới được đi qua proxy tới Paperclip. Không gắn cứng công ty nào:
 * Coopverse hiện mọi công ty có trên Paperclip của máy này (chọn bằng ô dưới logo).
 */
function allowList() {
  return {
    GET: [
      /^\/api\/health$/,
      /^\/api\/companies$/,
      new RegExp(`^/api/companies/${UUID}/(agents|org|live-runs|heartbeat-runs|issues)$`),
      new RegExp(`^/api/heartbeat-runs/${UUID}(/log|/events)?$`),
      new RegExp(`^/api/agents/${UUID}/runtime-state$`),
      new RegExp(`^/api/issues/${UUID}/(comments|interactions)$`),
      // Agent Chat (tính năng thử nghiệm của Paperclip): đọc cuộc trò chuyện + xem tính năng có đang bật không
      new RegExp(`^/api/companies/${UUID}/chats/${UUID}$`),
      /^\/api\/instance\/settings\/experimental$/,
      // Việc chờ bạn quyết: hộp thư "cần chú ý" + nội dung phiếu duyệt
      new RegExp(`^/api/companies/${UUID}/attention$`),
      new RegExp(`^/api/approvals/${UUID}$`),
      new RegExp(`^/api/approvals/${UUID}/comments$`),
      new RegExp(`^/api/companies/${UUID}/approvals$`),
    ],
    POST: [
      new RegExp(`^/api/agents/${UUID}/(wakeup|pause|resume)$`),
      new RegExp(`^/api/issues/${UUID}/comments$`),
      // Mở cuộc trò chuyện với agent (lần gửi tin đầu tiên)
      new RegExp(`^/api/companies/${UUID}/chats/${UUID}$`),
      // Duyệt tại chỗ: quyết phiếu duyệt, trả lời / xác nhận câu hỏi của agent
      new RegExp(`^/api/approvals/${UUID}/(approve|reject|request-revision)$`),
      new RegExp(`^/api/issues/${UUID}/interactions/${UUID}/(accept|reject|respond)$`),
    ],
    WS: new RegExp(`^/api/companies/${UUID}/events/ws$`),
  }
}

/** Trang của chính Coopverse bản pixel (dev 5179, preview 5180; bản 3D dùng 5177/5178 nên chạy song song được). */
const isOwnOrigin = (o: unknown) => typeof o === 'string' && /^http:\/\/(127\.0\.0\.1|localhost):(5179|5180)$/.test(o)

function deny(res: Parameters<Connect.NextHandleFunction>[1], why: string) {
  res.statusCode = 403
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ error: `coopverse: ${why}` }))
}

/**
 * Chặn mọi lời gọi /api không nằm trong allow-list. Lệnh ghi (POST) còn phải đến từ chính trang
 * Coopverse và mang header x-coopverse, để trang web lạ không mượn proxy ra lệnh cho agent.
 */
function paperclipGuard(): Plugin {
  const rules = allowList()
  const guard: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith('/api')) return next()
    const path = url.split('?')[0]
    const method = (req.method ?? 'GET').toUpperCase()
    const list = method === 'GET' ? rules.GET : method === 'POST' ? rules.POST : null
    if (!list?.some((r) => r.test(path))) return deny(res, 'endpoint không nằm trong danh sách cho phép')
    if (method !== 'GET' && (req.headers['x-coopverse'] !== '1' || !isOwnOrigin(req.headers.origin))) {
      return deny(res, 'lệnh phải gửi từ trang Coopverse')
    }
    next()
  }
  return {
    name: 'coopverse-paperclip-guard',
    // Gắn trực tiếp (không return) để chạy trước middleware proxy của Vite
    configureServer(server) { server.middlewares.use(guard) },
    configurePreviewServer(server) { server.middlewares.use(guard) },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'COOPVERSE_'])
  const target = paperclipUrl(env.VITE_PAPERCLIP_URL)
  const wsPath = allowList().WS

  const proxy: Record<string, ProxyOptions> = {
    '/api': {
      target,
      changeOrigin: true,
      ws: true,
      configure(p) {
        // WebSocket không đi qua middleware ở trên nên kiểm riêng ở đây
        p.on('proxyReqWs', (proxyReq, req, socket) => {
          const path = (req.url ?? '').split('?')[0]
          if (!wsPath.test(path) || !isOwnOrigin(req.headers.origin)) {
            proxyReq.destroy()
            socket.destroy()
          }
        })
      },
    },
  }

  // Chỉ mở trên máy này (127.0.0.1)
  return {
    plugins: [react(), paperclipGuard(), coopData({ target, isOwnOrigin }), limezu(assetDir(env))],
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
