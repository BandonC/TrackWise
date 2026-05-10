import { start } from './detector'

try {
  start()
} catch (e) {
  console.error('TrackWise: content script failed to start', e)
}
