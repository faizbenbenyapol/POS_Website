-- =============================================================
-- Migration 006: Order Status Logs — บันทึกว่าใครเปลี่ยนสถานะออเดอร์
-- ใช้คู่กับ payments.received_by (ใครปิดบิล) ในหน้าบันทึกการทำงาน
-- Run: mysql -u root -p pos_qr < db/migrations/006_order_status_logs.sql
-- =============================================================

USE pos_qr;

CREATE TABLE IF NOT EXISTS order_status_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  branch_id   INT NOT NULL DEFAULT 1,
  order_id    INT NOT NULL,
  order_code  VARCHAR(12) NOT NULL,
  table_no    VARCHAR(10) NOT NULL,
  from_status ENUM('PENDING','PREPARING','SERVED','CANCELLED') NULL,
  to_status   ENUM('PENDING','PREPARING','SERVED','CANCELLED') NOT NULL,
  changed_by  INT NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_logs_branch_created (branch_id, created_at),
  INDEX idx_order_logs_user (changed_by),
  FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
