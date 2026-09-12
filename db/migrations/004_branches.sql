-- =============================================================
-- Migration 004: Multi-Branch Architecture & Scoping
-- =============================================================
-- Run: node scripts/migrate.js หรือ mysql -u root -p pos_qr < db/migrations/004_branches.sql
-- =============================================================

USE pos_qr;

-- ---------------------------------------------------------
-- 1. สร้างตาราง branches (ข้อมูลสาขา)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  address VARCHAR(255) NULL,
  phone VARCHAR(30) NULL,
  business_day_cutoff_hour TINYINT NOT NULL DEFAULT 4,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- เพิ่มสาขาแรกเป็นค่าเริ่มต้น (สำนักงานใหญ่ / สาขาสยาม)
INSERT IGNORE INTO branches (id, code, name, address, phone, business_day_cutoff_hour, is_active)
VALUES (1, 'HQ-SIAM', 'สาขาสยาม (สำนักงานใหญ่)', 'สยามสแควร์ กรุงเทพมหานคร', '02-123-4567', 4, 1);

-- ---------------------------------------------------------
-- 2. เพิ่ม branch_id ใน users
-- NULL = HQ Admin (สลับดูได้ทุกสาขา), ระบุเลข = ล็อกเฉพาะสาขานั้น
-- ---------------------------------------------------------
ALTER TABLE users
  ADD COLUMN branch_id INT NULL AFTER role,
  ADD CONSTRAINT fk_users_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- กำหนดให้ STAFF เดิมผูกกับสาขา 1 (ADMIN ยังคงเป็น NULL เพื่อเป็น HQ Admin)
UPDATE users SET branch_id = 1 WHERE role = 'STAFF' AND branch_id IS NULL;

-- ---------------------------------------------------------
-- 3. ปรับปรุง dining_tables ให้รองรับเลขโต๊ะซ้ำกันได้ระหว่างสาขา
-- ---------------------------------------------------------
ALTER TABLE dining_tables
  ADD COLUMN branch_id INT NOT NULL DEFAULT 1 AFTER id,
  DROP INDEX table_no,
  ADD UNIQUE KEY uq_branch_table (branch_id, table_no),
  ADD CONSTRAINT fk_tables_branch FOREIGN KEY (branch_id) REFERENCES branches(id);

-- ---------------------------------------------------------
-- 4. ผูก branch_id ใน table_sessions
-- ---------------------------------------------------------
ALTER TABLE table_sessions
  ADD COLUMN branch_id INT NOT NULL DEFAULT 1 AFTER id,
  ADD CONSTRAINT fk_sessions_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  ADD INDEX idx_sessions_branch_status (branch_id, status);

-- ---------------------------------------------------------
-- 5. ผูก branch_id ใน orders
-- ---------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN branch_id INT NOT NULL DEFAULT 1 AFTER session_id,
  ADD CONSTRAINT fk_orders_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  ADD INDEX idx_orders_branch_status_created (branch_id, status, created_at);

-- ---------------------------------------------------------
-- 6. ปรับ order_counters ให้แยกนับเลขออเดอร์รายสาขา (Composite PK)
-- ---------------------------------------------------------
ALTER TABLE order_counters
  ADD COLUMN branch_id INT NOT NULL DEFAULT 1 FIRST,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (branch_id, business_date),
  ADD CONSTRAINT fk_order_counters_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;

-- ---------------------------------------------------------
-- 7. ผูก branch_id ใน payments
-- ---------------------------------------------------------
ALTER TABLE payments
  ADD COLUMN branch_id INT NOT NULL DEFAULT 1 AFTER session_id,
  ADD CONSTRAINT fk_payments_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  ADD INDEX idx_payments_branch_paid (branch_id, paid_at);

-- ---------------------------------------------------------
-- 8. ผูก branch_id ใน tickets
-- ---------------------------------------------------------
ALTER TABLE tickets
  ADD COLUMN branch_id INT NOT NULL DEFAULT 1 AFTER ticket_code,
  ADD CONSTRAINT fk_tickets_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  ADD INDEX idx_tickets_branch_status (branch_id, status);

-- ---------------------------------------------------------
-- 9. ผูก branch_id ใน cancellation_audit_logs
-- ---------------------------------------------------------
ALTER TABLE cancellation_audit_logs
  ADD COLUMN branch_id INT NOT NULL DEFAULT 1 AFTER entity_id,
  ADD CONSTRAINT fk_audit_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  ADD INDEX idx_audit_branch_created (branch_id, created_at);

-- ---------------------------------------------------------
-- 10. สร้างตาราง branch_menu_availability
-- สำหรับการตั้งราคาพิเศษและเปิด/ปิดของหมดแยกรายสาขา
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS branch_menu_availability (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  menu_item_id INT NOT NULL,
  custom_price DECIMAL(10,2) NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_branch_menu (branch_id, menu_item_id),
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
