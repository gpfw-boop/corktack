// Prints the gzipped size of the core bundle (Supabase is external and not included).
// Follows each chunk's static imports, so shared chunks are counted where they actually load.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const dist = join(import.meta.dirname, '..', 'dist')
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`
const gz = (file) => gzipSync(readFileSync(join(dist, file)), { level: 9 }).length
const files = readdirSync(dist).filter((f) => f.endsWith('.js') || f.endsWith('.cjs'))
const sum = (list) => [...list].reduce((n, f) => n + gz(f), 0)

/** A chunk plus everything it imports statically (dynamic imports load later, on demand). */
function closure(file, seen = new Set()) {
  if (seen.has(file)) return seen
  seen.add(file)
  const code = readFileSync(join(dist, file), 'utf8')
  for (const [, dep] of code.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)) closure(dep, seen)
  return seen
}
const chunk = (prefix) => files.find((f) => f.startsWith(prefix) && f.endsWith('.js'))
const always = closure('corktack.js')
const extra = (prefix) => [...closure(chunk(prefix))].filter((f) => !always.has(f))

console.log('\nCorktack core bundle, gzipped (excludes @supabase/supabase-js):')
console.log(`  Loaded for every visitor   ${kb(sum(always))}  (including the hidden tab)`)
console.log(`  Added in review mode       ${kb(sum(extra('overlay-')))}  (comments UI and Lit)`)
console.log(`  Added in study mode        ${kb(sum(extra('study-')))}  (study bar and Lit)`)
console.log(`  UMD, all in one            ${kb(sum(files.filter((f) => f.endsWith('.cjs'))))}\n`)
