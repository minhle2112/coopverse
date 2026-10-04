import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Connect, Plugin } from 'vite'
import { emptyLedger, KUDOS_NOTE_MAX, type Kudos, type Ledger } from '../src/data/ledger'

/**
 * Dữ liệu riêng của Coopverse (không phải của Paperclip), lưu thành file JSON trong thư mục `.coopverse/`
 * của dự án (không commit): sổ EXP của từng công ty.
 *
 * Vì sao cần sổ: Paperclip chỉ trả tối đa 1000 lượt chạy / ticket gần nhất. Coopverse chép dần những gì đã
 * thấy vào sổ, để EXP không tụt khi dữ liệu cũ trôi khỏi danh sách. Lời khen (nút Khen) cũng nằm trong sổ,
 * nên mọi trình duyệt mở Coopverse trên máy này thấy cùng một con số.
 *
 * - GET  /coop/exp/:companyId    đọc thêm dữ liệu mới từ Paperclip vào sổ rồi trả cả sổ
 * - POST /coop/kudos/:companyId  {agentId, note}  ghi một lời khen (cần header x-coopverse + origin Coopverse)
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const DIR = path.resolve(process.cwd(), '.coopverse')
const fileOf = (cid: string) => path.join(DIR, `exp-${cid}.json`)

/** Đọc lại Paperclip không dày hơn mức này (nhiều tab cùng hỏi một lúc) */
const PULL_EVERY_MS = 2500
/** Lần đầu mỗi lần bật Coopverse đọc sâu (tối đa của Paperclip), sau đó chỉ cần phần mới nhất */
const DEEP = 1000
const SHALLOW = 200

interface Book { ledger: Ledger; pulledAt: number; deep: boolean }
const books = new Map<string, Book>()
const queues = new Map<string, Promise<unknown>>()

/** Mỗi công ty xử lý lần lượt từng yêu cầu, để hai lần ghi không đè nhau */
function serial<T>(cid: string, fn: () => Promise<T>): Promise<T> {
  const next = (queues.get(cid) ?? Promise.resolve()).catch(() => {}).then(fn)
  queues.set(cid, next)
  return next
}

async function load(cid: string): Promise<Book> {
  let b = books.get(cid)
  if (b) return b
  let ledger = emptyLedger()
  try {
    const raw = JSON.parse(await readFile(fileOf(cid), 'utf8')) as Partial<Ledger>
    ledger = { ...ledger, ...raw, v: 1 }
  } catch { /* chưa có sổ */ }
  b = { ledger, pulledAt: 0, deep: false }
  books.set(cid, b)
  return b
}

async function save(cid: string, ledger: Ledger) {
  await mkdir(DIR, { recursive: true })
  const tmp = `${fileOf(cid)}.tmp`
  await writeFile(tmp, JSON.stringify(ledger), 'utf8')
  await rename(tmp, fileOf(cid))
}

const ms = (iso: unknown) => (typeof iso === 'string' ? Date.parse(iso) || 0 : 0)

interface PcRun { id: string; agentId: string; status: string; finishedAt: string | null }
interface PcIssue { id: string; identifier: string; status: string; assigneeAgentId: string | null; completedAt: string | null; updatedAt: string; priority: string | null }
interface PcApproval { id: string; type: string; status: string; requestedByAgentId: string | null; decidedAt: string | null; updatedAt: string }

