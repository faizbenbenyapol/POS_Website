-- =============================================================
-- Migration 007: Settlements — บันทึกผลปิดยอดประจำวัน (Z-Report) แบบถาวร
-- เดิมหน้า /admin/settlement คำนวณสดทุกครั้ง ตัวเลขย้อนหลังจึงเปลี่ยนได้
-- ตารางนี้แช่แข็งตัวเลข ณ เวลาที่กดปิดยอด และล็อกไม่ให้ปิดซ้ำ
-- Run: mysql -u root -p pos_qr < db/migrations/007_settlements.sql
-- =============================================================

USE pos_qr;

CREATE TABLE IF NOT EXISTS settlements (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  branch_id       INT           NOT NULL,
  business_date   DATE          NOT NULL,
  z_number        INT           NOT NULL,
  cutoff_hour     TINYINT       NOT NULL,
  period_start    DATETIME      NOT NULL,
  period_end      DATETIME      NOT NULL,
  total_revenue   DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_bills     INT           NOT NULL DEFAULT 0,
  cash_total      DECIMAL(12,2) NOT NULL DEFAULT 0,
  transfer_total  DECIMAL(12,2) NOT NULL DEFAULT 0,
  card_total      DECIMAL(12,2) NOT NULL DEFAULT 0,
  void_count      INT           NOT NULL DEFAULT 0,
  void_amount     DECIMAL(12,2) NOT NULL DEFAULT 0,
  counted_cash    DECIMAL(12,2) NULL,
  cash_difference DECIMAL(12,2) NULL,
  note            VARCHAR(255)  NULL,
  report_json     LONGTEXT      NOT NULL,
  closed_by       INT           NOT NULL,
  closed_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_settlement_branch_date (branch_id, business_date),
  UNIQUE KEY uq_settlement_branch_z (branch_id, z_number),
  INDEX idx_settlement_closed_by (closed_by),
  FOREIGN KEY (branch_id) REFERENCES branches(id),
  FOREIGN KEY (closed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
