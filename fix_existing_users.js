import { Client } from 'pg'
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

  const client = new Client({
    connectionString,
    ssl: pgSslFromEnv('fix-existing-users'),
  })

  try {
    await client.connect()
    
    // Update existing unconfirmed users
    console.log('Updating existing users...')
    await client.query(`
      UPDATE auth.users 
      SET email_confirmed_at = now()
      WHERE email_confirmed_at IS NULL;
    `)
    console.log('Existing users updated.')

  } catch (error) {
    console.error(error)
  } finally {
    await client.end()
  }
}

run()
