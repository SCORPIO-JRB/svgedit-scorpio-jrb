import base from './playwright.config.mjs'

// The end-to-end suite under Firefox. Run in its own informative CI workflow
// until the suite has been made to pass there (plan v2, lot V0).
//
// Two preferences give the tests what Chromium gives through permissions and
// by default: the asynchronous clipboard without a prompt (Firefox has no
// clipboard permission to grant), and touch events, which desktop Firefox
// only defines on a touch screen.
export default {
  ...base,
  use: {
    ...base.use,
    browserName: 'firefox',
    launchOptions: {
      firefoxUserPrefs: {
        'dom.events.asyncClipboard.readText': true,
        'dom.events.testing.asyncClipboard': true,
        'dom.w3c_touch_events.enabled': 1
      }
    }
  }
}
