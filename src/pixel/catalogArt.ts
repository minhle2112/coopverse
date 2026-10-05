import { AnimatedSprite, Container, Graphics, NineSliceSprite, Sprite } from 'pixi.js'
import { footprint, type Item } from '../data/catalog'
import { CELL, cellX, cellZ } from '../data/officeState'
import atlas from './atlas.json'
import { frames, sheet, sprite, stitch, type SpriteName } from './assets'
import { PPM, px, py } from './geom'
import { WALL_SHIFT, sortAt, spr, wallTop, type Light, type Rect } from './office'

/**
 * Hình của từng món trong cửa hàng (src/data/catalog.ts), toàn bộ là hình LimeZu:
 * món 4 hướng dùng đúng hình từng hướng của gói (ghế bành, sofa), món lật thì lật gương.
 */

/** Hình theo hướng: [nhìn xuống, nhìn trái, nhìn lên, nhìn phải]; một phần tử = mọi hướng dùng chung */
const VIEWS: Record<string, SpriteName[][]> = {
  plantSmall: [['plantSmall']], plantBig: [['plantBig']], plantTree: [['plantTree']], plantPalm: [['plantPalm']],
  lampFloor: [['lampFloor']], floorLamp: [['floorLamp']], cabinet: [['cabinet']],
  bookshelf: [['bookshelf']], bookshelfWide: [['bookshelfWide']], waterCooler: [['moCooler']], vending: [['vending']],
  whiteboard: [['whiteboard']], chalkboard: [['chalkboard']],
  corkboard: [['corkboard']], painting1: [['painting1']], painting2: [['painting2']], painting3: [['painting3']],
  moChart: [['moChart']], moChart2: [['moChart2']], tvWall: [['tv']],
  sofa: [['sofaF'], ['sofaSL'], ['sofaB'], ['sofaSR']],
  armRed: [['armRedF'], ['armRedL'], ['armRedB'], ['armRedR']],
  armBlue: [['armBlueF'], ['armBlueL'], ['armBlueB'], ['armBlueR']],
  coffeeTable: [['coffeeTable']], tableHoney: [['tableHoney']], highTable: [['highTable']], stool: [['stool']],
  bench: [['bench']], kitCounter: [['kitCounter']], kitSink: [['kitSink']], kitStove: [['kitStove']],
  kitFridge: [['kitFridge']], fridge: [['fridge']],
  arcade1: [['arcade1']], arcade2: [['arcade2']], tvStand: [['tvStand', 'tvStand2']],
  pingpong: [['pingpongBig']], pool: [['pool']],
}

/** Thảm: mép giữ nguyên khi kéo dãn (trái/phải, trên/dưới, pixel) */
const RUGS: Record<string, [SpriteName, number, number]> = {
  rugGrey: ['rugGrey', 6, 6], rugGreen: ['rugGreen', 6, 6], rugBorder: ['rugBorder', 8, 8], rugRed: ['rugRed', 14, 12], rugBlue: ['rugBlue', 14, 12],
}

/** Đồ treo tường: cách mép trên mặt tường bao nhiêu pixel */
const WALL_Y: Record<string, number> = { corkboard: 10, painting1: 8, painting2: 8, painting3: 8, moChart: 4, moChart2: 4, clock: 0, tvWall: 6, fame: 3 }

const viewOf = (i: Item, rot: number): { names: SpriteName[]; flip: boolean } => {
  const v = VIEWS[i.id] ?? [['boxSmall']]
  if (i.turn === 'flip') return { names: v[0], flip: rot === 1 }
  return { names: v[rot] ?? v[0], flip: false }
}

/** Nhiều mảnh ghép ngang, căn giữa tại cx, chân ở bottom */
function strip(names: SpriteName[], cx: number, bottom: number, flip: boolean) {
  const c = new Container()
  const total = names.reduce((w, n) => w + sprite(n).width, 0)
  let x = -total / 2
  for (const n of names) {
    const t = sprite(n)
    const s = new Sprite(t)
    s.position.set(Math.round(x), -t.height)
    c.addChild(s)
    x += t.width
  }
  c.position.set(Math.round(cx), Math.round(bottom))
  if (flip) c.scale.x = -1
  return c
}

