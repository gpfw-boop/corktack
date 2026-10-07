// Captures the widget's main states from the demo into screenshots/.
// Usage: npm run screenshots   (set CHROME_PATH to use a specific Chrome or Chromium)
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import puppeteer from 'puppeteer-core'
import { createServer } from 'vite'

const root = resolve(import.meta.dirname, '..')
const out = join(root, 'screenshots')
mkdirSync(out, { recursive: true })

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ]
  const cache = join(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
      candidates.push(join(cache, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'))
      candidates.push(join(cache, dir, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'))
      candidates.push(join(cache, dir, 'chrome-linux/chrome'))
    }
  }
  const found = candidates.find((p) => existsSync(p))
  if (!found) throw new Error('No Chrome found. Set CHROME_PATH.')
  return found
}

const server = await createServer({ root: join(root, 'demo'), configFile: false, logLevel: 'error', server: { port: 5199, strictPort: true } })
await server.listen()
const base = 'http://localhost:5199'

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true })
const page = await browser.newPage()

const OWN_NAME = 'Alex Chen'

/** Seeds comments using the real anchoring code, so pins land where a click would put them. */
async function seed() {
  await page.goto(`${base}/?feedback=off`)
  await page.evaluate(async (OWN_NAME) => {
    const { createAnchor } = await import('/@fs' + window.__src + '/anchor.ts')
    const ago = (mins) => new Date(Date.now() - mins * 60_000).toISOString()
    const at = (selector, xPct, yPct) => {
      const el = document.querySelector(selector)
      const r = el.getBoundingClientRect()
      return createAnchor(el, r.left + r.width * xPct, r.top + r.height * yPct, 'data-feedback')
    }
    const top = (id, author, body, anchor, mins, extra = {}) => ({
      id, project: 'corktack-demo', parentId: null, route: '/', author, body, anchor,
      viewportWidth: 1280, createdAt: ago(mins), resolvedAt: null, ...extra,
    })
    const reply = (id, parentId, author, body, mins) => ({
      id, project: 'corktack-demo', parentId, route: '/', author, body, anchor: null,
      viewportWidth: null, createdAt: ago(mins), resolvedAt: null,
    })
    const comments = [
      top('c1', 'Priya Sharma', 'Can this show who is on today before I confirm?\nRight now I have to remember.', at('[data-feedback="confirm-roster"]', 0.8, 0.3), 180),
      reply('r1', 'c1', 'Sam Lee', 'Agree. Names inline under the heading would do it.', 150),
      reply('r2', 'c1', OWN_NAME, 'Good call, I’ll add avatars for each educator.', 4),
      top('c2', 'Sam Lee', 'The greeting feels large for a dashboard.', at('h1', 0.62, 0.55), 60 * 26),
      top('c3', 'Jordan Blake', 'Link straight to the newsletter replies from here?', at('main .card:nth-of-type(2) p', 0.55, 0.5), 60 * 50),
      top('c4', OWN_NAME, 'Should this show today’s date?', at('main .card h2', 0.18, 0.5), 6),
      top('c5', 'Riley Nguyen', 'This banner competes with the roster.', {
        selector: 'body > main > aside', strategy: 'path', tag: 'aside', xPct: 0.5, yPct: 0.5,
        text: 'Holiday hours banner', pageX: 0, pageY: 0,
      }, 60 * 30),
      top('c6', 'Priya Sharma', 'Tuesday looks short staffed.', at('main', 0.5, 0.5), 60 * 3, { route: '/roster' }),
      top('c7', 'Sam Lee', 'Button label should say what it confirms.', at('[data-feedback="confirm-roster"]', 0.3, 0.5), 60 * 72, { resolvedAt: ago(60) }),
    ]
    localStorage.setItem('corktack:comments:corktack-demo', JSON.stringify(comments))
    localStorage.setItem('corktack:reviewer', OWN_NAME)
  }, OWN_NAME)
}

