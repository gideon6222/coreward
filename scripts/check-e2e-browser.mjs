// Fail the e2e step with ONE line that says what to do, instead of 39 identical
// stack traces that each repeat the same missing-browser error.
//
// Playwright's browsers are a machine-level dependency, like Godot or the JDK,
// and nothing in this repo installs them. On a machine that has never run them
// the gate is 39 failures deep before it says the word "install", and the real
// message is buried inside a box drawn in the middle of the first one.
//
// This is the studio's own rule about a failure being readable, applied to the
// one dependency the web stack has that the Godot stack does not.
import { chromium } from '@playwright/test'

try {
  const path = chromium.executablePath()
  const { existsSync } = await import('node:fs')
  if (!existsSync(path)) throw new Error('missing')
} catch {
  console.error('')
  console.error('  THE PLAYWRIGHT BROWSER IS NOT INSTALLED. No end-to-end test ran.')
  console.error('')
  console.error('  It is a machine-level download, not part of npm install, and it')
  console.error('  is not in the repo. One command, once per machine:')
  console.error('')
  console.error('    npx playwright install chromium')
  console.error('')
  console.error('  Then re-run `npm run check`. Everything before this step passed.')
  console.error('')
  process.exit(1)
}