export interface ItemView {
  node: Container
  /** sorted: xếp lớp cùng người · floor: nằm dưới mọi thứ (thảm, đồ treo tường) */
  layer: 'sorted' | 'floor'
  /** Khung bấm chuột (pixel gốc) */
  hit: Rect
  light?: Light
}

/** Khung pixel của các ô một món chiếm trên sàn */
export function footRect(i: Item, c: number, r: number, rot: number): Rect {
  const { w, d } = footprint(i, rot)
  return { x: Math.round(px(cellX(c))), y: Math.round(py(cellZ(r))), w: w * CELL * PPM, h: d * CELL * PPM }
}

/** Khung pixel của đồ treo tường ở cột c */
export function wallRect(i: Item, c: number): Rect {
  const x = Math.round(px(cellX(c)))
  return { x, y: wallTop() + WALL_SHIFT, w: i.w * CELL * PPM, h: 30 }
}

/** Khung của hình (toạ độ bản đồ: node nằm ở gốc, chưa gắn vào sân khấu) */
const bounds = (o: Container): Rect => {
  const b = o.getLocalBounds()
  return { x: Math.floor(b.x), y: Math.floor(b.y), w: Math.ceil(b.width), h: Math.ceil(b.height) }
}

/** Dựng hình một món đặt ở ô (c, r) hướng rot. `fame`: vẽ nội dung bảng vinh danh (Scene vẽ lại khi EXP đổi) */
export function itemView(i: Item, c: number, r: number, rot: number, fame?: Graphics): ItemView {
  if (i.mount === 'wall') return wallItem(i, c, fame)
  const f = footRect(i, c, r, rot)
  const cx = f.x + f.w / 2, bottom = f.y + f.h
  if (i.mount === 'rug') {
    const [name, lr, tb] = RUGS[i.id]
    const n = new NineSliceSprite({ texture: sprite(name), leftWidth: lr, rightWidth: lr, topHeight: tb, bottomHeight: tb })
    n.width = f.w
    n.height = f.h
    n.position.set(f.x, f.y)
    return { node: n, layer: 'floor', hit: f }
  }
  let node: Container
  let light: Light | undefined
  if (i.id === 'cat') {
    const a = new AnimatedSprite(frames('cat', 32, 16))
    a.anchor.set(0.5, 1)
    a.animationSpeed = 0.07
    a.play()
    a.position.set(Math.round(cx), bottom - 1)
    if (rot === 1) a.scale.x = -1
    node = a
  } else if (i.id === 'coffeeBar') {
    // Tủ bếp, máy pha cà phê LimeZu (động) đặt trên mặt tủ
    node = strip(['kitCounter2'], cx, bottom, false)
    const m = new AnimatedSprite(frames('coffee', 16, 32))
    m.anchor.set(0.5, 1)
    m.animationSpeed = 0.08
    m.play()
    m.position.set(-3, -10)
    node.addChild(m)
  } else if (i.id === 'meetingTable') {
    const lift = 9
    const t = new Sprite(stitch('meetingTable', f.w, f.h - 6 + lift, 10, 12, 6, 12))
    node = new Container()
    t.position.set(-f.w / 2, -(f.h - 6 + lift))
    node.addChild(t)
    node.position.set(Math.round(cx), bottom - 2)
  } else if (i.id === 'meetingChair' && rot === 2) {
    // Ghế quay lưng: mặt ghế + lưng ghế phía trên
    node = new Container()
    node.addChild(spr('chairFront', 0, -2), spr('chairBack', 0, -9))
    node.position.set(Math.round(cx), bottom)
  } else if (i.id === 'meetingChair') {
    node = strip(['chairFront'], cx, bottom - 1, false)
  } else {
    const v = viewOf(i, rot)
    node = strip(v.names, cx, bottom, v.flip)
  }
  if (i.light === 'lamp') light = { x: Math.round(cx), y: bottom - 26, r: 40, kind: 'lamp' }
  else if (i.light === 'screen') light = { x: Math.round(cx), y: bottom - 18, r: 18, kind: 'screen' }
  sortAt(node, bottom)
  // Bóng đổ nhạt sát chân (hình LimeZu không kèm bóng); thảm, ghế đẩu, ghế họp thì thôi
  const wrap = new Container()
  if (i.h >= 0.5) {
    const g = new Graphics()
    g.ellipse(Math.round(cx), bottom - 1, Math.max(4, Math.round(f.w * 0.46)), 3).fill({ color: 0x000000, alpha: 0.2 })
    wrap.addChild(g)
  }
  wrap.addChild(node)
  wrap.zIndex = node.zIndex
  return { node: wrap, layer: 'sorted', hit: bounds(wrap), light }
}

