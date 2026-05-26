import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

const ICONS = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
}

export default defineManifest({
  manifest_version: 3,
  name: 'TrackWise',
  version: pkg.version,
  description: 'Track job applications and learn from your search.',
  icons: ICONS,
  permissions: ['storage', 'identity'],
  host_permissions: [
    'https://www.linkedin.com/jobs/*',
    'https://*.indeed.com/viewjob*',
    'https://*.indeed.com/jobs*',
  ],
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: [
        'https://www.linkedin.com/jobs/*',
        'https://*.indeed.com/viewjob*',
        'https://*.indeed.com/jobs*',
      ],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: ICONS,
  },
})
