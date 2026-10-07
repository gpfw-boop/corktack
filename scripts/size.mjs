// Prints the gzipped size of the core bundle (Supabase is external and not included).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const dist = join(import.meta.dirname, '..', 'dist')
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`
const gz = (file) => gzipSync(readFileSync(join(dist, file)), { level: 9 }).length
const files = readdirSync(dist).filter((f) => f.endsWith('.js') || f.endsWith('.cjs'))
const esm = files.filter((f) => f.endsWith('.js'))
const always = esm.filter((f) => !f.startsWith('overlay-'))
const lazy = esm.filter((f) => f.startsWith('overlay-'))
const sum = (list) => list.reduce((n, f) => n + gz(f), 0)

console.log('\nCorktack core bundle, gzipped (excludes @supabase/supabase-js):')
console.log(`  Loaded for every visitor   ${kb(sum(always))}`)
console.log(`  Loaded in feedback mode    ${kb(sum(lazy))}  (UI and Lit)`)
console.log(`  UMD, all in one            ${kb(sum(files.filter((f) => f.endsWith('.cjs'))))}\n`)
