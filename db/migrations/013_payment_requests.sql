-- =============================================================
-- Migration 013: PromptPay & Payment Requests — รับเงินโอนผ่าน QR พร้อมเพย์
-- เดิม QR บนหน้าปิดบิลใช้เบอร์โทรของสาขาเป็นพร้อมเพย์ (ซึ่งส่วนใหญ่เป็นเบอร์บ้าน ใช้ไม่ได้จริง)
-- และแคชเชียร์กด "โอนเงิน" แล้วปิดบิลได้ทันทีโดยไม่มีใครยืนยันว่าเงินเข้าแล้ว
--
-- branches.promptpay_id    เบอร์มือถือ 10 หลัก / เลขบัตรประชาชนหรือเลขผู้เสียภาษี 13 หลัก / e-Wallet 15 หลัก
-- branches.promptpay_name  ชื่อบัญชีที่แสดงใต้ QR ให้ลูกค้าเห็นก่อนโอน
-- payment_requests         คำขอรับเงิน 1 ครั้ง = QR 1 รูปที่ผูกยอดและบิลไว้
--                          สถานะ PAID มาจาก webhook ของผู้ให้บริการ หรือแคชเชียร์ยืนยันเอง (confirmed_by)
-- payments.payment_request_id  ผูกแถวรับเงินโอนกับคำขอที่ยืนยันแล้ว หนึ่งคำขอใช้ปิดบิลได้ครั้งเดียว
--
-- ค่าเริ่มต้นเป็นบัญชีตัวอย่าง (0812345678) ให้ทดลองระบบได้ทันที
-- ต้องเปลี่ยนเป็นบัญชีจริงของร้านที่หน้า "จัดการสาขา" ก่อนเปิดใช้งานจริง
-- Run: node scripts/migrate.js
-- =============================================================

USE pos_qr;

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS promptpay_id   VARCHAR(20)  NULL AFTER service_charge_rate,
  ADD COLUMN IF NOT EXISTS promptpay_name VARCHAR(100) NULL AFTER promptpay_id;

UPDATE branches
   SET promptpay_id = '0812345678',
       promptpay_name = CONCAT(name, ' (บัญชีตัวอย่าง)')
 WHERE promptpay_id IS NULL;

CREATE TABLE IF NOT EXISTS payment_requests (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  branch_id    INT           NOT NULL,
  session_id   INT           NOT NULL,
  provider     VARCHAR(20)   NOT NULL,
  provider_ref VARCHAR(64)   NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  qr_payload   VARCHAR(512)  NOT NULL,
  status       ENUM('PENDING','PAID','EXPIRED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  expires_at   DATETIME      NOT NULL,
  paid_at      DATETIME      NULL,
  confirmed_by INT           NULL,
  created_by   INT           NOT NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payment_provider_ref (provider, provider_ref),
  INDEX idx_payment_requests_session (session_id, status),
  FOREIGN KEY (branch_id)    REFERENCES branches(id),
  FOREIGN KEY (session_id)   REFERENCES table_sessions(id),
  FOREIGN KEY (confirmed_by) REFERENCES users(id),
  FOREIGN KEY (created_by)   REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_request_id INT NULL AFTER change_amount,
  ADD UNIQUE KEY IF NOT EXISTS uq_payments_request (payment_request_id);
