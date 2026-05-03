/**
 * Apply new floor plan migrations (0068, 0069) directly to the remote DB.
 * Uses DATABASE_URL from .env.local
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { Client } from 'pg'
import dotenv from 'dotenv'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

dotenv.config({ path: resolve(process.cwd(), '.env.local'), override: true })

const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? null

if (!connectionString) {
  process.stderr.write('[apply-floorplan-migrations] Missing DATABASE_URL/SUPABASE_DB_URL.\n')
  process.exit(2)
}

const migrations = [
  'supabase/migrations/0068_floor_plan_core_rpcs.sql',
  'supabase/migrations/0069_floor_plan_availability_and_ai.sql',
]

async function main() {
  const clientConfig = {
    connectionString,
    ssl: { rejectUnauthorized: false },
  }
  const client = new Client(clientConfig)

  try {
    await client.connect()
    console.log('[apply-floorplan-migrations] Connected to remote DB.')

    for (const migrationPath of migrations) {
      const sql = readFileSync(resolve(process.cwd(), migrationPath), 'utf-8')
      const migrationName = migrationPath.split('/').pop()

      console.log(`[apply-floorplan-migrations] Applying ${migrationName}...`)

      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('COMMIT')
        console.log(`[apply-floorplan-migrations] ✅ ${migrationName} applied successfully.`)
      } catch (err) {
        await client.query('ROLLBACK')
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('already exists') || msg.includes('duplicate')) {
          console.log(`[apply-floorplan-migrations] ⚠️  ${migrationName} skipped (already applied).`)
        } else {
          console.error(`[apply-floorplan-migrations] ❌ ${migrationName} FAILED: ${msg}`)
          throw err
        }
      }
    }

    console.log('[apply-floorplan-migrations] All floor plan migrations applied.')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('[apply-floorplan-migrations] Fatal error:', err)
  process.exit(1)
})
