const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

/**
 * สคริปต์รัน migration ของฐานข้อมูล (npm run db:migrate และตอนคอนเทนเนอร์ Docker เริ่มทำงาน)
 *
 * หลักการ:
 * - จำว่าไฟล์ไหนรันไปแล้วในตาราง schema_migrations ไฟล์ที่รันแล้วจะไม่ถูกรันซ้ำอีก
 *   (เดิมรันทุกไฟล์ทุกครั้งที่เริ่มคอนเทนเนอร์ คำสั่ง UPDATE ข้อมูลใน migration เก่าจึงถูกรันซ้ำไปเรื่อย ๆ)
 * - รันทีละคำสั่ง ไม่ส่งทั้งไฟล์ในคำสั่งเดียว
 *   (เดิมถ้าคำสั่งแรกของไฟล์เจอ error ว่ามีอยู่แล้ว คำสั่งที่เหลือทั้งไฟล์จะไม่ถูกรัน แต่สคริปต์ยังบอกว่าผ่าน)
 * - error ประเภท "มีอยู่แล้ว" (คอลัมน์/ตาราง/index ซ้ำ) ข้ามได้ error อื่นหยุดทันทีและออกด้วย exit code 1
 *   ไฟล์ที่พังจะไม่ถูกบันทึกว่ารันแล้ว แก้แล้วสั่งรันใหม่ได้เลย
 * - ฐานข้อมูลเดิมที่ยังไม่มี schema_migrations: ตรวจจากตารางและคอลัมน์ที่แต่ละไฟล์สร้าง
 *   ถ้ามีครบแล้วถือว่าไฟล์นั้นเคยรันแล้ว (บันทึกเป็น BASELINE) ไม่รันซ้ำ
 * - ฐานข้อมูลใหม่ที่สร้างจาก db/schema.sql มีรายชื่อ migration ที่รวมไว้ใน schema แล้วตั้งแต่แรก
 */

/** error ที่แปลว่าสิ่งที่คำสั่งจะสร้างมีอยู่แล้ว ข้ามคำสั่งนั้นได้อย่างปลอดภัย */
const TOLERATED_ERRNOS = new Set([
  1050, // ER_TABLE_EXISTS_ERROR
  1060, // ER_DUP_FIELDNAME
  1061, // ER_DUP_KEYNAME
  1062, // ER_DUP_ENTRY (ข้อมูลตั้งต้นที่ใส่ไปแล้ว)
  1068, // ER_MULTIPLE_PRI_KEY
  1091, // ER_CANT_DROP_FIELD_OR_KEY (สิ่งที่จะลบถูกลบไปแล้ว)
  1826, // ER_FK_DUP_NAME
]);

/**
 * อ่านไฟล์ .env และ .env.local ของโปรเจกต์ใส่ process.env ถ้ายังไม่ได้ตั้งค่านั้นไว้
 * ไม่ทับค่าที่ตั้งมาจากภายนอก (เช่นจาก docker-compose) และไม่ต้องพึ่งไลบรารี dotenv
 *
 * @param rootDir - โฟลเดอร์รากของโปรเจกต์
 */
function loadEnvFiles(rootDir) {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(rootDir, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

/**
 * แยกข้อความ SQL ทั้งไฟล์ออกเป็นคำสั่งทีละคำสั่ง
 * ตัดที่เครื่องหมาย ; ที่อยู่นอกข้อความในเครื่องหมายคำพูดและนอกคอมเมนต์เท่านั้น
 *
 * @param sql - เนื้อหาไฟล์ .sql
 * @returns คำสั่ง SQL ที่ตัดช่องว่างหัวท้ายแล้ว ไม่รวมคำสั่งว่างหรือที่มีแต่คอมเมนต์
 */
function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let quote = null;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (quote) {
      current += ch;
      if (ch === '\\' && quote !== '`') {
        current += next ?? '';
        i += 2;
        continue;
      }
      if (ch === quote) {
        // เครื่องหมายคำพูดซ้อนสองตัว ('') คือตัวอักษรในข้อความ ไม่ใช่การปิดข้อความ
        if (next === quote) {
          current += next;
          i += 2;
          continue;
        }
        quote = null;
      }
      i += 1;
      continue;
    }

    if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (ch === '#') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      current += ' ';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
      i += 1;
      continue;
    }
    if (ch === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

/**
 * หาตาราง คอลัมน์ และ index ที่ migration ไฟล์หนึ่งสร้าง ใช้ตรวจว่าฐานข้อมูลเดิมเคยรันไฟล์นี้แล้วหรือยัง
 *
 * @param statements - คำสั่งของไฟล์ที่แยกแล้ว
 * @returns รายการสิ่งที่ไฟล์นี้สร้าง แยกเป็นตาราง คอลัมน์ และ index
 */
function extractSchemaObjects(statements) {
  const tables = [];
  const columns = [];
  const indexes = [];
  for (const stmt of statements) {
    const created = stmt.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/i);
    if (created) {
      tables.push(created[1]);
      continue;
    }
    const index = stmt.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s+ON\s+`?(\w+)`?/i);
    if (index) {
      indexes.push({ table: index[2], name: index[1] });
      continue;
    }
    const altered = stmt.match(/^ALTER\s+TABLE\s+`?(\w+)`?/i);
    if (altered) {
      for (const m of stmt.matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/gi)) {
        columns.push({ table: altered[1], name: m[1] });
      }
    }
  }
  return { tables, columns, indexes };
}

