import { duckMusic } from './engine'

/**
 * ⚠ TẠM KHÔNG DÙNG: chat hiện chỉ gõ chữ, mic và đọc to đang tắt. Giữ file để bật lại sau.
 *
 * Giọng nói trong chat, dùng sẵn của trình duyệt, không cần key:
 * - Nói → chữ: Web Speech API (Chrome/Edge), tiếng Việt. Ưu tiên nhận giọng NGAY TRÊN MÁY (Chrome 139+, gói tiếng Việt
 *   tải một lần, âm thanh không gửi đi). Không có thì mới dùng máy chủ Google (có máy Chrome 154 báo lỗi
 *   "network" ngay cả khi có mạng, nên chế độ trên máy là đường chính).
 * - Chữ → giọng: speechSynthesis với giọng tiếng Việt của máy (Windows: "Microsoft An").
 */

// ───────────────────── Nói → chữ ─────────────────────

interface RecAlt { transcript: string }
interface RecResult { readonly isFinal: boolean; readonly 0: RecAlt }
interface RecEvent { readonly resultIndex: number; readonly results: ArrayLike<RecResult> }
interface Recognizer {
  lang: string
  /** Chrome 139+: nhận giọng trên máy, không gửi âm thanh đi */
  processLocally?: boolean
  continuous: boolean
  interimResults: boolean
  onresult: ((e: RecEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable'
interface LocalOpts { langs: string[]; processLocally: boolean }
type RecognizerCtor = (new () => Recognizer) & {
  available?: (o: LocalOpts) => Promise<Availability>
  install?: (o: LocalOpts) => Promise<boolean>
}

const recognizer = (): RecognizerCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export const canDictate = () => !!recognizer()

const VI: LocalOpts = { langs: ['vi-VN'], processLocally: true }

/**
 * Gói nhận giọng tiếng Việt trên máy: 'available' dùng được ngay · 'downloadable' cần tải (một lần) ·
 * 'downloading' đang tải · 'unavailable' trình duyệt không có (khi đó dùng máy chủ Google).
 */
export async function localStatus(): Promise<Availability> {
  const R = recognizer()
  if (!R?.available) return 'unavailable'
  try {
    return await R.available(VI)
  } catch {
    return 'unavailable'
  }
}

/** Tải gói tiếng Việt về máy. Phải gọi từ cú bấm của người dùng. Trả về true nếu đã cài xong. */
export async function installLocal(): Promise<boolean> {
  const R = recognizer()
  if (!R?.install) return false
  try {
    return await R.install(VI)
  } catch {
    return false
  }
}

const REC_ERROR: Record<string, string> = {
  'not-allowed': 'Trình duyệt chưa cho dùng mic. Bấm biểu tượng ổ khoá cạnh địa chỉ trang để cho phép.',
  'service-not-allowed': 'Trình duyệt chưa cho dùng mic.',
  'audio-capture': 'Không tìm thấy mic trên máy.',
  'no-speech': 'Không nghe thấy gì, bạn thử nói lại nhé.',
  network: 'Máy chủ nhận giọng của Google không phản hồi. Hãy dùng gói nhận giọng tiếng Việt trên máy (bấm 🎤 lại).',
  'language-not-supported': 'Trình duyệt không nhận được tiếng Việt.',
}

/**
 * Bắt đầu nghe. `onText(final, interim)`: phần đã chốt (cộng dồn) và phần đang nghe dở.
 * Trình duyệt tự dừng khi bạn im lặng một lúc. Trả về hàm dừng nghe.
 */
export function dictate(h: {
  /** true = nhận giọng trên máy (gói tiếng Việt đã cài) */
  local: boolean
  onText: (final: string, interim: string) => void
  onEnd: () => void
  onError: (msg: string, code: string) => void
}): () => void {
  const R = recognizer()
  if (!R) {
    h.onError('Trình duyệt này không hỗ trợ nhận giọng nói. Hãy dùng Chrome hoặc Edge.', 'unsupported')
    h.onEnd()
    return () => {}
  }
  const r = new R()
  r.lang = 'vi-VN'
  r.continuous = true
  r.interimResults = true
  if (h.local) r.processLocally = true
  let final = ''
  r.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]
      const t = res[0].transcript.trim()
      if (!t) continue
      if (res.isFinal) final = final ? `${final} ${t}` : t
      else interim = interim ? `${interim} ${t}` : t
    }
    h.onText(final, interim)
  }
  r.onerror = (e) => { if (e.error !== 'aborted') h.onError(REC_ERROR[e.error] ?? `Lỗi nhận giọng nói (${e.error})`, e.error) }
  r.onend = h.onEnd
  try {
    r.start()
  } catch {
    h.onError('Không bật được mic.', 'start')
    h.onEnd()
  }
  return () => { try { r.stop() } catch { /* đã dừng */ } }
}

