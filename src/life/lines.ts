import { expForLevel, levelOf, titleOf, useExp } from '../data/exp'
import type { Agent, Issue } from '../data/types'
import type { Activity } from '../world/layout'
import { sceneHour } from '../world/time'
import { latestComment, snippet } from './comments'

/**
 * Lời thoại của agent. Phần lớn là câu vui có sẵn; thỉnh thoảng xen câu lấy từ dữ liệu Paperclip thật
 * (ticket, comment). Không gọi LLM.
 */

export interface Line { text: string; real?: boolean }
/** Một đoạn hội thoại hai người: [0 | 1 = ai nói, câu] */
export type Dialogue = [0 | 1, Line][]

/** Tỉ lệ câu thật khi có dữ liệu thật để nói */
const REAL_RATE = 0.35

const any = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]
const fun = (text: string): Line => ({ text })
const real = (text: string): Line => ({ text, real: true })
const clip = (s: string, n = 38) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

// ───────────────────────── Câu vui có sẵn ─────────────────────────

const AT: Record<Activity, string[]> = {
  coffee: ['Cà phê sữa đá là chân ái ☕', 'Ly thứ ba trong ngày rồi…', 'Máy pha hôm nay hơi đắng', 'Thiếu cà phê là không chạy nổi', 'Ai uống bạc xỉu không?'],
  fridge: ['Ai lấy hộp sữa chua của tôi?', 'Tủ lạnh toàn nước ngọt…', 'Còn bánh flan không ta?', 'Để dành miếng bánh này cho chiều'],
  water: ['Uống nước cho tỉnh', 'Nhớ uống đủ 2 lít nha', 'Nước mát ghê'],
  window: ['Trời hôm nay đẹp ghê', 'Ngắm xe chạy cho đỡ mỏi mắt', 'Chiều nay chắc mưa…', 'Nghỉ mắt 20 giây theo luật 20-20-20'],
  tv: ['Ai bật TV phòng họp vậy?', 'Chiếu lại slide họp hôm qua à?', 'TV này nét thật'],
  foos: ['Gooool! ⚽', 'Ván này tôi thắng chắc', 'Không được xoay 360 nha!', 'Thủ môn ngủ gật rồi kìa', 'Ăn gian nha!'],
  books: ['Cuốn này hay nè', 'Đọc vài trang lấy cảm hứng', 'Sách SEO 2019… hơi cũ rồi', 'Ai mượn cuốn Copywriting chưa trả?'],
  sofa: ['Ngả lưng 5 phút thôi…', 'Sofa này êm thật', 'Nghỉ chút rồi chiến tiếp'],
  beanbag: ['Ghế lười đúng là lười thật', 'Ngồi xuống là không muốn đứng dậy', 'Cho tôi 5 phút…'],
  stool: ['Ăn vặt chút đã', 'Bánh mì hôm nay giòn ghê', 'Chiều nay ai đặt trà sữa không?'],
  meeting: ['Phòng họp trống, mượn ngồi chút', 'Tập thuyết trình tí', 'Ghế phòng họp êm hơn ghế mình'],
  kanban: ['Để xem bảng còn gì nào', 'Cột Xong dài ra rồi 😎', 'Chưa có ticket mới à?', 'Ai kéo thẻ này qua vậy?'],
  fame: ['Tuần này ai dẫn đầu nhỉ?', 'Phải cày thêm mới lên top được 💪', 'Ủa ai cày dữ vậy?', 'Tên mình phải lên bảng vàng mới được', 'Lên cấp là được bàn xịn hơn đó'],
}

const SEAT_IDLE = ['Rảnh quá, ai giao việc đi', 'Dọn bàn chút', 'Đọc lại checklist cái', 'Hôm nay ăn trưa ở đâu ta?']
const WORKING = ['Để xem nào…', 'Chạy lint lại cái', 'Gần xong rồi…', 'File này dài ghê', 'Đọc kỹ đề trước đã', 'Hmm, chỗ này hơi lạ']
const SLEEPING = ['Zzz…', 'Zzz… 5 phút nữa thôi…']
const ERRORING = ['Ơ… lỗi rồi', 'Ai cứu với 😵', 'Chắc lại timeout…', 'Sao lại thế này…']

