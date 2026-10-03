# Coopverse launcher (Paperclip plugin)

Thêm nút mở [Coopverse](../README.md) vào Paperclip / Adds a Coopverse button to Paperclip:

- mục **Coopverse ↗** ở thanh bên trái / a **Coopverse ↗** sidebar item
- nút **Coopverse** ở thanh trên cùng mọi trang / a **Coopverse** top-bar button on every page

Bấm vào là mở `<Coopverse URL>/?company=<công ty đang xem>`. / Opens Coopverse for the company you are viewing.

## Cài / Install

`dist/` đã build sẵn. / `dist/` is prebuilt.

```bash
paperclipai plugin install --local /path/to/coopverse/paperclip-plugin
```

Đổi địa chỉ Coopverse (mặc định `http://127.0.0.1:5177`) / Change the Coopverse URL: **Settings → Plugins → Coopverse → Configure**.

Gỡ / Uninstall: `paperclipai plugin uninstall coopverse.launcher`

## Sửa và build / Develop

```bash
npm install
npm run build      # esbuild → dist/manifest.js, dist/worker.js, dist/ui/index.js
npm run typecheck
```

- `src/manifest.ts`: id `coopverse.launcher`, slot `sidebar` + `globalToolbarButton`, cấu hình `coopverseUrl`.
- `src/worker.ts`: trả địa chỉ Coopverse đã cấu hình cho UI (`settings`).
- `src/ui/index.tsx`: hai nút. React và SDK UI do Paperclip cung cấp lúc chạy.

Đã thử với Paperclip 2026.916.1 / Tested with Paperclip 2026.916.1.
