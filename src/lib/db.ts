import mysql from 'mysql2/promise';
import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

/**
 * เก็บ pool ไว้บน globalThis เพราะตอน `next dev` ไฟล์นี้จะถูกโหลดใหม่ทุกครั้งที่แก้โค้ด
 * ถ้าไม่เก็บไว้ จะสร้าง connection pool ใหม่ซ้ำ ๆ จน MySQL ปฏิเสธการเชื่อมต่อ
 */
const globalForDb = globalThis as unknown as { posPool?: Pool };

/** จำนวน connection สูงสุดที่เปิดค้างไว้พร้อมกัน — ร้านเดียวจอไม่กี่เครื่อง 10 พอ */
const CONNECTION_LIMIT = 10;

/**
 * คืน connection pool ของ MySQL โดยสร้างครั้งเดียวแล้วใช้ซ้ำตลอดอายุโปรเซส
 * แยกเป็นฟังก์ชันแทนการสร้างตอน import เพื่อให้ error เรื่อง DATABASE_URL
 * เด้งตอนมีคนเรียกใช้จริง ไม่ใช่ตอน build
 *
 * @returns pool ที่พร้อมรับคำสั่ง query
 * @throws โยน error เมื่อไม่ได้ตั้งค่า DATABASE_URL ใน .env.local
 */
export function getPool(): Pool {
  if (!globalForDb.posPool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('ยังไม่ได้ตั้งค่า DATABASE_URL ใน .env.local');
    }
    globalForDb.posPool = mysql.createPool({
      uri: url,
      waitForConnections: true,
      connectionLimit: CONNECTION_LIMIT,
      charset: 'utf8mb4_unicode_ci',
      timezone: 'local',
      // ให้ DECIMAL คืนเป็น string เพื่อไม่ให้ทศนิยมเงินเพี้ยนจาก floating point
      decimalNumbers: false,
    });
  }
  return globalForDb.posPool;
}

/**
 * ยิงคำสั่ง SELECT แล้วคืนผลเป็นอาร์เรย์ของแถว
 * ใช้ prepared statement เสมอ (ส่งค่าผ่าน params ห้ามต่อสตริง SQL เอง)
 *
 * @param sql - คำสั่ง SQL ที่ใช้ ? เป็นตัวแทนค่า
 * @param params - ค่าที่จะแทนที่ ? ตามลำดับ
 * @returns อาร์เรย์แถวผลลัพธ์ ถ้าไม่เจอคืนอาร์เรย์ว่าง
 */
export async function query<T extends RowDataPacket>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await getPool().execute<T[]>(sql, params);
  return rows;
}

/**
 * ยิงคำสั่ง SELECT ที่คาดว่าได้ผลไม่เกิน 1 แถว เช่นค้นด้วย primary key
 *
 * @param sql - คำสั่ง SQL ที่ใช้ ? เป็นตัวแทนค่า
 * @param params - ค่าที่จะแทนที่ ? ตามลำดับ
 * @returns แถวแรกที่เจอ หรือ null เมื่อไม่มีข้อมูล
 */
export async function queryOne<T extends RowDataPacket>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * ยิงคำสั่งที่เปลี่ยนแปลงข้อมูล (INSERT / UPDATE / DELETE)
 *
 * @param sql - คำสั่ง SQL ที่ใช้ ? เป็นตัวแทนค่า
 * @param params - ค่าที่จะแทนที่ ? ตามลำดับ
 * @returns ผลลัพธ์ที่มี insertId และ affectedRows ให้ตรวจต่อได้
 */
export async function execute(
  sql: string,
  params: unknown[] = [],
): Promise<ResultSetHeader> {
  const [result] = await getPool().execute<ResultSetHeader>(sql, params);
  return result;
}

/**
 * รันงานหลายคำสั่งใน transaction เดียว เช่นตอนสร้างออเดอร์ที่ต้องเขียน
 * ทั้ง orders และ order_items ให้สำเร็จพร้อมกัน ถ้าพังกลางทางต้องย้อนกลับทั้งชุด
 *
 * @param work - ฟังก์ชันที่รับ connection ไปใช้ยิง query ภายใน transaction
 * @returns ค่าที่ work คืนกลับมา
 * @throws โยน error เดิมออกไปหลังจาก rollback แล้ว เพื่อให้ชั้นบนจัดการต่อ
 */
export async function withTransaction<T>(
  work: (conn: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