function wallItem(i: Item, c: number, fame?: Graphics): ItemView {
  const R = wallRect(i, c)
  const cx = R.x + R.w / 2
  const top = R.y + (WALL_Y[i.id] ?? 6)
  const node = new Container()
  let light: Light | undefined
  if (i.id === 'clock') {
    const a = new AnimatedSprite(frames('clock', 16, 32))
    a.animationSpeed = 0.05
    a.play()
    a.position.set(Math.round(cx - 8), top)
    node.addChild(a)
  } else if (i.id === 'fame') {
    // Bảng vinh danh: khung bảng phấn LimeZu, nội dung (3 agent nhiều EXP nhất) vẽ ở Scene
    const w = R.w, h = 26
    const shadow = new Graphics().rect(R.x + 1, top + h, w - 2, 2).fill({ color: 0x000000, alpha: 0.22 })
    const bd = new Sprite(stitch('chalkWall', w, h, 4, 4, 4, 5))
    bd.position.set(R.x, top)
    node.addChild(shadow, bd)
    if (fame) {
      fame.position.set(R.x + 5, top + 5)
      node.addChild(fame)
    }
  } else {
    const t = sprite(VIEWS[i.id][0][0])
    const s = new Sprite(t)
    s.position.set(Math.round(cx - t.width / 2), top)
    node.addChild(new Graphics().rect(Math.round(cx - t.width / 2) + 1, top + t.height, t.width - 2, 1).fill({ color: 0x000000, alpha: 0.18 }), s)
    if (i.light === 'screen') light = { x: Math.round(cx), y: top + t.height / 2, r: 18, kind: 'screen' }
  }
  return { node, layer: 'floor', hit: bounds(node), light }
}

/** Cỡ khung nội dung bảng vinh danh (pixel gốc) */
export const FAME_INNER = { w: 6 * CELL * PPM - 10, h: 16 }

// ───────────────────────── Ảnh nhỏ cho cửa hàng ─────────────────────────

type Frame = [string, number, number, number, number]
const thumbs = new Map<string, string>()

/** Ảnh nhỏ (data URL) của một món ở hướng mặc định, vẽ thẳng từ sheet LimeZu */
export function itemThumb(i: Item): string {
  const hit = thumbs.get(i.id)
  if (hit) return hit
  const parts: Frame[] = []
  const at = (n: SpriteName) => atlas.sprites[n] as Frame
  if (i.id === 'cat') parts.push(['cat', 0, 0, 32, 16])
  else if (i.id === 'clock') parts.push(['clock', 0, 0, 16, 32])
  else if (i.id === 'coffeeBar') parts.push(at('kitCounter2'))
  else if (i.id === 'door') parts.push(['door', 0, 0, 32, 48])
  else if (i.id === 'fame') parts.push(at('chalkWall'))
  else if (i.id === 'meetingTable') parts.push(at('meetingTable'))
  else if (i.id === 'meetingChair') parts.push(at('chairFront'))
  else if (RUGS[i.id]) parts.push(at(RUGS[i.id][0]))
  else for (const n of viewOf(i, 0).names) parts.push(at(n))
  const W = parts.reduce((w, p) => w + p[3], 0), H = Math.max(...parts.map((p) => p[4]))
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')!
  g.imageSmoothingEnabled = false
  let x = 0
  for (const [k, sx, sy, w, h] of parts) {
    g.drawImage(sheet(k).source.resource as CanvasImageSource, sx, sy, w, h, x, H - h, w, h)
    x += w
  }
  if (i.id === 'coffeeBar') g.drawImage(sheet('coffee').source.resource as CanvasImageSource, 0, 0, 16, 32, 4, -8, 16, 32)
  const url = cv.toDataURL()
  thumbs.set(i.id, url)
  return url
}

