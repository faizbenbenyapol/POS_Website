-- =============================================================
-- Migration 010: Bill Refund — คืนเงินและยกเลิกบิลที่ปิดไปแล้ว
-- เดิมปิดบิลแล้วคือจบ ไม่มีทางแก้ในระบบเลย แคชเชียร์กดปิดผิดโต๊ะหรือเก็บเงินเกิน
-- ต้องไปตกลงกันนอกระบบแล้วปล่อยให้ยอดในรายงานผิดค้างไว้
-- Migration นี้เปิดทางให้เจ้าของร้านคืนเงินทั้งบิลได้ โดยยังเก็บบิลเดิมไว้ครบ
--
-- วิธีบันทึกเงิน: ไม่ลบแถวใน payments ทิ้ง แต่บันทึกแถวคืนเงินเป็นยอดติดลบเพิ่มเข้าไป
-- ตามช่องทางที่รับมาเดิม ทำให้ทุกรายงานที่บวก SUM(total_amount) หักยอดคืนให้เองอัตโนมัติ
-- และลิ้นชักเงินสดในใบปิดยอดตรงกับเงินจริงที่จ่ายคืนออกไป
-- Run: node scripts/migrate.js
-- หมายเหตุ: ใช้ไวยากรณ์ IF NOT EXISTS ของ MariaDB (เซิร์ฟเวอร์จริงคือ MariaDB 10.4)
-- =============================================================

USE pos_qr;

-- ---------------------------------------------------------
-- สถานะการคืนเงินของรอบการนั่ง เก็บที่บิลเดิมเพื่อกันการคืนซ้ำ
-- และให้หน้าจอบอกได้ว่าบิลใบนี้เป็นโมฆะไปแล้วพร้อมเหตุผล
-- refund_amount คือเงินที่จ่ายคืนจริง ซึ่งเท่ากับยอดที่เคยรับมาทุกช่องทางรวมกัน
-- ---------------------------------------------------------
ALTER TABLE table_sessions
  ADD COLUMN IF NOT EXISTS refunded_at   DATETIME      NULL         AFTER grand_total,
  ADD COLUMN IF NOT EXISTS refunded_by   INT           NULL         AFTER refunded_at,
  ADD COLUMN IF NOT EXISTS refund_reason VARCHAR(255)  NULL         AFTER refunded_by,
  ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER refund_reason;

-- ผู้อนุมัติการคืนเงิน อ้างกลับไปที่ users เพื่อตรวจย้อนหลังได้ว่าใครเป็นคนสั่งคืน
ALTER TABLE table_sessions
  ADD CONSTRAINT fk_sessions_refunded_by FOREIGN KEY IF NOT EXISTS (refunded_by) REFERENCES users(id);
