import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
  manifest_version: 3,
  name: 'TrackWise',
  version: pkg.version,
  description: 'Track job applications and learn from your search.',
  permissions: ['storage', 'activeTab', 'identity'],
  host_permissions: [
    'https://www.linkedin.com/jobs/*',
    'https://www.indeed.com/viewjob*',
  ],
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['https://www.linkedin.com/jobs/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  action: {
    default_popup: 'src/popup/index.html',
  },
})
