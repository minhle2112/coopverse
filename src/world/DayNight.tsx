import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, Fog, MeshBasicMaterial, MeshStandardMaterial, PointsMaterial, Vector3,
  type DirectionalLight, type HemisphereLight, type Mesh, type PointLight,
} from 'three'
import { setMusicNight } from '../audio/engine'
import { useSettings } from '../settings'
import { ambienceAt, newAmbience, sceneHour, sunElevation, sunProgress } from './time'

/** Mặt kính cửa sổ: màu trời đổi theo giờ (dùng chung cho mọi cửa sổ, không bị gộp khi bake) */
export const windowMat = new MeshBasicMaterial({ color: '#cfeaff', toneMapped: false, side: DoubleSide })
/** Bóng đèn thả trần: sáng lên khi trời tối */
const bulbMat = new MeshStandardMaterial({ color: '#fff2d6', emissive: new Color('#ffcf7a'), emissiveIntensity: 0, roughness: 0.4 })
const shadeMat = new MeshStandardMaterial({ color: '#2f3340', roughness: 0.6, side: DoubleSide })
const cordMat = new MeshBasicMaterial({ color: '#2a2a2a' })
const WHITE = new Color('#ffffff')
const _dir = new Vector3()

/** Đèn thả trần (có chao đèn) và đèn trần ẩn (chỉ có ánh sáng) */
const PENDANTS: [number, number][] = [
  [-12.6, -7.4], // phòng Lead
  [11.8, -7.8], [13.2, -7.8], // phòng họp
  [11.2, 9.3], // pantry
  [-13.9, 7.5], // góc thư giãn
]
const LIGHTS: { x: number; z: number; y: number; power: number; dist: number }[] = [
  { x: -12.6, z: -7.4, y: 2.3, power: 14, dist: 9 },
  { x: 12.5, z: -7.8, y: 2.3, power: 16, dist: 9 },
  { x: 11.2, z: 9.0, y: 2.3, power: 12, dist: 9 },
  { x: -13.9, z: 7.5, y: 2.3, power: 13, dist: 9 },
  { x: -4.5, z: 0, y: 3.4, power: 22, dist: 13 },
  { x: 4.5, z: 0, y: 3.4, power: 22, dist: 13 },
  { x: 0, z: 7.5, y: 3.4, power: 14, dist: 11 },
]

function Pendant({ x, z }: { x: number; z: number }) {
  const top = 3.2, y = 2.45
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, (top + y) / 2 + 0.12, 0]} material={cordMat}>
        <cylinderGeometry args={[0.008, 0.008, top - y, 4]} />
      </mesh>
      <mesh position={[0, y + 0.08, 0]} material={shadeMat} castShadow>
        <coneGeometry args={[0.26, 0.24, 12, 1, true]} />
      </mesh>
      <mesh position={[0, y - 0.02, 0]} material={bulbMat}>
        <sphereGeometry args={[0.07, 10, 8]} />
      </mesh>
    </group>
  )
}

function Stars({ mat }: { mat: PointsMaterial }) {
  const geo = useMemo(() => {
    const n = 500
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      // Nửa trên của bầu trời, xa ngoài sương mù
      const u = Math.random() * Math.PI * 2
      const v = 0.08 + Math.random() * 0.92
      const r = 120
      pos[i * 3] = Math.cos(u) * Math.sqrt(1 - v * v) * r
      pos[i * 3 + 1] = v * r
      pos[i * 3 + 2] = Math.sin(u) * Math.sqrt(1 - v * v) * r
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    return g
  }, [])
  return <points geometry={geo} material={mat} frustumCulled={false} />
}

/**
 * Ngày/đêm theo giờ Việt Nam: màu trời, sương mù, mặt trời/mặt trăng (đổ bóng), sao, cửa sổ,
 * đèn trong phòng bật khi trời tối. Thay cho đèn cố định của giai đoạn 1–4.
 */
