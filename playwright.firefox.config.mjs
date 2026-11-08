import base from './playwright.config.mjs'

// The end-to-end suite under Firefox. Run in its own informative CI workflow
// until the suite has been made to pass there (plan v2, lot V0).
export default {
  ...base,
  use: { ...base.use, browserName: 'firefox' }
}
