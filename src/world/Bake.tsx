import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

type Src = { mesh: Mesh; mat: MeshStandardMaterial | MeshBasicMaterial }

/** Mesh có thể gộp: vật liệu màu trơn, không ảnh, không trong suốt, không đánh dấu userData.live */
function bakeable(o: Mesh): Src | null {
  if (!o.isMesh || o.userData.live || o.userData.merged) return null
  const m = o.material
  if (Array.isArray(m)) return null
  if (!(m instanceof MeshStandardMaterial || m instanceof MeshBasicMaterial)) return null
  if (m.map || m.transparent || m.opacity < 1) return null
  // Vật sáng (emissive) sẽ mất ánh sáng khi gộp: để nguyên
  if (m instanceof MeshStandardMaterial && m.emissive.getHex() !== 0) return null
  return { mesh: o, mat: m }
}

function keyOf({ mesh, mat }: Src) {
  if (mat instanceof MeshBasicMaterial) return `b|${mat.toneMapped}|${mat.side}`
  return `s|${mat.roughness.toFixed(2)}|${mat.metalness.toFixed(2)}|${mat.flatShading}|${mesh.castShadow}|${mesh.receiveShadow}|${mat.side}`
}

/** Bỏ chỉ số + uv, nướng vị trí vào đỉnh và gắn màu vật liệu thành màu đỉnh. */
function prepare({ mesh, mat }: Src, toLocal: Matrix4) {
  let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
  const out = new BufferGeometry()
  out.setAttribute('position', g.getAttribute('position'))
  if (g.getAttribute('normal')) out.setAttribute('normal', g.getAttribute('normal'))
  else out.computeVertexNormals()
  g = out
  g.applyMatrix4(new Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld))
  const n = g.getAttribute('position').count
  const col = new Float32Array(n * 3)
  const { r, g: gg, b } = mat.color
  for (let i = 0; i < n; i++) { col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b }
  g.setAttribute('color', new BufferAttribute(col, 3))
  return g
}

/**
 * Gộp mọi khối tĩnh bên trong thành vài mesh lớn (mỗi loại vật liệu một mesh, màu nằm ở đỉnh).
 * Giảm hàng trăm draw call xuống vài chục. Mesh gốc vẫn nằm trong cây React nhưng bị ẩn.
 * `bakeKey` đổi thì gộp lại (vd. sơ đồ bàn thay đổi). Mesh cần đổi lúc chạy thì đặt userData={{ live: true }}.
 */
export function Baked({ bakeKey, children }: { bakeKey: string; children: ReactNode }) {
  const root = useRef<Group>(null!)
  useLayoutEffect(() => {
    const g = root.current
    g.updateWorldMatrix(true, true)
    const toLocal = new Matrix4().copy(g.matrixWorld).invert()

    const groups = new Map<string, Src[]>()
    g.traverse((o) => {
      const s = bakeable(o as Mesh)
      if (!s) return
      // Mesh ẩn vì lý do khác (không phải do lần gộp trước) thì bỏ qua
      if (!o.visible && !o.userData.baked) return
      const k = keyOf(s)
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(s)
    })

    const made: Mesh[] = []
    for (const [k, list] of groups) {
      const geo = mergeGeometries(list.map((s) => prepare(s, toLocal)))
      if (!geo) continue
      const first = list[0]
      const mat = first.mat instanceof MeshBasicMaterial
        ? new MeshBasicMaterial({ vertexColors: true, toneMapped: first.mat.toneMapped, side: first.mat.side })
        : new MeshStandardMaterial({
            vertexColors: true,
            roughness: first.mat.roughness,
            metalness: first.mat.metalness,
            flatShading: first.mat.flatShading,
            side: first.mat.side,
          })
      const m = new Mesh(geo, mat)
      m.castShadow = k.startsWith('s|') && first.mesh.castShadow
      m.receiveShadow = first.mesh.receiveShadow
      m.userData.merged = true
      m.matrixAutoUpdate = false
      g.add(m)
      made.push(m)
      for (const s of list) {
        s.mesh.visible = false
        s.mesh.userData.baked = true
      }
    }

    return () => {
      for (const m of made) {
        g.remove(m)
        m.geometry.dispose()
        ;(m.material as MeshStandardMaterial).dispose()
      }
    }
  }, [bakeKey])
  return <group ref={root}>{children}</group>
}
