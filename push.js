import { Client } from 'pg'
import fs from 'node:fs'
import process from 'node:process'
import { pgSslFromEnv } from './scripts/lib/pg-ssl.mjs'

const connectionString =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.DB_CONNECTION_STRING ||
  ''

async function run() {
  if (!connectionString.trim()) {
    throw new Error('Missing DATABASE_URL (or SUPABASE_DB_URL / DB_CONNECTION_STRING)')
  }

  const client = new Client({ connectionString, ssl: pgSslFromEnv('push') })
  await client.connect()
  const sql5 = fs.readFileSync('supabase/migrations/0049_anti_no_show_engine_core.sql', 'utf8')
  
  console.log('Running 0049...')
  await client.query(sql5)
  
  await client.end()
  console.log('Done!')
}

run().catch(console.error);
