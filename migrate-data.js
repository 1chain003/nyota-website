require('node:process').loadEnvFile('.env');
const { Client } = require('pg');
const fs = require('fs');

const users = JSON.parse(fs.readFileSync('./data/users.json', 'utf8'));
const applications = JSON.parse(fs.readFileSync('./data/applications.json', 'utf8'));
const messages = JSON.parse(fs.readFileSync('./data/messages.json', 'utf8'));

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await client.connect();

  for (const u of users) {
    await client.query(
      `INSERT INTO users
       (id,name,email,phone,password_hash,salt,email_verified,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [
        u.id,
        u.name || '',
        u.email,
        u.phone || '',
        u.passwordHash || '',
        u.salt || '',
        u.emailVerified !== false,
        u.createdAt || new Date().toISOString()
      ]
    );
  }

  for (const a of applications) {
    await client.query(
      `INSERT INTO applications
       (id,type,name,email,phone,country,job,experience,education,message,submitted_at,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
       ON CONFLICT (id) DO NOTHING`,
      [
        a.id,
        a.type || 'job',
        a.name || '',
        a.email || '',
        a.phone || '',
        a.country || '',
        a.job || '',
        a.experience || '',
        a.education || '',
        a.message || '',
        a.submittedAt || new Date().toISOString()
      ]
    );
  }

  for (const m of messages) {
    await client.query(
      `INSERT INTO messages
       (id,name,email,subject,message,created_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [
        m.id,
        m.name || '',
        m.email || '',
        m.subject || '',
        m.message || '',
        m.createdAt || new Date().toISOString()
      ]
    );
  }

  console.log('Migration completed successfully.');
  console.log('Users:', users.length);
  console.log('Applications:', applications.length);
  console.log('Messages:', messages.length);

  await client.end();
})().catch(async error => {
  console.error('Migration failed:', error.message);
  try { await client.end(); } catch {}
  process.exit(1);
});
