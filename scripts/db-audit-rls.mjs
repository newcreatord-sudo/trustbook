import process from 'node:process'
import { resolve } from 'node:path'
import dotenv from 'dotenv'
import { Client } from 'pg'
import { pgSslFromEnv } from './lib/pg-ssl.mjs'

const envFileArg = process.argv.find((x) => x.startsWith('--env-file=')) ?? null
if (envFileArg) {
  const envFile = envFileArg.slice('--env-file='.length).trim()
  if (envFile) dotenv.config({ path: resolve(process.cwd(), envFile), override: true })
}

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const connectionString =
  (typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.trim() ? process.env.DATABASE_URL.trim() : null) ??
  (typeof process.env.SUPABASE_DB_URL === 'string' && process.env.SUPABASE_DB_URL.trim() ? process.env.SUPABASE_DB_URL.trim() : null)

if (!connectionString) {
  process.stderr.write('[db-audit-rls] Missing DATABASE_URL/SUPABASE_DB_URL.\n')
  process.exit(2)
}

const url = new URL(connectionString)
url.searchParams.delete('sslmode')
url.searchParams.delete('uselibpqcompat')

const client = new Client({
  connectionString: url.toString(),
  ssl: pgSslFromEnv('db-audit-rls'),
})

function readArg(name) {
  const raw = process.argv.find((x) => x.startsWith(`--${name}=`)) ?? null
  if (!raw) return null
  const v = raw.slice(`--${name}=`.length).trim()
  return v.length ? v : null
}

const schema = readArg('schema') ?? 'public'

async function q(sql, params) {
  const r = await client.query(sql, params)
  return r.rows ?? []
}

await client.connect()
try {
  const meta = (await q(
    `
      select
        current_database() as db,
        current_user as current_user,
        session_user as session_user,
        version() as version
    `,
    [],
  ))[0]

  const extensions = await q(
    `
      select extname, extversion
      from pg_extension
      order by extname asc
    `,
    [],
  )

  const privilegedRoles = await q(
    `
      select rolname, rolcanlogin, rolsuper, rolbypassrls
      from pg_roles
      where rolsuper = true
         or rolbypassrls = true
      order by rolsuper desc, rolbypassrls desc, rolname asc
    `,
    [],
  )

  const rlsTables = await q(
    `
      select n.nspname as schema,
             c.relname as table,
             c.relrowsecurity as rls_enabled,
             c.relforcerowsecurity as rls_forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r'
        and n.nspname = $1
        and c.relrowsecurity = true
      order by n.nspname asc, c.relname asc
    `,
    [schema],
  )

  const policies = await q(
    `
      select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      from pg_policies
      where schemaname = $1
      order by tablename asc, policyname asc
    `,
    [schema],
  )

  const duplicatePolicies = await q(
    `
      select
        schemaname,
        tablename,
        permissive,
        roles,
        cmd,
        coalesce(qual, '') as qual,
        coalesce(with_check, '') as with_check,
        count(*)::int as duplicates
      from pg_policies
      where schemaname = $1
      group by 1,2,3,4,5,6,7
      having count(*) > 1
      order by duplicates desc, tablename asc
    `,
    [schema],
  )

  const securityDefinerFunctions = await q(
    `
      select
        n.nspname as schema,
        p.proname as name,
        pg_get_function_identity_arguments(p.oid) as identity_args,
        pg_get_userbyid(p.proowner) as owner,
        p.prosecdef as security_definer,
        coalesce(array_to_string(p.proconfig, ','), '') as config
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = $1
        and p.prosecdef = true
      order by p.proname asc, identity_args asc
    `,
    [schema],
  )

  const tableGrants = await q(
    `
      select grantee, table_schema, table_name, privilege_type
      from information_schema.role_table_grants
      where table_schema = $1
        and grantee in ('anon','authenticated','PUBLIC')
      order by table_name asc, grantee asc, privilege_type asc
    `,
    [schema],
  )

  const out = {
    meta,
    schema,
    privileged_roles: privilegedRoles,
    extensions,
    rls_tables: rlsTables,
    policies,
    duplicate_policies: duplicatePolicies,
    security_definer_functions: securityDefinerFunctions,
    table_grants: tableGrants,
  }

  process.stdout.write(JSON.stringify(out, null, 2) + '\n')
} finally {
  await client.end().catch(() => {})
}
