// FILE SINH TỰ ĐỘNG từ layer "Markers" và "Collision" của maps/office.tmj (scripts/map-markers.mjs). Đừng sửa tay: sửa map trong Tiled.
// Đơn vị: pixel của map, gốc ở góc tây bắc map.

export interface MapRect { x: number; y: number; w: number; h: number }
export interface MapPoint { x: number; y: number }
/** Vùng chặn (layer Collision): height = cao bao nhiêu mét, không ghi = cao như tường */
export interface MapBlock extends MapRect { height?: number }

export const MAP_MARKERS: {
  tile: number; room: MapRect; windows: MapRect[]; kanban: MapRect; door: MapRect; spawn: MapPoint; lobby: MapPoint[]; blocks: MapBlock[]
} = {
  tile: 16,
  room: { x: 16, y: 48, w: 864, h: 480 },
  windows: [{ x: 88, y: 16, w: 48, h: 32 }, { x: 376, y: 16, w: 48, h: 32 }, { x: 472, y: 16, w: 48, h: 32 }, { x: 760, y: 16, w: 48, h: 32 }],
  kanban: { x: 252.8, y: 16, w: 96, h: 32 },
  door: { x: 432, y: 528, w: 32, h: 16 },
  spawn: { x: 448, y: 470.4 },
  lobby: [{ x: 544, y: 486.4 }, { x: 614.4, y: 486.4 }, { x: 547.2, y: 459.2 }, { x: 611.2, y: 459.2 }],
  blocks: [],
}