const overlay = () => page.evaluateHandle(() => document.querySelector('corktack-overlay').shadowRoot)
const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms))
const shot = async (name) => {
  await settle(300)
  await page.screenshot({ path: join(out, `${name}.png`) })
  console.log(`  screenshots/${name}.png`)
}
const pinFor = async (author) =>
  (await overlay()).evaluateHandle((root, author) =>
    [...root.querySelectorAll('ct-pin')].find((p) => p.author === author && !p.draft).shadowRoot.querySelector('.pin'), author)
const centre = async (handle) => {
  const box = await handle.boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

await page.evaluateOnNewDocument((src) => (window.__src = src), join(root, 'src'))

// Desktop
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })
await seed()
await page.goto(`${base}/?feedback=1`)
await page.waitForSelector('corktack-overlay')
await shot('01-pins')

{
  const pin = await pinFor('Priya Sharma')
  const { x, y } = await centre(pin)
  await page.mouse.move(x, y)
  await shot('02-pin-hover')
  await page.mouse.click(x, y)
  await page.mouse.move(80, 700)
  await shot('03-thread')
}

{
  await page.keyboard.press('Escape')
  const pin = await pinFor(OWN_NAME)
  const { x, y } = await centre(pin)
  await page.mouse.click(x, y)
  await settle()
  const thread = await (await overlay()).evaluateHandle((root) => root.querySelector('ct-thread').shadowRoot)
  const more = await thread.evaluateHandle((r) => r.querySelector('button[aria-label="More options"]'))
  await more.click()
  await page.mouse.move(80, 700)
  await shot('04-menu')
  const del = await thread.evaluateHandle((r) => [...r.querySelectorAll('.menu button')].find((b) => b.textContent.includes('Delete')))
  await del.click()
  await shot('04-delete-confirm')
  await page.keyboard.press('Escape')
}

{
  await page.keyboard.press('c')
  const target = await page.$('main .card:nth-of-type(2) h2')
  const box = await target.boundingBox()
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.5)
  await settle()
  await page.keyboard.type('Could the unread count sit next to this heading?')
  await shot('05-composer')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
}

{
  const toolbar = await (await overlay()).evaluateHandle((root) => root.querySelector('ct-toolbar').shadowRoot.querySelector('button'))
  const { x, y } = await centre(toolbar)
  await page.mouse.move(x, y)
  await shot('06-toolbar-tooltip')
}

{
  const listButton = await (await overlay()).evaluateHandle((root) =>
    root.querySelector('ct-toolbar').shadowRoot.querySelectorAll('button')[2])
  await listButton.click()
  await page.mouse.move(80, 700)
  await shot('07-sidebar')
  const toggle = await (await overlay()).evaluateHandle((root) => root.querySelector('ct-sidebar').shadowRoot.querySelector('.toggle'))
  await toggle.click()
  await shot('07-sidebar-resolved')
  await toggle.click()
  const unplaced = await (await overlay()).evaluateHandle((root) =>
    [...root.querySelector('ct-sidebar').shadowRoot.querySelectorAll('h3')].find((h) => h.textContent.startsWith('Not visible')).nextElementSibling.nextElementSibling.querySelector('.item'))
  await unplaced.click()
  await shot('08-unplaced-centred')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
}

{
  await page.evaluate(() => localStorage.removeItem('corktack:reviewer'))
  await page.reload()
  await page.waitForSelector('corktack-overlay')
  await settle()
  await page.keyboard.press('c')
  const target = await page.$('main .card:nth-of-type(2) p')
  const box = await target.boundingBox()
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5)
  await shot('09-composer-first-time')
  await page.evaluate((name) => localStorage.setItem('corktack:reviewer', name), OWN_NAME)
}

// Mobile
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
await page.goto(`${base}/?feedback=1`)
await page.waitForSelector('corktack-overlay')
await shot('10-mobile-pins')
{
  const pin = await pinFor('Priya Sharma')
  await pin.tap()
  await shot('11-mobile-thread')
}

await browser.close()
await server.close()