/** Agent vừa gửi phiếu duyệt / câu hỏi cho bạn */
export const ASK_APPROVAL = ['Sếp ơi, duyệt giúp em với! 🙋', 'Em gửi phiếu rồi, sếp xem giúp ạ', 'Chờ sếp gật đầu là em làm tiếp 🙏']
export const ASK_QUESTION = ['Sếp ơi, em hỏi chút! 🙋', 'Em cần sếp trả lời mới làm tiếp được', 'Sếp rảnh ghé bàn em xíu nha']
/** Bạn vừa xử lý xong việc agent chờ */
export const ASK_THANKS = ['Cảm ơn sếp! 🙏', 'Ok sếp, em làm tiếp liền!', 'Tuyệt, cảm ơn sếp 😄']
export const ASK_DENIED = ['Dạ, em hiểu rồi…', 'Ok sếp, để em xem lại', 'Hơi buồn xíu, nhưng ok 😅']

export const GREET_IDLE = ['Chào sếp! 👋', 'Sếp ghé chơi à?', 'Hello sếp!', 'Sếp uống cà phê không?', 'Sếp khoẻ không?']

// ───────────────────────── Câu theo giờ Việt Nam ─────────────────────────

type Period = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night'
const periodNow = (): Period => {
  const h = sceneHour()
  if (h < 5) return 'night'
  if (h < 7) return 'dawn'
  if (h < 11) return 'morning'
  if (h < 13.5) return 'noon'
  if (h < 18) return 'afternoon'
  if (h < 22) return 'evening'
  return 'night'
}
const TIME_MUSE: Record<Period, string[]> = {
  dawn: ['Dậy sớm ghê ta', 'Bình minh đẹp quá 🌅', 'Chưa ai tới, yên tĩnh thật'],
  morning: ['Sáng nay ăn phở chưa?', 'Buổi sáng năng suất nhất nè', 'Cà phê sáng là phải có'],
  noon: ['Trưa rồi, ăn cơm thôi 🍚', 'Trưa nay ăn bún bò không?', 'Buồn ngủ quá, chợp mắt tí…'],
  afternoon: ['Ba giờ chiều, cần trà sữa gấp', 'Chiều nay nắng ghê', 'Cố lên, sắp hết ngày rồi'],
  evening: ['Tối rồi mà vẫn còn làm 😅', 'Ai về sớm không?', 'Tối nay ăn gì đây…'],
  night: ['Khuya rồi đó 🌙', 'Văn phòng ban đêm yên ghê', 'Thức khuya hại da lắm…', 'Agent không cần ngủ, nhưng tui muốn ngủ'],
}
const TIME_GREET: Record<Period, string[]> = {
  dawn: ['Sếp dậy sớm vậy!'],
  morning: ['Chào buổi sáng sếp! ☀️', 'Sếp ăn sáng chưa?'],
  noon: ['Sếp ăn trưa chưa?', 'Trưa rồi sếp nghỉ chút đi'],
  afternoon: ['Chào buổi chiều sếp!', 'Sếp uống trà sữa không?'],
  evening: ['Tối rồi sếp chưa về à?', 'Sếp ăn tối chưa?'],
  night: ['Khuya rồi sếp chưa ngủ à? 🌙', 'Sếp đi ngủ sớm đi kẻo mệt'],
}
/** Ngắm cửa sổ ban đêm thì nói chuyện trăng sao, không nói "trời đẹp, nắng" */
const WINDOW_NIGHT = ['Trăng sáng ghê 🌙', 'Ngoài kia tối om', 'Đêm nay nhiều sao quá', 'Thành phố lên đèn rồi']
const isDark = () => { const p = periodNow(); return p === 'night' || p === 'evening' }
export const EXCUSE = ['Cho em qua với sếp 🙏', 'Xin lỗi sếp, mượn đường!', 'Sếp ơi nhường em tí']

