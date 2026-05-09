import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
  manifest_version: 3,
  name: 'TrackWise',
  version: pkg.version,
  description: 'Track job applications and learn from your search.',
  permissions: ['storage', 'activeTab'],
  host_permissions: [
    'https://www.linkedin.com/jobs/*',
    'https://www.indeed.com/viewjob*',
  ],
  action: {
    default_popup: 'src/popup/index.html',
  },
})
