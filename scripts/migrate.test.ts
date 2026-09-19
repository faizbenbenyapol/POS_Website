import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { splitSqlStatements, extractSchemaObjects } = require('./migrate.js') as {
  splitSqlStatements: (sql: string) => string[];
  extractSchemaObjects: (statements: string[]) => {
    tables: string[];
    columns: { table: string; name: string }[];
    indexes: { table: string; name: string }[];
  };
};

describe('splitSqlStatements', () => {
  it('แยกทีละคำสั่งและตัดคอมเมนต์ทิ้ง', () => {
    const sql = `-- หัวไฟล์; มีเครื่องหมาย ; ในคอมเมนต์
USE pos_qr;
/* คอมเมนต์หลายบรรทัด; */
ALTER TABLE a ADD COLUMN b INT; # คอมเมนต์ท้ายบรรทัด;
UPDATE t SET x = 1;`;
    expect(splitSqlStatements(sql)).toEqual(['USE pos_qr', 'ALTER TABLE a ADD COLUMN b INT', 'UPDATE t SET x = 1']);
  });

  it('ไม่ตัดที่ ; ในข้อความ รวมถึงเครื่องหมายคำพูดซ้อนและ backslash', () => {
    const sql = `INSERT INTO n VALUES ('a;b', 'it''s; ok', 'c\\';d', "x;y");SELECT \`we;ird\` FROM t`;
    expect(splitSqlStatements(sql)).toEqual([
      `INSERT INTO n VALUES ('a;b', 'it''s; ok', 'c\\';d', "x;y")`,
      'SELECT `we;ird` FROM t',
    ]);
  });

  it('ไม่มีคำสั่งว่างเมื่อไฟล์มีแต่คอมเมนต์หรือ ; ซ้ำ', () => {
    expect(splitSqlStatements('-- only comment\n;;\n')).toEqual([]);
  });
});

describe('extractSchemaObjects', () => {
  it('หาตาราง คอลัมน์ และ index ที่ migration สร้าง', () => {
    const objects = extractSchemaObjects([
      'CREATE TABLE IF NOT EXISTS menu_options (id INT)',
      'ALTER TABLE order_items ADD COLUMN IF NOT EXISTS options_text VARCHAR(255) NULL, ADD COLUMN unit_cost DECIMAL(10,2)',
      'CREATE INDEX idx_orders_created_at ON orders (created_at)',
      "UPDATE branches SET promptpay_id = '0812345678'",
    ]);
    expect(objects).toEqual({
      tables: ['menu_options'],
      columns: [
        { table: 'order_items', name: 'options_text' },
        { table: 'order_items', name: 'unit_cost' },
      ],
      indexes: [{ table: 'orders', name: 'idx_orders_created_at' }],
    });
  });
});
