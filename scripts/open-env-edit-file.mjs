import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { copyFileSync, existsSync } from 'node:fs'

const kind = (process.argv[2] ?? 'staging').toLowerCase()
const file =
  kind === 'production'
    ? resolve(process.cwd(), 'env', 'EDIT_STRIPE_PRODUCTION.env')
    : resolve(process.cwd(), 'env', 'EDIT_STRIPE_STAGING.env')

if (!existsSync(file)) {
  const example = `${file}.example`
  if (!existsSync(example)) {
    process.stderr.write(`[open-env] File not found: ${file}\n`)
    process.stderr.write(`[open-env] Missing template: ${example}\n`)
    process.exit(1)
  }
  copyFileSync(example, file)
  process.stdout.write(`[open-env] Created local file from template: ${file}\n`)
}

process.stdout.write(`\n[open-env] Apri questo file nell’editor:\n${file}\n\n`)

const winPath = file.replace(/\//g, '\\')

/** @type {Array<[string, string[]]>} */
const attempts =
  process.platform === 'win32'
    ? [
        ['cursor', [winPath]],
        ['code', [winPath]],
        ['cmd.exe', ['/c', 'start', '', winPath]],
      ]
    : [
        ['cursor', [file]],
        ['code', [file]],
        ['xdg-open', [file]],
      ]

for (const [cmd, args] of attempts) {
  try {
    const child = spawn(cmd, args, {
      detached: true,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    })
    child.unref()
    process.stdout.write(`[open-env] Tentativo con: ${cmd}\n`)
    break
  } catch {
    // next
  }
}
