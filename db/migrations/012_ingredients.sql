-- =============================================================
-- Migration 012: Ingredients & Recipe Cost — สต๊อกวัตถุดิบและต้นทุนต่อจาน
-- เดิมระบบนับได้แค่ "จำนวนจานคงเหลือ" (migration 009) ไม่รู้ว่าหมูสับเหลือกี่กิโล
-- และไม่รู้ว่าแต่ละจานมีต้นทุนเท่าไร จึงตอบไม่ได้ว่าเมนูไหนกำไรจริง
--
-- ingredients              รายชื่อวัตถุดิบของแบรนด์ พร้อมหน่วยนับและต้นทุนต่อหน่วยล่าสุด
-- branch_ingredient_stock  จำนวนคงเหลือของแต่ละสาขา (มีแถว = สาขานั้นนับวัตถุดิบตัวนี้)
-- menu_recipes             สูตร: หนึ่งจานใช้วัตถุดิบอะไร กี่หน่วย
-- ingredient_stock_logs    ประวัติรับเข้า ปรับยอด ของเสีย ตัดตามออเดอร์ และคืนเมื่อยกเลิก
-- order_items.unit_cost    ต้นทุนต่อจาน ณ ตอนสั่ง แช่แข็งไว้เหมือนราคาขาย
--
-- การตัดวัตถุดิบไม่ปฏิเสธออเดอร์เมื่อยอดติดลบ เพราะยอดวัตถุดิบในครัวคลาดเคลื่อนเสมอ
-- (ตวงไม่เป๊ะ ลืมบันทึกรับเข้า) การปฏิเสธลูกค้าเพราะตัวเลขที่ไม่แม่นเสียหายกว่า
-- ยอดติดลบจึงเป็นสัญญาณให้ไปนับของจริงแล้วปรับยอด ส่วนการปิดขายยังใช้จำนวนจานคงเหลือเหมือนเดิม
-- Run: node scripts/migrate.js
-- =============================================================

USE pos_qr;

CREATE TABLE IF NOT EXISTS ingredients (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(100)   NOT NULL,
  unit                VARCHAR(20)    NOT NULL,
  cost_per_unit       DECIMAL(12,4)  NOT NULL DEFAULT 0,
  low_stock_threshold DECIMAL(12,3)  NULL,
  is_active           TINYINT(1)     NOT NULL DEFAULT 1,
  created_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ingredient_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS branch_ingredient_stock (
  branch_id     INT            NOT NULL,
  ingredient_id INT            NOT NULL,
  quantity      DECIMAL(12,3)  NOT NULL DEFAULT 0,
  updated_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (branch_id, ingredient_id),
  FOREIGN KEY (branch_id)     REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu_recipes (
  menu_item_id  INT            NOT NULL,
  ingredient_id INT            NOT NULL,
  quantity      DECIMAL(12,3)  NOT NULL,
  PRIMARY KEY (menu_item_id, ingredient_id),
  INDEX idx_recipes_ingredient (ingredient_id),
  FOREIGN KEY (menu_item_id)  REFERENCES menu_items(id) ON DELETE CASCADE,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ingredient_stock_logs (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  branch_id     INT            NOT NULL,
  ingredient_id INT            NOT NULL,
  change_type   ENUM('RECEIVE','ADJUST','WASTE','DEDUCT','RESTORE') NOT NULL,
  quantity      DECIMAL(12,3)  NOT NULL,
  qty_before    DECIMAL(12,3)  NOT NULL,
  qty_after     DECIMAL(12,3)  NOT NULL,
  unit_cost     DECIMAL(12,4)  NULL,
  order_id      INT            NULL,
  order_item_id INT            NULL,
  changed_by    INT            NULL,
  note          VARCHAR(255)   NULL,
  created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ing_logs_branch_created (branch_id, created_at),
  INDEX idx_ing_logs_ingredient (ingredient_id, created_at),
  INDEX idx_ing_logs_order_item (order_item_id),
  FOREIGN KEY (branch_id)     REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by)    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(10,2) NULL AFTER unit_price;
