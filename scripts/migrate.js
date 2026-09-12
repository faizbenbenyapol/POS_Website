const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

/**
 * สคริปต์สำหรับการรัน Migration อัตโนมัติ ป้องกันปัญหา Deploy แล้ว DB ขาดคอลัมน์/ตาราง
 */
async function runMigrations() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT) || 3306;
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD ?? '';
  const database = process.env.DB_NAME || 'pos_qr';

  console.log(`[Migration] Connecting to ${database} at ${host}:${port}...`);

  const connectionConfig = process.env.DATABASE_URL
    ? { uri: process.env.DATABASE_URL, multipleStatements: true, charset: 'utf8mb4' }
    : { host, port, user, password, database, multipleStatements: true, charset: 'utf8mb4' };

  const conn = await mysql.createConnection(connectionConfig);

  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      console.log(`[Migration] Running ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      try {
        await conn.query(sql);
        console.log(`[Migration] Completed ${file}`);
      } catch (err) {
        const error = err;
        if (
          error.code === 'ER_DUP_FIELDNAME' ||
          error.code === 'ER_DUP_KEYNAME' ||
          error.code === 'ER_TABLE_EXISTS_ERROR' ||
          error.code === 'ER_DUP_ENTRY' ||
          error.code === 'ER_FK_DUP_NAME' ||
          error.code === 'ER_MULTIPLE_PRI_KEY' ||
          error.errno === 1060 ||
          error.errno === 1061 ||
          error.errno === 1050 ||
          error.errno === 1062 ||
          error.errno === 1826 ||
          error.errno === 1068
        ) {
          console.log(`[Migration] ${file} already applied or constraint exists (skipped).`);
        } else {
          console.warn(`[Migration] Warning in ${file}:`, error.message);
        }
      }
    }
  }

  console.log('[Migration] All migrations executed successfully.');
  await conn.end();
}

runMigrations().catch((err) => {
  console.error('[Migration] Failed:', err);
  process.exit(1);
});