// ───────────────────── Chữ → giọng ─────────────────────

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window

/** Giọng tiếng Việt của máy, ưu tiên Microsoft An. Danh sách giọng có thể đến muộn sau khi tải trang. */
function viVoice(): SpeechSynthesisVoice | null {
  const all = speechSynthesis.getVoices().filter((v) => /^vi(-|_|$)/i.test(v.lang))
  return all.find((v) => /\bAn\b/.test(v.name)) ?? all[0] ?? null
}

/** Tên giọng tiếng Việt sẽ dùng, hoặc null nếu máy không có (khi đó trình duyệt đọc bằng giọng mặc định). */
export function voiceName(): string | null {
  return canSpeak() ? viVoice()?.name ?? null : null
}

let speaking = 0

/** Câu dài thì chia nhỏ (một số trình duyệt tự ngắt câu đọc quá ~15 giây). */
function chunks(text: string, max = 220): string[] {
  const out: string[] = []
  for (const sentence of text.split(/(?<=[.!?…:;])\s+|\n+/)) {
    let s = sentence.trim()
    while (s.length > max) {
      const cut = s.lastIndexOf(' ', max)
      const at = cut > 40 ? cut : max
      out.push(s.slice(0, at))
      s = s.slice(at).trim()
    }
    if (s) out.push(s)
  }
  return out
}

/** Đọc to (thay câu đang đọc dở). Nhạc lofi nhỏ lại trong lúc đọc. */
export function speak(text: string, onDone?: () => void) {
  if (!canSpeak()) return
  stopSpeaking()
  const parts = chunks(text)
  if (!parts.length) return
  const voice = viVoice()
  const id = ++speaking
  duckMusic(true)
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p)
    u.lang = 'vi-VN'
    if (voice) u.voice = voice
    u.rate = 1.05
    if (i === parts.length - 1) {
      u.onend = u.onerror = () => {
        if (id !== speaking) return
        duckMusic(false)
        onDone?.()
      }
    }
    speechSynthesis.speak(u)
  })
}

export function stopSpeaking() {
  if (!canSpeak()) return
  speaking++
  speechSynthesis.cancel()
  duckMusic(false)
}

export const isSpeaking = () => canSpeak() && speechSynthesis.speaking

/**
 * Rút markdown thành lời đọc: bỏ khối code, đường dẫn, ký hiệu định dạng. Quá dài thì chỉ đọc phần đầu.
 */
export function speakable(md: string, max = 700): string {
  let t = md
    .replace(/```[\s\S]*?```/g, ' (đoạn mã) ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\|?[-:| ]+\|[-:| ]*$/gm, ' ')
    .replace(/\|/g, ', ')
    .replace(/[*_~>#]+/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
  if (t.length > max) {
    const cut = t.slice(0, max)
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
    t = `${end > max * 0.5 ? cut.slice(0, end + 1) : cut}… Phần còn lại bạn xem trên màn hình nhé.`
  }
  return t
}
