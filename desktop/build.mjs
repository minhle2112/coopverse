// Gom app desktop vào build/app (thư mục electron-builder đóng gói):
//   main.cjs, preload.cjs (esbuild), web/ (bản build Vite), setup/ (màn hình kết nối), pc-hook.cjs, icon.png, package.json.
// Chạy sau `vite build`: npm run desktop:build
import { build } from 'esbuild'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'build', 'app')
const at = (...p) => path.join(root, ...p)

if (!existsSync(at('dist', 'index.html'))) throw new Error('Chưa có dist/: chạy "npm run build" trước')

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

const common = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], sourcemap: false, logLevel: 'warning' }
await build({ ...common, entryPoints: [at('desktop', 'main.ts')], outfile: path.join(out, 'main.cjs') })
await build({ ...common, entryPoints: [at('desktop', 'preload.ts')], outfile: path.join(out, 'preload.cjs') })

cpSync(at('dist'), path.join(out, 'web'), { recursive: true })
cpSync(at('desktop', 'setup'), path.join(out, 'setup'), { recursive: true })
cpSync(at('desktop', 'pc-hook.cjs'), path.join(out, 'pc-hook.cjs'))
cpSync(at('desktop', 'icon', 'icon.png'), path.join(out, 'icon.png'))
cpSync(at('desktop', 'icon', 'icon.png'), path.join(out, 'setup', 'icon.png'))
// Phông VT323 (giấy phép OFL, phát tán lại được) cho màn hình kết nối
const require = createRequire(import.meta.url)
const fonts = path.join(path.dirname(require.resolve('@fontsource/vt323/package.json')), 'files')
for (const sub of ['latin', 'latin-ext', 'vietnamese']) {
  cpSync(path.join(fonts, `vt323-${sub}-400-normal.woff2`), path.join(out, 'setup', `vt323-${sub}.woff2`))
}

const pkg = JSON.parse(readFileSync(at('package.json'), 'utf8'))
writeFileSync(
  path.join(out, 'package.json'),
  JSON.stringify(
    {
      name: 'coopverse',
      productName: 'Coopverse',
      version: pkg.version,
      description: 'Văn phòng pixel cho các agent Paperclip',
      author: 'Coopverse',
      license: pkg.license ?? 'MIT',
      main: 'main.cjs',
    },
    null,
    2,
  ),
)
console.log(`desktop: build/app sẵn sàng (Coopverse ${pkg.version})`)
