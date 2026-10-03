import type { PaperclipPluginManifestV1 } from '@paperclipai/plugin-sdk'

/** Mặc định Coopverse chạy cùng máy với trình duyệt. / Default: Coopverse on the same machine. */
export const DEFAULT_COOPVERSE_URL = 'http://127.0.0.1:5177'

const manifest: PaperclipPluginManifestV1 = {
  id: 'coopverse.launcher',
  apiVersion: 1,
  version: '1.0.0',
  displayName: 'Coopverse',
  description:
    'Nút mở văn phòng 3D Coopverse cho công ty đang xem (thanh bên + thanh trên cùng). / Opens the Coopverse 3D office for the current company (sidebar + top bar).',
  author: 'minhle2112',
  categories: ['ui'],
  capabilities: ['ui.sidebar.register', 'ui.action.register'],
  entrypoints: { worker: './dist/worker.js', ui: './dist/ui' },
  instanceConfigSchema: {
    type: 'object',
    properties: {
      coopverseUrl: {
        type: 'string',
        title: 'Coopverse URL',
        description: 'Địa chỉ Coopverse / Where Coopverse runs (mặc định / default http://127.0.0.1:5177)',
        default: DEFAULT_COOPVERSE_URL,
      },
    },
  },
  ui: {
    slots: [
      { type: 'sidebar', id: 'coopverse-sidebar', displayName: 'Coopverse', exportName: 'CoopverseSidebarLink' },
      { type: 'globalToolbarButton', id: 'coopverse-toolbar', displayName: 'Coopverse', exportName: 'CoopverseToolbarButton' },
    ],
  },
}

export default manifest