/**
 * ตรวจว่าฐานข้อมูลมีทุกอย่างที่ migration ไฟล์นี้สร้างครบแล้วหรือยัง
 *
 * @param conn - connection ของฐานข้อมูล
 * @param objects - สิ่งที่ไฟล์สร้าง จาก extractSchemaObjects
 * @returns true เมื่อมีครบทุกอย่าง false เมื่อยังขาดหรือไฟล์ไม่ได้สร้างอะไรที่ตรวจได้เลย
 */
async function isAlreadyApplied(conn, objects) {
  const { tables, columns, indexes } = objects;
  if (tables.length + columns.length + indexes.length === 0) return false;

  for (const table of tables) {
    const [rows] = await conn.query(
      'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
      [table],
    );
    if (rows.length === 0) return false;
  }
  for (const column of columns) {
    const [rows] = await conn.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
      [column.table, column.name],
    );
    if (rows.length === 0) return false;
  }
  for (const index of indexes) {
    const [rows] = await conn.query(
      `SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
      [index.table, index.name],
    );
    if (rows.length === 0) return false;
  }
  return true;
}

/**
 * รัน migration ทุกไฟล์ที่ยังไม่เคยรัน ตามลำดับชื่อไฟล์
 *
 * @returns ไม่คืนค่า โยน error เมื่อมีคำสั่งที่ล้มเหลวจริง
 */
async function runMigrations() {
  const rootDir = path.join(__dirname, '..');
  loadEnvFiles(rootDir);

  const database = process.env.DB_NAME || 'pos_qr';
  const connectionConfig = process.env.DATABASE_URL
    ? { uri: process.env.DATABASE_URL, charset: 'utf8mb4' }
    : {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD ?? '',
        database,
        charset: 'utf8mb4',
      };

  console.log(`[Migration] Connecting to ${process.env.DATABASE_URL ? 'DATABASE_URL' : `${database}`}...`);
  const conn = await mysql.createConnection(connectionConfig);

  try {
    const [[{ tableCount }]] = await conn.query(
      "SELECT COUNT(*) AS tableCount FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> 'schema_migrations'",
    );
    await conn.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename   VARCHAR(255) NOT NULL PRIMARY KEY,
         mode       ENUM('RUN','BASELINE') NOT NULL DEFAULT 'RUN',
         applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    const [appliedRows] = await conn.query('SELECT filename FROM schema_migrations');
    const applied = new Set(appliedRows.map((r) => r.filename));
    // ฐานข้อมูลที่มีตารางอยู่แล้วแต่ไม่เคยจดว่ารันไฟล์ไหนไป = ฐานข้อมูลจากสคริปต์รุ่นก่อน
    const legacyDatabase = applied.size === 0 && Number(tableCount) > 0;

    const migrationsDir = path.join(rootDir, 'db', 'migrations');
    const files = fs.existsSync(migrationsDir)
      ? fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
      : [];

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;

      const statements = splitSqlStatements(fs.readFileSync(path.join(migrationsDir, file), 'utf8'))
        // ไฟล์ migration ระบุ USE pos_qr ไว้ แต่ต้องรันกับฐานข้อมูลที่ตั้งค่าไว้ ไม่ใช่ชื่อที่เขียนตายตัว
        .filter((stmt) => !/^USE\s+/i.test(stmt));

      if (legacyDatabase && (await isAlreadyApplied(conn, extractSchemaObjects(statements)))) {
        await conn.query("INSERT INTO schema_migrations (filename, mode) VALUES (?, 'BASELINE')", [file]);
        console.log(`[Migration] ${file} already present in this database (recorded, not re-run).`);
        continue;
      }

      console.log(`[Migration] Running ${file} (${statements.length} statements)...`);
      for (const [index, stmt] of statements.entries()) {
        try {
          await conn.query(stmt);
        } catch (err) {
          if (TOLERATED_ERRNOS.has(err.errno)) {
            console.log(`[Migration]   statement ${index + 1} skipped: ${err.message}`);
            continue;
          }
          err.message = `${file} statement ${index + 1} failed: ${err.message}\n${stmt.slice(0, 300)}`;
          throw err;
        }
      }
      await conn.query("INSERT INTO schema_migrations (filename, mode) VALUES (?, 'RUN')", [file]);
      console.log(`[Migration] Completed ${file}`);
      ran += 1;
    }

    console.log(ran === 0 ? '[Migration] Database is up to date.' : `[Migration] Applied ${ran} migration(s).`);
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  runMigrations().catch((err) => {
    console.error('[Migration] Failed:', err.message);
    process.exit(1);
  });
}

module.exports = { splitSqlStatements, extractSchemaObjects, loadEnvFiles };
