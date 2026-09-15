-- =============================================================
-- Migration 008: Money Layer — ส่วนลด ค่าบริการ ภาษี และการชำระเงินหลายช่องทาง
-- เดิม payments ผูกกับรอบการนั่งแบบ 1:1 (session_id UNIQUE) ทำให้จ่ายผสมไม่ได้
-- และยอดที่เก็บได้เท่ากับผลบวกราคาเมนูเป๊ะ ๆ เสมอ เพราะไม่มีที่เก็บส่วนลด/ค่าบริการ/VAT
-- Migration นี้เติมสามส่วน: ค่าตั้งภาษีระดับสาขา ยอดบิลที่แช่แข็งระดับรอบการนั่ง
-- และตารางการชำระเงินที่รองรับหลายแถวต่อหนึ่งบิล
-- Run: node scripts/migrate.js
-- หมายเหตุ: ใช้ไวยากรณ์ IF NOT EXISTS ของ MariaDB (เซิร์ฟเวอร์จริงคือ MariaDB 10.4)
--           ทำให้รันซ้ำได้โดยไม่ error และไม่ทำให้คำสั่งถัดไปในไฟล์ถูกข้าม
-- =============================================================

USE pos_qr;

-- ---------------------------------------------------------
-- 1. ค่าตั้งเรื่องเงินระดับสาขา
--    แต่ละสาขาคิด VAT และค่าบริการต่างกันได้ ไม่ต้องฮาร์ดโค้ด 7% ไว้ในหน้าใบเสร็จอีก
--    vat_inclusive = 1 คือราคาเมนูรวม VAT แล้ว (ร้านทั่วไปในไทย) ต้องถอด VAT ออกจากยอด
--    vat_inclusive = 0 คือราคาเมนูยังไม่รวม VAT ต้องบวกเพิ่มท้ายบิล (โรงแรม/ร้านใหญ่)
-- ---------------------------------------------------------
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS vat_rate            DECIMAL(5,2) NOT NULL DEFAULT 7.00 AFTER business_day_cutoff_hour,
  ADD COLUMN IF NOT EXISTS vat_inclusive       TINYINT(1)   NOT NULL DEFAULT 1    AFTER vat_rate,
  ADD COLUMN IF NOT EXISTS service_charge_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER vat_inclusive;

-- ---------------------------------------------------------
-- 2. ยอดบิลที่แช่แข็งไว้ในรอบการนั่ง
--    คำนวณครั้งเดียวตอนกดปิดบิลแล้วเก็บไว้ ไม่คำนวณใหม่ตอนเปิดดูย้อนหลัง
--    ด้วยเหตุผลเดียวกับที่ตาราง settlements แช่แข็ง Z-Report ไว้
--    ลำดับการคิด: subtotal -> หักส่วนลด -> บวกค่าบริการ -> คิด VAT -> grand_total
-- ---------------------------------------------------------
ALTER TABLE table_sessions
  ADD COLUMN IF NOT EXISTS subtotal_amount       DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_type         ENUM('NONE','AMOUNT','PERCENT') NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS discount_value        DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount       DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_reason       VARCHAR(255)  NULL,
  ADD COLUMN IF NOT EXISTS discount_by           INT           NULL,
  ADD COLUMN IF NOT EXISTS service_charge_rate   DECIMAL(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_charge_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_rate              DECIMAL(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_inclusive         TINYINT(1)    NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS vat_amount            DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grand_total           DECIMAL(10,2) NOT NULL DEFAULT 0;

-- ผู้อนุมัติส่วนลด อ้างกลับไปที่ users เพื่อตรวจย้อนหลังได้ว่าใครเป็นคนให้ส่วนลด
ALTER TABLE table_sessions
  ADD CONSTRAINT fk_sessions_discount_by FOREIGN KEY IF NOT EXISTS (discount_by) REFERENCES users(id);

-- ---------------------------------------------------------
-- 3. การชำระเงินหลายช่องทางต่อหนึ่งบิล
--    ต้องสร้าง index ธรรมดาก่อนแล้วค่อยถอด UNIQUE เพราะ foreign key ของ session_id
--    ต้องมี index รองรับอยู่ตลอดเวลา ถ้าถอด UNIQUE ก่อน MariaDB จะปฏิเสธคำสั่ง
-- ---------------------------------------------------------
ALTER TABLE payments
  ADD INDEX IF NOT EXISTS idx_payments_session (session_id);

ALTER TABLE payments
  DROP INDEX IF EXISTS session_id;

-- received_amount คือเงินที่รับมาจากลูกค้าจริง (เงินสดเท่านั้นที่มีค่าต่างจากยอดชำระ)
-- change_amount คือเงินทอน เดิมหน้าจอคำนวณให้ดูและพิมพ์ลงใบเสร็จ แต่ไม่เคยถูกบันทึก
-- จึงตรวจย้อนหลังไม่ได้ว่าแคชเชียร์ทอนถูกหรือไม่
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS received_amount DECIMAL(10,2) NULL          AFTER total_amount,
  ADD COLUMN IF NOT EXISTS change_amount   DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER received_amount;

-- ---------------------------------------------------------
-- 4. เติมยอดบิลย้อนหลังให้รอบการนั่งที่ปิดไปแล้วก่อนมี migration นี้
--    บิลเก่าไม่มีส่วนลดและค่าบริการ ยอดสุทธิจึงเท่ากับยอดที่บันทึกใน payments
--    ส่วน VAT ถอดกลับด้วยอัตราของสาขาแบบรวมภาษี ให้ตรงกับที่ใบเสร็จเดิมเคยแสดง
-- ---------------------------------------------------------
UPDATE table_sessions s
   JOIN branches b ON b.id = s.branch_id
   JOIN (
     SELECT session_id, SUM(total_amount) AS paid_total
       FROM payments
      GROUP BY session_id
   ) p ON p.session_id = s.id
    SET s.subtotal_amount = p.paid_total,
        s.grand_total     = p.paid_total,
        s.vat_rate        = b.vat_rate,
        s.vat_inclusive   = 1,
        s.vat_amount      = ROUND(p.paid_total * b.vat_rate / (100 + b.vat_rate), 2)
  WHERE s.status = 'CLOSED'
    AND s.grand_total = 0;

-- เงินสดของบิลเก่าถือว่ารับมาพอดี ไม่มีเงินทอนบันทึกไว้
UPDATE payments
   SET received_amount = total_amount
 WHERE received_amount IS NULL
   AND method = 'CASH';
