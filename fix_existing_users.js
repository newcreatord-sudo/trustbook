import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

const connectionString = 'postgresql://postgres.ftxbtrydlfwmyexfersa:lsCQNqNAfwYDClPC@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require';

async function run() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    // Update existing unconfirmed users
    console.log("Updating existing users...");
    await client.query(`
      UPDATE auth.users 
      SET email_confirmed_at = now()
      WHERE email_confirmed_at IS NULL;
    `);
    console.log("Existing users updated.");

  } catch (error) {
    console.error(error);
  } finally {
    await client.end();
  }
}

run();
