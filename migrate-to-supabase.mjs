#!/usr/bin/env node
/**
 * Supabase PostgreSQL Migration Script
 * 
 * This script migrates the database schema to Supabase PostgreSQL.
 * Run this after setting up your Supabase project and updating DATABASE_URL.
 * 
 * Usage:
 *   node migrate-to-supabase.mjs
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './drizzle/schema.ts';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  console.error('Please set it in your .env file or environment');
  process.exit(1);
}

console.log('🚀 Starting Supabase PostgreSQL migration...\n');

async function migrate() {
  try {
    // Connect to Supabase
    console.log('📡 Connecting to Supabase...');
    const client = postgres(DATABASE_URL);
    const db = drizzle(client);
    
    console.log('✅ Connected successfully\n');

    // Test connection
    console.log('🧪 Testing database connection...');
    const result = await client`SELECT version()`;
    console.log(`✅ PostgreSQL version: ${result[0].version}\n`);

    console.log('📋 Migration complete! Next steps:');
    console.log('1. Run: pnpm db:push');
    console.log('2. Verify tables in Supabase dashboard');
    console.log('3. Start your application\n');

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check DATABASE_URL is correct');
    console.error('2. Verify Supabase project is active');
    console.error('3. Check network connectivity');
    console.error('4. Try adding ?sslmode=require to DATABASE_URL\n');
    process.exit(1);
  }
}

migrate();