/** Được bạn khen (nút Khen), và lúc lên cấp */
export const PRAISED = ['Cảm ơn sếp nhiều! 🥰', 'Được sếp khen là vui cả ngày 😄', 'Em sẽ cố hơn nữa!', 'Hihi, cảm ơn sếp 🙏']
export const LEVEL_UP = (level: number, title: string) => [`Lên cấp ${level} rồi! 🎉`, `Yeah! Giờ em là ${title} 😎`, `Cấp ${level}! Bàn mới đâu sếp ơi 😆`]

export const ACT_EMOTE: Record<Activity, string> = {
  coffee: '☕', fridge: '🧃', water: '💧', window: '🌤️', tv: '📺', foos: '⚽', books: '📖',
  sofa: '🛋️', beanbag: '😌', stool: '🥐', meeting: '📊', kanban: '📌', fame: '🏆',
}

const DIALOGUES: Dialogue[] = [
  [[0, fun('Trưa nay ăn gì?')], [1, fun('Cơm tấm đầu hẻm đi!')], [0, fun('Chốt!')]],
  [[0, fun('Làm ván bi lắc không?')], [1, fun('Thua thì bao cà phê nha')], [0, fun('Ok, chơi luôn')]],
  [[0, fun('Cuối tuần làm gì?')], [1, fun('Ngủ bù thôi')], [0, fun('Chuẩn bài!')]],
  [[0, fun('Ai để cốc ở bàn họp vậy?')], [1, fun('Không phải tôi nha 😅')]],
  [[0, fun('Mạng hôm nay lag ghê')], [1, fun('Chắc ai đang tải game')], [0, fun('Nghi lắm…')]],
  [[0, fun('Đọc checklist mới chưa?')], [1, fun('Đọc rồi, dài phết')], [0, fun('Mà viết kỹ thật')]],
  [[0, fun('Context còn nhiều không?')], [1, fun('Còn 40%, thoải mái')], [0, fun('Sướng ghê')]],
  [[0, fun('Nghe nói sắp có thêm người mới')], [1, fun('Thật à? Team nào?')], [0, fun('Chưa biết, bí mật lắm')]],
  [[0, fun('Chiều nay trà sữa không?')], [1, fun('Ít đường thôi nha')], [0, fun('Biết rồi 😄')]],
]

// ───────────────────────── Dữ liệu thật ─────────────────────────

export interface World { agents: Agent[]; issues: Issue[] }

const isToday = (iso?: string | null) => !!iso && new Date(iso).toDateString() === new Date().toDateString()
const within = (iso: string | null | undefined, hours: number) => !!iso && Date.now() - new Date(iso).getTime() < hours * 3_600_000
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
const byNewest = (a: Issue, b: Issue) => b.updatedAt.localeCompare(a.updatedAt)

/** Ticket gần đây nhất của agent (bất kể trạng thái) */
export const latestIssueOf = (agent: Agent, w: World) =>
  (agent.issueId ? w.issues.find((i) => i.id === agent.issueId) : undefined) ??
  w.issues.filter((i) => i.assigneeId === agent.id).sort(byNewest)[0]

const isLead = (agent: Agent, w: World) => w.agents.some((a) => a.reportsTo === agent.id)

