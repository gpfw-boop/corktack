// Two reviewers in two separate browsers, against the Supabase project in .env.local.
// Checks that pins, replies, resolving and deletes arrive live, and that comments can't be edited directly.
// Usage: npm run e2e   (cleans up after itself)
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import puppeteer from 'puppeteer-core'
import { createServer, loadEnv } from 'vite'

const root = resolve(import.meta.dirname, '..')
const env = loadEnv('development', root, 'VITE_')
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local first.')
  process.exit(1)
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const cache = join(homedir(), 'Library/Caches/ms-playwright')
  const candidates = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
      candidates.push(join(cache, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'))
    }
  }
  return candidates.find((p) => existsSync(p))
}

const server = await createServer({ configFile: join(root, 'demo/vite.config.ts'), logLevel: 'error', server: { port: 5197, strictPort: true } })
await server.listen()
const url = 'http://localhost:5197/?feedback=1'

// Separate browsers, so each reviewer has their own storage and delete token, and neither tab is in the background.
const [browserA, browserB] = await Promise.all([0, 1].map(() => puppeteer.launch({ executablePath: findChrome(), headless: true })))
const a = await browserA.newPage()
const b = await browserB.newPage()
for (const p of [a, b]) {
  await p.setViewport({ width: 1280, height: 800 })
  p.on('pageerror', (e) => console.log('  page error:', e.message))
  p.on('console', (m) => ['warn', 'error'].includes(m.type()) && console.log(`  page ${m.type()}:`, m.text()))
}

let failures = 0
let marker = null
const check = (label, ok) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** Polls until fn returns truthy, for up to `ms`. Returns how long it took, or null. */
async function within(ms, fn) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (await fn()) return Date.now() - start
    await sleep(100)
  }
  return null
}
const inOverlay = (page, fn, ...args) =>
  page.evaluate((src, ...args) => new Function('root', '...args', `return (${src})(root, ...args)`)(document.querySelector('corktack-overlay').shadowRoot, ...args), fn.toString(), ...args)
const pinCount = (page) => inOverlay(page, (root) => root.querySelectorAll('ct-pin').length)
const threadText = (page) => inOverlay(page, (root) => root.querySelector('ct-thread')?.shadowRoot.textContent ?? '')
const openPin = (page) => inOverlay(page, (root) => root.querySelector('ct-pin').shadowRoot.querySelector('button').click())
const focusField = (page) =>
  inOverlay(page, (root) => {
    const c = root.querySelector('ct-thread, ct-composer')
    const composer = c.tagName === 'CT-THREAD' ? c.shadowRoot.querySelector('ct-composer') : c
    ;(composer.shadowRoot.querySelector('input') ?? composer.shadowRoot.querySelector('textarea')).focus()
  })
const pinPosition = (page, marker) =>
  inOverlay(page, (root, marker) => {
    const s = [...root.querySelectorAll('ct-pin')].find((p) => p.body === marker)?.style
    return s ? `${s.left},${s.top}` : null
  }, marker)

