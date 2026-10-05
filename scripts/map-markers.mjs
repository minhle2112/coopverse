// Sinh src/world/mapMarkers.ts từ layer "Markers" của maps/office.tmj (vẽ bằng Tiled).
// room.ts lấy vị trí cửa sổ, bảng ticket, cửa, chỗ xuất hiện, sảnh chờ từ file sinh ra này, nên trang lẫn server
// (Node, không đọc được .tmj) dùng chung một nguồn. Vite tự chạy lại khi map đổi (vite.config.ts); tay: `npm run map`.
// `--check`: chỉ kiểm file sinh ra có khớp map không (thoát 1 nếu lệch), dùng khi build.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MAP = path.join(root, 'maps', 'office.tmj')
const OUT = path.join(root, 'src', 'world', 'mapMarkers.ts')

/** Nội dung mapMarkers.ts sinh từ map hiện tại */
export function render() {
  const map = JSON.parse(readFileSync(MAP, 'utf8'))
  const layer = map.layers.find((l) => l.name === 'Markers' && l.type === 'objectgroup')
  if (!layer) throw new Error('maps/office.tmj: thiếu layer Markers')
  const objs = layer.objects
  const one = (name) => {
    const o = objs.find((x) => x.name === name)
    if (!o) throw new Error(`maps/office.tmj: thiếu mốc "${name}"`)
    return o
  }
  // Đánh số theo tên (window1, window2, ...), không theo thứ tự vẽ trong Tiled
  const many = (prefix) => {
    const list = objs
      .filter((x) => new RegExp(`^${prefix}\\d+$`).test(x.name))
      .sort((a, b) => Number(a.name.slice(prefix.length)) - Number(b.name.slice(prefix.length)))
    if (!list.length) throw new Error(`maps/office.tmj: thiếu mốc "${prefix}1"`)
    return list
  }
  const rect = (o) => {
    if (o.point || !o.width || !o.height) throw new Error(`maps/office.tmj: mốc "${o.name}" phải là hình chữ nhật`)
    return { x: o.x, y: o.y, w: o.width, h: o.height }
  }
  const point = (o) => {
    if (!o.point) throw new Error(`maps/office.tmj: mốc "${o.name}" phải là điểm`)
    return { x: o.x, y: o.y }
  }
  const data = {
    tile: map.tilewidth,
    room: rect(one('room')),
    windows: many('window').map(rect),
    kanban: rect(one('kanban')),
    door: rect(one('door')),
    spawn: point(one('spawn')),
    lobby: many('lobby').map(point),
  }
  const r = (v) => Math.round(v * 1000) / 1000
  const fmt = (o) => `{ ${Object.entries(o).map(([k, v]) => `${k}: ${r(v)}`).join(', ')} }`
  return [
    '// FILE SINH TỰ ĐỘNG từ layer "Markers" của maps/office.tmj (scripts/map-markers.mjs). Đừng sửa tay: sửa map trong Tiled.',
    '// Đơn vị: pixel của map, gốc ở góc tây bắc map.',
    '',
    'export const MAP_MARKERS = {',
    `  tile: ${data.tile},`,
    `  room: ${fmt(data.room)},`,
    `  windows: [${data.windows.map(fmt).join(', ')}],`,
    `  kanban: ${fmt(data.kanban)},`,
    `  door: ${fmt(data.door)},`,
    `  spawn: ${fmt(data.spawn)},`,
    `  lobby: [${data.lobby.map(fmt).join(', ')}],`,
    '} as const',
    '',
  ].join('\n')
}

/** Ghi lại file nếu nội dung đổi; trả true nếu có ghi */
export function writeMarkers() {
  const next = render()
  let prev = ''
  try { prev = readFileSync(OUT, 'utf8') } catch { /* chưa có */ }
  if (prev.replace(/\r\n/g, '\n') === next) return false
  writeFileSync(OUT, next)
  return true
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const prev = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n')
    if (prev !== render()) {
      console.error('src/world/mapMarkers.ts lệch với maps/office.tmj: chạy `npm run map`')
      process.exit(1)
    }
  } else {
    console.log(writeMarkers() ? 'map: đã cập nhật src/world/mapMarkers.ts' : 'map: src/world/mapMarkers.ts đã khớp')
  }
}