/** Những câu có thể nói từ dữ liệu thật của agent này */
export function realFacts(agent: Agent, w: World): Line[] {
  const out: Line[] = []
  const mine = w.issues.filter((i) => i.assigneeId === agent.id)

  const cur = agent.issueId ? w.issues.find((i) => i.id === agent.issueId) : undefined
  if (agent.status === 'running' && cur) out.push(real(`Đang xử lý ${cur.key}: ${clip(cur.title)}`))

  const done = mine.filter((i) => i.status === 'done' && within(i.completedAt ?? i.updatedAt, 24)).sort(byNewest)[0]
  if (done) {
    out.push(real(any([
      `Vừa xong ${done.key} lúc ${hhmm(done.completedAt ?? done.updatedAt)}, nhẹ cả người!`,
      `${done.key} xong rồi, chờ việc mới thôi`,
    ])))
  }
  const review = mine.find((i) => i.status === 'in_review')
  if (review) out.push(real(`${review.key} đang chờ duyệt…`))
  const blocked = mine.find((i) => i.status === 'blocked')
  if (blocked) out.push(real(`${blocked.key} bị chặn, chờ người gỡ`))
  const todo = mine.filter((i) => i.status === 'todo').length
  if (todo) out.push(real(`Còn ${todo} ticket đang chờ mình`))

  if (isLead(agent, w)) {
    const toReview = w.issues.filter((i) => i.status === 'in_review').length
    if (toReview) out.push(real(`Có ${toReview} ticket chờ mình duyệt`))
    const today = w.issues.filter((i) => i.status === 'done' && isToday(i.completedAt ?? i.updatedAt)).length
    if (today) out.push(real(`Hôm nay cả nhóm xong ${today} ticket rồi 💪`))
  }

  const last = latestIssueOf(agent, w)
  const c = last ? latestComment(last.id) : undefined
  if (last && c && within(c.createdAt, 48)) out.push(real(`Comment mới ở ${last.key}: “${snippet(c.body, 56)}”`))

  if (agent.status === 'error' && agent.reason) out.push(real(`Lỗi: ${clip(agent.reason, 60)}`))
  return out
}

/** Pha trộn: có dữ liệu thật thì ~35% nói câu thật, còn lại câu vui. */
function mix(agent: Agent, w: World, pool: string[]): Line {
  const facts = realFacts(agent, w)
  if (facts.length && Math.random() < REAL_RATE) return any(facts)
  return fun(any(pool))
}

/** Câu nói về cấp hiện tại: còn bao nhiêu EXP nữa lên cấp */
function levelTalk(agentId: string) {
  const total = useExp.getState().stats[agentId]?.total ?? 0
  const lv = levelOf(total)
  const need = expForLevel(lv + 1) - total
  return need <= 60 ? `Còn ${need} EXP nữa là lên cấp ${lv + 1} rồi!` : `Mình đang cấp ${lv} · ${titleOf(lv)}`
}

/** Câu tự nói một mình, theo trạng thái và việc đang làm. */
export function muse(agent: Agent, w: World, act: Activity | null): Line {
  switch (agent.status) {
    case 'running': return mix(agent, w, WORKING)
    case 'paused': return fun(any(SLEEPING))
    case 'error': return mix(agent, w, ERRORING)
    default: {
      // Thỉnh thoảng nói chuyện theo giờ (sáng ăn phở, trưa buồn ngủ, khuya...)
      if (Math.random() < 0.22) return fun(any(TIME_MUSE[periodNow()]))
      // Đứng trước bảng vàng: hay nói về cấp của chính mình (số thật)
      if (act === 'fame' && Math.random() < 0.5) return real(levelTalk(agent.id))
      const pool = act === 'window' && isDark() ? WINDOW_NIGHT : act ? AT[act] : SEAT_IDLE
      return mix(agent, w, pool)
    }
  }
}

/** Câu chào khi bạn đi ngang qua. */
export function greet(agent: Agent, w: World): Line | null {
  switch (agent.status) {
    case 'running': {
      const cur = agent.issueId ? w.issues.find((i) => i.id === agent.issueId) : undefined
      return cur ? real(`Em đang làm ${cur.key} nè sếp`) : fun('Em đang bận chút sếp ơi!')
    }
    case 'error':
      return agent.reason ? real(`Sếp ơi, em bị lỗi: ${clip(agent.reason, 50)}`) : fun('Sếp xem log giúp em với (bấm E)')
    case 'paused':
      return Math.random() < 0.5 ? fun('Zzz…') : null
    default:
      return fun(any(Math.random() < 0.45 ? TIME_GREET[periodNow()] : GREET_IDLE))
  }
}