export function DayNight() {
  const scene = useThree((s) => s.scene)
  const sun = useRef<DirectionalLight>(null!)
  const hemi = useRef<HemisphereLight>(null!)
  const lamps = useRef<(PointLight | null)[]>([])
  const sunDisc = useRef<Mesh>(null!)
  const moonDisc = useRef<Mesh>(null!)
  const amb = useMemo(newAmbience, [])
  const starMat = useMemo(() => new PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }), [])
  const cache = useRef({ at: -1, hour: 12 })
  const shadows = useSettings((s) => s.quality !== 'low')

  useEffect(() => {
    scene.background = new Color('#bfe3f5')
    scene.fog = new Fog('#bfe3f5', 45, 140)
    return () => { scene.background = null; scene.fog = null }
  }, [scene])

  useFrame(({ clock }) => {
    // Giờ chỉ cần tính lại mỗi giây (hoặc ngay khi đổi giờ xem thử)
    const c = cache.current
    const override = useSettings.getState().hour
    if (override !== null) c.hour = override
    else if (clock.elapsedTime - c.at > 1 || c.at < 0) { c.at = clock.elapsedTime; c.hour = sceneHour() }
    const h = c.hour
    ambienceAt(h, amb)

    ;(scene.background as Color).copy(amb.sky)
    ;(scene.fog as Fog).color.copy(amb.sky)
    // Cửa sổ sáng hơn trời một chút, ban đêm hơi ánh xanh
    windowMat.color.copy(amb.sky).lerp(WHITE, 0.18 * (1 - amb.night))

    hemi.current.color.copy(amb.hemiSky)
    hemi.current.groundColor.copy(amb.hemiGround)
    hemi.current.intensity = amb.hemiI

    // Ban ngày nắng đi từ đông (+x) sang tây (-x), hơi chếch phía nam; ban đêm là trăng
    const e = sunElevation(h)
    const L = sun.current
    if (e >= 0) {
      const p = sunProgress(h)
      L.position.set(Math.cos(Math.PI * p) * 22, Math.max(4, e * 26), 10)
    } else {
      const q = (((h - 18) % 24) + 24) % 24 / 12
      L.position.set(Math.cos(Math.PI * q) * 20, 9 + Math.sin(Math.PI * Math.min(1, q)) * 16, 8)
    }
    L.color.copy(amb.sun)
    L.intensity = amb.sunI

    const dir = _dir.copy(L.position).normalize().multiplyScalar(105)
    sunDisc.current.position.copy(dir)
    sunDisc.current.visible = e > -0.05
    moonDisc.current.position.copy(dir)
    moonDisc.current.visible = e < -0.05

    starMat.opacity = amb.night * 0.9
    bulbMat.emissiveIntensity = amb.lamp * 2.2
    for (let i = 0; i < LIGHTS.length; i++) {
      const l = lamps.current[i]
      if (l) l.intensity = LIGHTS[i].power * amb.lamp
    }
    setMusicNight(amb.night)
  })

  return (
    <>
      <hemisphereLight ref={hemi} args={['#fff6e8', '#9a8a70', 1.25]} />
      <directionalLight
        ref={sun}
        position={[10, 22, 12]}
        intensity={1.9}
        color="#fff3dc"
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-far={80}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {LIGHTS.map((l, i) => (
        <pointLight key={i} ref={(r) => { lamps.current[i] = r }} position={[l.x, l.y, l.z]} color="#ffd29a" intensity={0} distance={l.dist} decay={1.6} />
      ))}
      {PENDANTS.map(([x, z]) => <Pendant key={`${x},${z}`} x={x} z={z} />)}
      <Stars mat={starMat} />
      <mesh ref={sunDisc}>
        <sphereGeometry args={[4.5, 16, 12]} />
        <meshBasicMaterial color="#fff1c4" fog={false} toneMapped={false} />
      </mesh>
      <mesh ref={moonDisc}>
        <sphereGeometry args={[3, 16, 12]} />
        <meshBasicMaterial color="#e8ecff" fog={false} toneMapped={false} />
      </mesh>
    </>
  )
}
