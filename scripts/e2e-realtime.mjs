// Two reviewers in two separate browsers, against the Supabase project in .env.local.
// Checks that pins, replies and deletes arrive live, and that one reviewer can't delete another's comment.
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
  const marker = `E2E ${Date.now()}`
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
  check('other reviewer has no delete button', !(await inOverlay(b, (root) => !!root.querySelector('ct-thread').shadowRoot.querySelector('[aria-label="Delete comment"]'))))
  await focusField(b)
  if (await inOverlay(b, (root) => !!root.querySelector('ct-thread').shadowRoot.querySelector('ct-composer').shadowRoot.querySelector('input'))) {
    await b.keyboard.type('Reviewer B')
    await b.keyboard.press('Enter')
  }
  await b.keyboard.type('Reply from B')
  await b.keyboard.press('Enter')

  const replyTime = await within(5000, async () => (await threadText(a)).includes('Reply from B'))
  check(`reply appears in the first browser's open thread${replyTime != null ? ` (${replyTime} ms)` : ''}`, replyTime != null && replyTime <= 3000)

  // B can't delete A's comment, even by calling the API directly
  const forged = await b.evaluate(async (env, marker, root) => {
    const { createClient } = await import(`/@fs${root}/node_modules/.vite/deps/@supabase_supabase-js.js`)
    const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { data: rows } = await db.from('comments').select('id').eq('body', marker)
    const { data } = await db.rpc('delete_comment', { comment_id: rows[0].id, token: localStorage.getItem('corktack:token') })
    const direct = await db.from('comments').delete().eq('id', rows[0].id).select('id')
    const hash = await db.from('comments').select('delete_token_hash').limit(1)
    return { rpc: data, directDeleted: direct.data?.length ?? 0, hashError: !!hash.error }
  }, env, marker, root)
  check('delete_comment refuses another reviewer', forged.rpc === false)
  check('direct delete is blocked', forged.directDeleted === 0)
  check('token hash is not readable', forged.hashError)

  // A deletes the thread
  await inOverlay(a, (root) => root.querySelector('ct-thread').shadowRoot.querySelector('[aria-label="Delete comment"]').click())
  await sleep(100)
  await inOverlay(a, (root) => root.querySelector('ct-thread').shadowRoot.querySelector('.danger').click())
  const goneTime = await within(5000, async () => (await pinCount(b)) === startB)
  check(`delete reaches the second browser${goneTime != null ? ` (${goneTime} ms)` : ''}`, goneTime != null)
} finally {
  await Promise.all([browserA.close(), browserB.close()])
  await server.close()
}
process.exit(failures ? 1 : 0)