/** Đoạn hội thoại giữa hai agent đang rảnh. */
export function dialogue(_a: Agent, b: Agent, w: World): Dialogue {
  if (Math.random() < REAL_RATE) {
    const options: Dialogue[] = []
    const bi = latestIssueOf(b, w)
    if (bi) {
      const answer =
        bi.status === 'done' ? `Xong rồi, từ ${hhmm(bi.completedAt ?? bi.updatedAt)}` :
        bi.status === 'in_review' ? 'Xong rồi, đang chờ duyệt' :
        bi.status === 'blocked' ? 'Đang bị chặn, chờ người gỡ' :
        bi.status === 'in_progress' ? 'Đang làm, sắp xong!' : 'Chưa bắt đầu…'
      options.push([[0, real(`${b.name} ơi, ${bi.key} sao rồi?`)], [1, real(answer)], [0, fun(bi.status === 'done' ? 'Ngon! 👍' : 'Cố lên nha')]])
      const c = latestComment(bi.id)
      if (c && within(c.createdAt, 72)) {
        options.push([[0, real(`Thấy comment mới ở ${bi.key} chưa?`)], [1, real(`Thấy rồi: “${snippet(c.body, 50)}”`)]])
      }
    }
    const today = w.issues.filter((i) => i.status === 'done' && isToday(i.completedAt ?? i.updatedAt)).length
    if (today) options.push([[0, real(`Hôm nay team xong ${today} ticket đó`)], [1, fun('Năng suất ghê!')]])
    const todo = w.issues.filter((i) => i.status === 'todo' || i.status === 'backlog').length
    if (todo) options.push([[0, real(`Bảng còn ${todo} ticket chưa ai làm`)], [1, fun('Để sếp giao thôi')]])
    if (options.length) return any(options)
  }
  return any(DIALOGUES)
}

/** Lead ghé bàn một thành viên đang làm. */
export function visitTalk(_lead: Agent, member: Agent, w: World): Dialogue {
  const cur = member.issueId ? w.issues.find((i) => i.id === member.issueId) : undefined
  if (cur) {
    return [
      [0, real(`${member.name} ơi, ${cur.key} tới đâu rồi?`)],
      [1, fun(any(['Đang chạy ngon sếp, chút nữa xong!', 'Gần xong rồi ạ', 'Đang kiểm tra lại lần cuối']))],
      [0, fun(any(['Ok, có gì báo nha', 'Tốt lắm 👍', 'Nhớ cập nhật ticket nhé']))],
    ]
  }
  return [[0, fun(`${member.name} ơi, ổn không?`)], [1, fun('Ổn sếp ơi!')]]
}

/** Câu khi trạng thái agent vừa đổi. `task` = ticket trước đó (để báo xong cái gì). */
export function onStatus(agent: Agent, prev: string, prevTask: string | undefined): Line | null {
  const key = prevTask?.split(' · ')[0]
  switch (agent.status) {
    case 'running':
      return agent.task ? real(`Có việc rồi: ${agent.task.split(' · ')[0]}!`) : fun('Có việc rồi!')
    case 'idle':
      if (prev === 'running') return key ? real(`Xong ${key}! 🎉`) : fun('Xong việc rồi! 🎉')
      if (prev === 'paused') return fun('Làm tiếp thôi!')
      return null
    case 'error':
      return agent.reason ? real(`Toang: ${clip(agent.reason, 50)}`) : fun('Toang rồi…')
    case 'paused':
      return fun('Đi ngủ đây… 😴')
    default:
      return null
  }
}
