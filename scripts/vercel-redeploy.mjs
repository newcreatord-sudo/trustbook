import process from 'node:process'
import { resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import dotenv from 'dotenv'

function readArg(name) {
  const raw = process.argv.find((x) => x.startsWith(`--${name}=`)) ?? null
  if (!raw) return null
  const v = raw.slice(`--${name}=`.length).trim()
  return v.length ? v : null
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function parseFileIfExists(relPath) {
  const abs = resolve(process.cwd(), relPath)
  if (!existsSync(abs)) return null
  const raw = readFileSync(abs, 'utf8')
  return { raw, parsed: dotenv.parse(raw) }
}

const tokenArg = readArg('token') ?? null
const noToken = hasFlag('no-token')
const token =
  noToken
    ? ''
    : (tokenArg ?? '').trim() ||
      String(parseFileIfExists('.env.local')?.parsed?.VERCEL_TOKEN ?? '').trim() ||
      String(parseFileIfExists('.env')?.parsed?.VERCEL_TOKEN ?? '').trim() ||
      ''

function runVercel(args) {
  const baseArgs = ['-y', 'vercel@53.1.0', ...args, '--yes', ...(token ? ['--token', token] : [])]
  const cmd =
    process.platform === 'win32'
      ? { file: 'cmd', args: ['/c', 'npx', ...baseArgs] }
      : { file: 'npx', args: baseArgs }

  const res = spawnSync(cmd.file, cmd.args, { encoding: 'utf8' })
  if (res.status !== 0) {
    process.stderr.write('[vercel-redeploy] Failed\n')
    if (res.stdout) process.stderr.write(res.stdout)
    if (res.stderr) process.stderr.write(res.stderr)
    process.exit(res.status ?? 1)
  }
}

const mode = readArg('mode') ?? 'both' // preview|production|both

if (mode === 'preview' || mode === 'both') {
  runVercel(['deploy'])
}
if (mode === 'production' || mode === 'both') {
  runVercel(['deploy', '--prod'])
}

process.stdout.write('[vercel-redeploy] OK\n')
