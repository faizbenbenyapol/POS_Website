-- Migration 005: แยกประเภทออเดอร์ ทานที่ร้าน (DINE_IN) กับ กลับบ้าน (TAKEAWAY)
-- ออเดอร์เดิมทั้งหมดถือเป็นทานที่ร้านตามค่า DEFAULT
ALTER TABLE orders
  ADD COLUMN order_type ENUM('DINE_IN','TAKEAWAY') NOT NULL DEFAULT 'DINE_IN' AFTER session_id;
