-- =============================================================
-- Migration 001: Concurrency Guard & Atomic Order Counter
-- =============================================================
-- Prereqs : MySQL 8.0.13+ (STORED generated column + unique index)
-- Run     : mysql -u root -p pos_qr < db/migrations/001_phase1_concurrency_and_counters.sql
-- Rollback: ดูท้ายไฟล์
-- =============================================================

USE pos_qr;

-- ---------------------------------------------------------
-- 1. Deduplicate: ถ้ามี OPEN session ซ้ำบนโต๊ะเดียวกัน ให้เก็บอันล่าสุด ปิดที่เหลือ
-- ---------------------------------------------------------
UPDATE table_sessions ts
  JOIN (
    SELECT table_id, MAX(id) AS keep_id
      FROM table_sessions
     WHERE status = 'OPEN'
     GROUP BY table_id
    HAVING COUNT(*) > 1
  ) dup ON ts.table_id = dup.table_id
       AND ts.id <> dup.keep_id
       AND ts.status = 'OPEN'
SET ts.status = 'CLOSED',
    ts.closed_at = NOW();

-- ---------------------------------------------------------
-- 2. เพิ่มคอลัมน์ opened_by บันทึกว่าใครเปิดโต๊ะ (จับคู่กับ closed_by ที่มีอยู่แล้ว)
-- ---------------------------------------------------------
ALTER TABLE table_sessions
  ADD COLUMN opened_by INT NULL AFTER status,
  ADD CONSTRAINT fk_sessions_opened_by FOREIGN KEY (opened_by) REFERENCES users(id);

-- ---------------------------------------------------------
-- 3. Generated stored column + unique index กัน race condition
-- open_table_id = table_id เมื่อ status='OPEN', NULL เมื่อปิดแล้ว
-- unique index อนุญาต NULL ซ้ำได้ แต่ค่าจริงซ้ำไม่ได้ -> 1 โต๊ะ เปิดได้ 1 session
-- ---------------------------------------------------------
ALTER TABLE table_sessions
  ADD COLUMN open_table_id INT GENERATED ALWAYS AS (
    IF(status = 'OPEN', table_id, NULL)
  ) STORED,
  ADD UNIQUE KEY uq_open_table (open_table_id);

-- ---------------------------------------------------------
-- 4. ตาราง order_counters สำหรับสร้างเลขลำดับออเดอร์แบบ atomic
-- ใช้ INSERT ... ON DUPLICATE KEY UPDATE เพื่อไม่ต้องล็อกทั้งตาราง
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_counters (
  business_date DATE     NOT NULL PRIMARY KEY,
  last_seq      INT      NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- Rollback (ถ้าต้องย้อนกลับ):
-- ALTER TABLE table_sessions DROP INDEX uq_open_table;
-- ALTER TABLE table_sessions DROP COLUMN open_table_id;
-- ALTER TABLE table_sessions DROP FOREIGN KEY fk_sessions_opened_by;
-- ALTER TABLE table_sessions DROP COLUMN opened_by;
-- DROP TABLE IF EXISTS order_counters;
-- =============================================================
