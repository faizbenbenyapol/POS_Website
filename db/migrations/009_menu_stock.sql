-- =============================================================
-- Migration 009: Menu Stock — จำนวนคงเหลือของเมนูรายสาขา
-- เดิม is_available เป็นสวิตช์มือล้วน ๆ ครัวของหมดแล้วถ้าไม่มีใครวิ่งไปกดปิด
-- ลูกค้าโต๊ะใหม่ยังสั่งได้เรื่อย ๆ แล้วจบที่การยกเลิก (เหตุผล "ครัวของหมด / วัตถุดิบหมด")
-- Migration นี้เพิ่มการนับจำนวนจานคงเหลือ ตัดสต๊อกตอนสั่ง และปิดขายอัตโนมัติเมื่อหมด
--
-- เก็บที่ branch_menu_availability เพราะของในครัวเป็นของแต่ละสาขา ไม่ใช่ของแบรนด์
-- stock_qty = NULL คือไม่จำกัดจำนวน (ค่าเริ่มต้น ทำงานเหมือนเดิมทุกประการ)
-- Run: node scripts/migrate.js
-- =============================================================

USE pos_qr;

ALTER TABLE branch_menu_availability
  ADD COLUMN IF NOT EXISTS stock_qty INT NULL AFTER is_available;

-- ประวัติการตัดและเติมสต๊อก ใช้ตรวจย้อนหลังว่าของหายไปกับออเดอร์ไหน
-- หรือใครเป็นคนตั้งจำนวนคงเหลือใหม่
CREATE TABLE IF NOT EXISTS menu_stock_logs (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  branch_id     INT NOT NULL,
  menu_item_id  INT NOT NULL,
  change_type   ENUM('SET','DEDUCT','RESTOCK','RESTORE') NOT NULL,
  quantity      INT NOT NULL,
  stock_before  INT NULL,
  stock_after   INT NULL,
  order_id      INT NULL,
  changed_by    INT NULL,
  note          VARCHAR(255) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_stock_logs_branch_created (branch_id, created_at),
  INDEX idx_stock_logs_menu (menu_item_id),
  FOREIGN KEY (branch_id)    REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by)   REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
