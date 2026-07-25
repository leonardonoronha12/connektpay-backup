import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.cwd())
const migrationsDir = path.join(root, 'supabase', 'migrations')

const order = fs
  .readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.endsWith('.sql'))
  .map((d) => d.name)
  .sort((a, b) => a.localeCompare(b))

const parts = order.map((name) => {
  const filePath = path.join(migrationsDir, name)
  if (!fs.existsSync(filePath)) throw new Error(`Missing migration: ${name}`)
  return fs.readFileSync(filePath, 'utf8').trim() + '\n'
})

const outPath = path.join(root, 'supabase', 'setup.sql')
fs.writeFileSync(outPath, parts.join('\n'), 'utf8')
console.log(outPath)
