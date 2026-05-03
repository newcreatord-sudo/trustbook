import { Client } from 'pg';
import fs from 'fs';

const connectionString = 'postgresql://postgres.ftxbtrydlfwmyexfersa:lsCQNqNAfwYDClPC@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require';

async function run() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const sql1 = fs.readFileSync('supabase/migrations/0044_saas_platform_upgrades.sql', 'utf8');
  const sql2 = fs.readFileSync('supabase/migrations/0045_auto_confirm_users.sql', 'utf8');
  const sql5 = fs.readFileSync('supabase/migrations/0049_anti_no_show_engine_core.sql', 'utf8');
  
  console.log('Running 0049...');
  await client.query(sql5);
  
  await client.end();
  console.log('Done!');
}

run().catch(console.error);