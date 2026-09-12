-- =============================================================
-- Migration 003: Cancellation Audit Logs for Fraud Prevention
-- =============================================================
-- Run: mysql -u root -p pos_qr < db/migrations/003_cancellation_audit_logs.sql
-- =============================================================

USE pos_qr;

-- ตารางบันทึกประวัติการยกเลิกรายการอาหารหรือออเดอร์
-- เพื่อป้องกันการทุจริตตัดเงินออกจากบิลหน้าร้าน
CREATE TABLE IF NOT EXISTS cancellation_audit_logs (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  entity_type  ENUM('ORDER_ITEM', 'ORDER', 'SESSION') NOT NULL,
  entity_id    INT NOT NULL,
  order_code   VARCHAR(12) NULL,
  table_no     VARCHAR(10) NOT NULL,
  item_name    VARCHAR(120) NULL,
  quantity     SMALLINT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  reason       VARCHAR(255) NOT NULL,
  cancelled_by INT NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_table (table_no),
  INDEX idx_audit_user (cancelled_by),
  FOREIGN KEY (cancelled_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