/** Chép việc mới (lượt chạy thành công, ticket xong, phiếu được duyệt) vào sổ. Trả về true nếu sổ đổi. */
async function pull(target: string, cid: string, b: Book): Promise<boolean> {
  const get = async <T>(p: string): Promise<T> => {
    const r = await fetch(`${target}/api${p}`, { headers: { accept: 'application/json' } })
    if (!r.ok) throw new Error(`Paperclip trả ${r.status} cho ${p}`)
    return r.json() as Promise<T>
  }
  const n = b.deep ? SHALLOW : DEEP
  const [runs, issues, approvals] = await Promise.all([
    get<PcRun[]>(`/companies/${cid}/heartbeat-runs?limit=${n}&summary=1`),
    get<PcIssue[]>(`/companies/${cid}/issues?status=done&limit=${n}&sortField=updated&sortDir=desc&view=compact`),
    get<PcApproval[]>(`/companies/${cid}/approvals?status=approved`),
  ])
  const L = b.ledger
  let changed = false
  for (const r of runs) {
    if (r.status !== 'succeeded' || L.runs[r.id]) continue
    L.runs[r.id] = [r.agentId, ms(r.finishedAt)]
    changed = true
  }
  for (const i of issues) {
    if (i.status !== 'done' || !i.assigneeAgentId || L.tickets[i.id]) continue
    L.tickets[i.id] = [i.assigneeAgentId, ms(i.completedAt) || ms(i.updatedAt), i.priority ?? 'medium', i.identifier]
    changed = true
  }
  for (const a of approvals) {
    if (a.status !== 'approved' || !a.requestedByAgentId || L.approvals[a.id]) continue
    L.approvals[a.id] = [a.requestedByAgentId, ms(a.decidedAt) || ms(a.updatedAt), a.type]
    changed = true
  }
  b.deep = true
  return changed
}

function send(res: Parameters<Connect.NextHandleFunction>[1], status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function readBody(req: Connect.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let s = ''
    req.on('data', (c: Buffer) => {
      s += c
      if (s.length > 8192) reject(new Error('quá dài'))
    })
    req.on('end', () => {
      try { resolve(s ? JSON.parse(s) : {}) } catch { reject(new Error('không phải JSON')) }
    })
    req.on('error', reject)
  })
}

export function coopData(opts: { target: string; isOwnOrigin: (o: unknown) => boolean }): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith('/coop/')) return next()
    const [, , kind, cid] = url.split('?')[0].split('/')
    const method = (req.method ?? 'GET').toUpperCase()
    if (!cid || !UUID.test(cid)) return send(res, 404, { error: 'coopverse: không có công ty này' })

    if (kind === 'exp' && method === 'GET') {
      serial(cid, async () => {
        const b = await load(cid)
        let stale = false
        if (Date.now() - b.pulledAt > PULL_EVERY_MS) {
          try {
            if (await pull(opts.target, cid, b)) await save(cid, b.ledger)
            b.pulledAt = Date.now()
          } catch {
            // Paperclip tắt: trả sổ đang có
            stale = true
          }
        }
        send(res, 200, { ledger: b.ledger, stale })
      }).catch((e: Error) => send(res, 500, { error: `coopverse: ${e.message}` }))
      return
    }

    if (kind === 'kudos' && method === 'POST') {
      if (req.headers['x-coopverse'] !== '1' || !opts.isOwnOrigin(req.headers.origin)) {
        return send(res, 403, { error: 'coopverse: lệnh phải gửi từ trang Coopverse' })
      }
      serial(cid, async () => {
        const body = (await readBody(req)) as { agentId?: unknown; note?: unknown }
        if (typeof body.agentId !== 'string' || !UUID.test(body.agentId)) return send(res, 400, { error: 'coopverse: thiếu agentId' })
        const note = typeof body.note === 'string' ? body.note.trim().slice(0, KUDOS_NOTE_MAX) : ''
        const b = await load(cid)
        const k: Kudos = { id: randomUUID(), agentId: body.agentId, at: Date.now(), note }
        b.ledger.kudos.push(k)
        await save(cid, b.ledger)
        send(res, 200, { ledger: b.ledger, kudos: k })
      }).catch((e: Error) => send(res, 400, { error: `coopverse: ${e.message}` }))
      return
    }

    send(res, 403, { error: 'coopverse: endpoint không nằm trong danh sách cho phép' })
  }
  return {
    name: 'coopverse-data',
    configureServer(server) { server.middlewares.use(handler) },
    configurePreviewServer(server) { server.middlewares.use(handler) },
  }
}
