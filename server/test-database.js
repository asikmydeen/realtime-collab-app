/**
 * Quick Database Connection Test
 * 
 * This script tests the PostgreSQL connection and verifies tables exist.
 * Run this to diagnose database issues.
 * 
 * Usage: node test-database.js
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

console.log('🔍 Testing Database Connection...\n');

if (!databaseUrl) {
  console.error('❌ ERROR: DATABASE_URL is not set!');
  console.log('\nMake sure you have DATABASE_URL in your .env file or Railway environment variables.');
  process.exit(1);
}

console.log('📡 Database URL:', databaseUrl.replace(/:[^:@]+@/, ':****@'));

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

async function testConnection() {
  let client;
  
  try {
    // Test 1: Basic connection
    console.log('\n1️⃣ Testing basic connection...');
    client = await pool.connect();
    console.log('   ✅ Connected successfully!');

    // Test 2: Query current time
    console.log('\n2️⃣ Testing query execution...');
    const timeResult = await client.query('SELECT NOW() as current_time');
    console.log('   ✅ Query successful!');
    console.log('   Server time:', timeResult.rows[0].current_time);

    // Test 3: Check if Better Auth tables exist
    console.log('\n3️⃣ Checking Better Auth tables...');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('user', 'session', 'account', 'verification')
      ORDER BY table_name;
    `);

    if (tablesResult.rows.length === 0) {
      console.log('   ⚠️  No Better Auth tables found!');
      console.log('   Run: node setup-database.js');
    } else {
      console.log('   ✅ Found tables:');
      tablesResult.rows.forEach(row => {
        console.log(`      - ${row.table_name}`);
      });
    }

    // Test 4: Check user count
    if (tablesResult.rows.some(r => r.table_name === 'user')) {
      console.log('\n4️⃣ Checking user data...');
      const userResult = await client.query('SELECT COUNT(*) as count FROM "user"');
      const userCount = parseInt(userResult.rows[0].count);
      console.log(`   ✅ Found ${userCount} user(s) in database`);
      
      if (userCount > 0) {
        const usersResult = await client.query('SELECT id, email, name, "createdAt" FROM "user" ORDER BY "createdAt" DESC LIMIT 5');
        console.log('   Recent users:');
        usersResult.rows.forEach(user => {
          console.log(`      - ${user.email} (${user.name || 'No name'}) - Created: ${user.createdAt}`);
        });
      }
    }

    // Test 5: Check session count
    if (tablesResult.rows.some(r => r.table_name === 'session')) {
      console.log('\n5️⃣ Checking active sessions...');
      const sessionResult = await client.query('SELECT COUNT(*) as count FROM "session" WHERE "expiresAt" > NOW()');
      const sessionCount = parseInt(sessionResult.rows[0].count);
      console.log(`   ✅ Found ${sessionCount} active session(s)`);
    }

    console.log('\n✨ All tests passed!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Database connection: Working');
    console.log('   ✅ Query execution: Working');
    console.log('   ✅ Tables: ' + (tablesResult.rows.length === 4 ? 'All present' : 'Missing some'));
    console.log('\n🎉 Database is ready for Better Auth!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nFull error:', error);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Check that DATABASE_URL is correct');
    console.log('   2. Verify your database password');
    console.log('   3. Make sure Supabase project is active');
    console.log('   4. Run: node setup-database.js (if tables are missing)');
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

testConnection();