try {
  await Promise.all([a.goto(url), b.goto(url)])
  await Promise.all([a.waitForSelector('corktack-overlay'), b.waitForSelector('corktack-overlay')])
  await sleep(1500)
  const startA = await pinCount(a)
  const startB = await pinCount(b)

  // A drops a pin
  marker = `E2E ${Date.now()}`
  await a.keyboard.press('c')
  const target = await a.$('[data-feedback="confirm-roster"]')
  const box = await target.boundingBox()
  await a.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.25)
  await focusField(a)
  await a.keyboard.type('Reviewer A')
  await a.keyboard.press('Enter')
  await a.keyboard.type(marker)
  await a.keyboard.press('Enter')
  await a.keyboard.press('Escape')

  const pinTime = await within(5000, async () => (await pinCount(b)) === startB + 1)
  check(`pin appears in the second browser${pinTime != null ? ` (${pinTime} ms)` : ''}`, pinTime != null && pinTime <= 3000)
  const [posA, posB] = [await pinPosition(a, marker), await pinPosition(b, marker)]
  check('at the same spot', posA != null && posA === posB)

  // Both open the thread; B replies
  const openNewest = (page) =>
    inOverlay(page, (root, marker) => {
      const pin = [...root.querySelectorAll('ct-pin')].find((p) => p.body === marker)
      pin.shadowRoot.querySelector('button').click()
    }, marker)
  await openNewest(a)
  await openNewest(b)
  await sleep(300)
  await focusField(b)
  if (await inOverlay(b, (root) => !!root.querySelector('ct-thread').shadowRoot.querySelector('ct-composer').shadowRoot.querySelector('input'))) {
    await b.keyboard.type('Reviewer B')
    await b.keyboard.press('Enter')
  }
  await b.keyboard.type('Reply from B')
  await b.keyboard.press('Enter')

  const replyTime = await within(5000, async () => (await threadText(a)).includes('Reply from B'))
  check(`reply appears in the first browser's open thread${replyTime != null ? ` (${replyTime} ms)` : ''}`, replyTime != null && replyTime <= 3000)

  // A resolves: the pin hides for B. A reopens it from the list: it comes back.
  const shown = (page) => inOverlay(page, (root, marker) => [...root.querySelectorAll('ct-pin')].some((p) => p.body === marker), marker)
  await inOverlay(a, (root) => root.querySelector('ct-thread').shadowRoot.querySelector('[aria-label="Resolve"]').click())
  const resolveTime = await within(5000, async () => !(await shown(b)))
  check(`resolve reaches the second browser${resolveTime != null ? ` (${resolveTime} ms)` : ''}`, resolveTime != null)
  await inOverlay(a, (root) => root.querySelector('ct-toolbar').shadowRoot.querySelectorAll('button')[2].click())
  await sleep(200)
  await inOverlay(a, (root) => root.querySelector('ct-sidebar').shadowRoot.querySelector('.toggle').click())
  await sleep(200)
  await inOverlay(a, (root, marker) =>
    [...root.querySelector('ct-sidebar').shadowRoot.querySelectorAll('.item')].find((i) => i.textContent.includes(marker)).click(), marker)
  await sleep(300)
  await inOverlay(a, (root) => root.querySelector('ct-thread').shadowRoot.querySelector('[aria-label="Reopen"]').click())
  const reopenTime = await within(5000, () => shown(b))
  check(`reopen reaches the second browser${reopenTime != null ? ` (${reopenTime} ms)` : ''}`, reopenTime != null)

  // B deletes A's comment from the menu: anyone can tidy up.
  await openNewest(b)
  await sleep(300)
  await inOverlay(b, (root) => root.querySelector('ct-thread').shadowRoot.querySelector('[aria-label="More options"]').click())
  await sleep(100)
  await inOverlay(b, (root) =>
    [...root.querySelector('ct-thread').shadowRoot.querySelectorAll('.menu button')].find((m) => m.textContent.includes('Delete')).click())
  await sleep(100)
  await inOverlay(b, (root) => root.querySelector('ct-thread').shadowRoot.querySelector('.danger').click())
  const goneTime = await within(5000, async () => !(await shown(a)))
  check(`another reviewer's delete reaches the first browser${goneTime != null ? ` (${goneTime} ms)` : ''}`, goneTime != null)

  // Nothing can be changed except through the functions.
  const direct = await b.evaluate(async (env, root) => {
    const { createClient } = await import(`/@fs${root}/node_modules/.vite/deps/@supabase_supabase-js.js`)
    const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { data: rows } = await db.from('comments').select('id').limit(1)
    if (!rows?.length) return { skipped: true }
    const edit = await db.from('comments').update({ body: 'Edited' }).eq('id', rows[0].id).select('id')
    return { edited: edit.data?.length ?? 0 }
  }, env, root)
  check('comments cannot be edited directly', direct.skipped || direct.edited === 0)
} finally {
  // If a check failed partway, remove the test thread so it doesn't linger.
  if (marker) {
    await b.evaluate(async (env, root, marker) => {
      const { createClient } = await import(`/@fs${root}/node_modules/.vite/deps/@supabase_supabase-js.js`)
      const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
      const { data: rows } = await db.from('comments').select('id').eq('body', marker)
      for (const row of rows ?? []) await db.rpc('delete_comment', { comment_id: row.id })
    }, env, root, marker).catch(() => {})
  }
  await Promise.all([browserA.close(), browserB.close()])
  await server.close()
}
process.exit(failures ? 1 : 0)
