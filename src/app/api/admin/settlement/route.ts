import type { NextRequest } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, serverError, authFailureResponse, ERROR_CODES } from '@/lib/api';
import { requireCapability } from '@/lib/auth';
import { query, withTransaction } from '@/lib/db';
import { getEffectiveBranchId, getActiveBranch } from '@/lib/branch';
import { findSettlement, type SettlementRow } from '@/lib/settlement';
import { closeSettlementSchema, firstErrorMessage } from '@/lib/validation';
import {
  businessDayRange,
  getBusinessDayRangeFromDateString,
  getBusinessCutoffHour,
} from '@/lib/format';

/** ข้อมูลสรุปช่องทางชำระเงิน */
export type PaymentMethodSummary = {
  method: 'CASH' | 'TRANSFER' | 'CARD';
  count: number;
  total: number;
};

/** ข้อมูลสรุปรายแคชเชียร์ */
export type CashierSummary = {
  cashierId: number;
  cashierName: string;
  method: 'CASH' | 'TRANSFER' | 'CARD';
  count: number;
  total: number;
};

/** ข้อมูลสรุปยอดขายแยกตามหมวดหมู่ */
export type CategorySalesSummary = {
  categoryId: number | null;
  categoryName: string;
  quantity: number;
  total: number;
};

/** ข้อมูลสรุปเมนูขายดี */
export type TopSellingItemSummary = {
  menuItemId: number;
  itemName: string;
  quantity: number;
  total: number;
};

/** ข้อมูลสรุปการยกเลิกตามสาเหตุ */
export type VoidReasonSummary = {
  reason: string;
  count: number;
  total: number;
};

/** ข้อมูลการปิดยอดที่ถูกบันทึกถาวรแล้ว (null = วันทำการนี้ยังไม่ถูกปิด) */
export type SettlementClosure = {
  zNumber: number;
  closedAt: string;
  closedByName: string;
  countedCash: number | null;
  cashDifference: number | null;
  note: string | null;
};

/** ข้อมูลสรุปปิดยอดประจำวันเต็มรูปแบบ */
export type DailySettlementReport = {
  branchId: number | null;
  branchName: string;
  branchCode: string;
  cutoffHour: number;
  businessDate: string;
  startTime: string;
  endTime: string;
  generatedAt: string;
  // ภาพรวมยอดขาย
  totalRevenue: number;
  totalBills: number;
  avgBillAmount: number;
  firstPaymentTime: string | null;
  lastPaymentTime: string | null;
  // ช่องทางชำระเงิน
  paymentMethods: PaymentMethodSummary[];
  cashTotal: number;
  transferTotal: number;
  cardTotal: number;
  // องค์ประกอบของยอดขาย ต้องกระทบยอดกันได้กับ totalRevenue
  grossSalesAmount: number;
  discountAmount: number;
  serviceChargeAmount: number;
  vatAmount: number;
  discountedBillCount: number;
  // โต๊ะค้างชำระปัจจุบัน
  unpaidSessionsCount: number;
  unpaidEstimatedAmount: number;
  // ยอดรับเงินรายแคชเชียร์
  cashiers: CashierSummary[];
  // ยอดขายตามหมวดหมู่
  categorySales: CategorySalesSummary[];
  // เมนูขายดี 10 อันดับ
  topItems: TopSellingItemSummary[];
  // ความเสียหายจากการยกเลิก (Void Loss)
  totalVoidCount: number;
  totalVoidAmount: number;
  voidReasons: VoidReasonSummary[];
  // สถานะการปิดยอด ถ้าไม่ใช่ null แปลว่าตัวเลขชุดนี้ถูกแช่แข็งแล้วแก้ไม่ได้
  closure: SettlementClosure | null;
};

/**
 * คำนวณรายงานสรุปปิดยอดประจำวันแบบสดจากข้อมูลในฐานข้อมูล ณ ขณะที่เรียก
 * แยกเป็นฟังก์ชันกลางเพราะทั้ง GET (เปิดดูรายงาน) และ POST (กดปิดยอด) ต้องใช้ตัวเลขชุดเดียวกัน
 *
 * @param branchId - รหัสสาขาที่ต้องการสรุป ส่ง null เพื่อรวมทุกสาขา
 * @param branchName - ชื่อสาขาที่จะแสดงบนหัวรายงาน
 * @param branchCode - รหัสย่อสาขาที่ใช้ตั้งชื่อไฟล์ส่งออก
 * @param cutoffHour - ชั่วโมงตัดรอบวันทำการของสาขา (0-23)
 * @param targetDate - วันทำการที่ต้องการสรุป รูปแบบ YYYY-MM-DD
 * @returns รายงานสรุปปิดยอดประจำวัน โดย closure เป็น null เสมอ ให้ผู้เรียกเติมเองถ้าวันนั้นปิดแล้ว
 */
async function buildSettlementReport(
  branchId: number | null,
  branchName: string,
  branchCode: string,
  cutoffHour: number,
  targetDate: string,
): Promise<DailySettlementReport> {
    const range = getBusinessDayRangeFromDateString(targetDate, cutoffHour);

    // 1. สรุปยอดเงินตามช่องทางชำระ
    const paymentRows = await query<
      RowDataPacket & {
        method: 'CASH' | 'TRANSFER' | 'CARD';
        transaction_count: number;
        total_amount: string;
        min_paid: string | null;
        max_paid: string | null;
      }
    >(
      `SELECT p.method,
              COUNT(p.id) AS transaction_count,
              COALESCE(SUM(p.total_amount), 0) AS total_amount,
              MIN(p.paid_at) AS min_paid,
              MAX(p.paid_at) AS max_paid
         FROM payments p
        WHERE (? IS NULL OR p.branch_id = ?)
          AND p.paid_at >= ? AND p.paid_at < ?
        GROUP BY p.method`,
      [branchId, branchId, range.startSql, range.endSql],
    );

    const paymentMethods: PaymentMethodSummary[] = [
      { method: 'CASH', count: 0, total: 0 },
      { method: 'TRANSFER', count: 0, total: 0 },
      { method: 'CARD', count: 0, total: 0 },
    ];

    let totalRevenue = 0;
    let firstPaymentTime: string | null = null;
    let lastPaymentTime: string | null = null;

    for (const row of paymentRows) {
      const amt = Number(row.total_amount || 0);
      const cnt = Number(row.transaction_count || 0);
      totalRevenue += amt;

      const target = paymentMethods.find((m) => m.method === row.method);
      if (target) {
        target.count = cnt;
        target.total = amt;
      }

      if (row.min_paid) {
        if (!firstPaymentTime || new Date(row.min_paid) < new Date(firstPaymentTime)) {
          firstPaymentTime = String(row.min_paid);
        }
      }
      if (row.max_paid) {
        if (!lastPaymentTime || new Date(row.max_paid) > new Date(lastPaymentTime)) {
          lastPaymentTime = String(row.max_paid);
        }
      }
    }

    const cashTotal = paymentMethods.find((m) => m.method === 'CASH')?.total ?? 0;
    const transferTotal = paymentMethods.find((m) => m.method === 'TRANSFER')?.total ?? 0;
    const cardTotal = paymentMethods.find((m) => m.method === 'CARD')?.total ?? 0;

    // 1.1 องค์ประกอบของยอดขายอ่านจากยอดบิลที่แช่แข็งไว้ในรอบการนั่ง ไม่คำนวณใหม่
    //     จำนวนบิลนับจากรอบการนั่ง ไม่ใช่จำนวนแถว payments เพราะบิลที่แบ่งจ่าย
    //     หลายช่องทางจะมี payments หลายแถวแต่ยังเป็นบิลใบเดียว
    //     และนับเฉพาะแถวรับเงินจริง (total_amount > 0) เพื่อไม่ให้แถวคืนเงินติดลบของบิลวันก่อน
    //     ลากบิลใบนั้นเข้ามาเป็นยอดขายของวันที่คืนเงิน
    const billRows = await query<
      RowDataPacket & {
        bill_count: number;
        gross_sales: string;
        discount_total: string;
        service_charge_total: string;
        vat_total: string;
        discounted_bills: number;
      }
    >(
      `SELECT COUNT(DISTINCT s.id) AS bill_count,
              COALESCE(SUM(s.subtotal_amount), 0) AS gross_sales,
              COALESCE(SUM(s.discount_amount), 0) AS discount_total,
              COALESCE(SUM(s.service_charge_amount), 0) AS service_charge_total,
              COALESCE(SUM(s.vat_amount), 0) AS vat_total,
              COALESCE(SUM(IF(s.discount_amount > 0, 1, 0)), 0) AS discounted_bills
         FROM table_sessions s
        WHERE s.id IN (
                SELECT DISTINCT p.session_id
                  FROM payments p
                 WHERE (? IS NULL OR p.branch_id = ?)
                   AND p.paid_at >= ? AND p.paid_at < ?
                   AND p.total_amount > 0
              )`,
      [branchId, branchId, range.startSql, range.endSql],
    );
    const billSummary = billRows[0];
    const totalBills = Number(billSummary?.bill_count ?? 0);
    const grossSalesAmount = Number(billSummary?.gross_sales ?? 0);
    const discountAmount = Number(billSummary?.discount_total ?? 0);
    const serviceChargeAmount = Number(billSummary?.service_charge_total ?? 0);
    const vatAmount = Number(billSummary?.vat_total ?? 0);
    const discountedBillCount = Number(billSummary?.discounted_bills ?? 0);

    const avgBillAmount = totalBills > 0 ? totalRevenue / totalBills : 0;

    // 2. โต๊ะที่ยังเปิดค้างชำระอยู่ ณ ปัจจุบันในสาขา
    const unpaidRows = await query<
      RowDataPacket & {
        open_count: number;
        estimated_total: string;
      }
    >(
      `SELECT COUNT(DISTINCT s.id) AS open_count,
              COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS estimated_total
         FROM table_sessions s
         LEFT JOIN orders o ON o.session_id = s.id
         LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.status <> 'CANCELLED'
        WHERE s.status = 'OPEN'
          AND (? IS NULL OR s.branch_id = ?)`,
      [branchId, branchId],
    );

    const unpaidSessionsCount = Number(unpaidRows[0]?.open_count || 0);
    const unpaidEstimatedAmount = Number(unpaidRows[0]?.estimated_total || 0);

    // 3. ยอดรับเงินรายพนักงานแคชเชียร์
    const cashierRows = await query<
      RowDataPacket & {
        received_by: number;
        cashier_name: string;
        method: 'CASH' | 'TRANSFER' | 'CARD';
        count: number;
        total: string;
      }
    >(
      `SELECT p.received_by,
              u.full_name AS cashier_name,
              p.method,
              COUNT(p.id) AS count,
              COALESCE(SUM(p.total_amount), 0) AS total
         FROM payments p
         JOIN users u ON u.id = p.received_by
        WHERE (? IS NULL OR p.branch_id = ?)
          AND p.paid_at >= ? AND p.paid_at < ?
        GROUP BY p.received_by, u.full_name, p.method
        ORDER BY u.full_name ASC, p.method ASC`,
      [branchId, branchId, range.startSql, range.endSql],
    );

    const cashiers: CashierSummary[] = cashierRows.map((r) => ({
      cashierId: r.received_by,
      cashierName: r.cashier_name,
      method: r.method,
      count: Number(r.count || 0),
      total: Number(r.total || 0),
    }));

    // 4. ยอดขายตามหมวดหมู่
    const categoryRows = await query<
      RowDataPacket & {
        category_id: number | null;
        category_name: string | null;
        total_quantity: string;
        total_amount: string;
      }
    >(
      `SELECT c.id AS category_id,
              COALESCE(c.name, 'ไม่ระบุหมวดหมู่') AS category_name,
              COALESCE(SUM(oi.quantity), 0) AS total_quantity,
              COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS total_amount
         FROM payments p
         JOIN orders o ON o.session_id = p.session_id
         JOIN order_items oi ON oi.order_id = o.id AND oi.status <> 'CANCELLED'
         JOIN menu_items m ON m.id = oi.menu_item_id
         LEFT JOIN categories c ON c.id = m.category_id
        WHERE (? IS NULL OR p.branch_id = ?)
          AND p.paid_at >= ? AND p.paid_at < ?
        GROUP BY c.id, c.name
        ORDER BY total_amount DESC`,
      [branchId, branchId, range.startSql, range.endSql],
    );

    const categorySales: CategorySalesSummary[] = categoryRows.map((r) => ({
      categoryId: r.category_id,
      categoryName: r.category_name || 'ไม่ระบุหมวดหมู่',
      quantity: Number(r.total_quantity || 0),
      total: Number(r.total_amount || 0),
    }));

    // 5. เมนูขายดี 10 อันดับ
    const topItemRows = await query<
      RowDataPacket & {
        menu_item_id: number;
        item_name: string;
        total_quantity: string;
        total_amount: string;
      }
    >(
      `SELECT oi.menu_item_id,
              oi.item_name,
              COALESCE(SUM(oi.quantity), 0) AS total_quantity,
              COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS total_amount
         FROM payments p
         JOIN orders o ON o.session_id = p.session_id
         JOIN order_items oi ON oi.order_id = o.id AND oi.status <> 'CANCELLED'
        WHERE (? IS NULL OR p.branch_id = ?)
          AND p.paid_at >= ? AND p.paid_at < ?
        GROUP BY oi.menu_item_id, oi.item_name
        ORDER BY total_quantity DESC, total_amount DESC
        LIMIT 10`,
      [branchId, branchId, range.startSql, range.endSql],
    );

    const topItems: TopSellingItemSummary[] = topItemRows.map((r) => ({
      menuItemId: r.menu_item_id,
      itemName: r.item_name,
      quantity: Number(r.total_quantity || 0),
      total: Number(r.total_amount || 0),
    }));

    // 6. ความเสียหายและรายการยกเลิก (Void Losses) ประจำวันทำการ
    const voidRows = await query<
      RowDataPacket & {
        reason: string;
        void_count: number;
        void_amount: string;
      }
    >(
      `SELECT c.reason,
              COUNT(c.id) AS void_count,
              COALESCE(SUM(c.amount), 0) AS void_amount
         FROM cancellation_audit_logs c
        WHERE (? IS NULL OR c.branch_id = ?)
          AND c.created_at >= ? AND c.created_at < ?
        GROUP BY c.reason
        ORDER BY void_amount DESC`,
      [branchId, branchId, range.startSql, range.endSql],
    );

    let totalVoidCount = 0;
    let totalVoidAmount = 0;
    const voidReasons: VoidReasonSummary[] = voidRows.map((r) => {
      const cnt = Number(r.void_count || 0);
      const amt = Number(r.void_amount || 0);
      totalVoidCount += cnt;
      totalVoidAmount += amt;
      return {
        reason: r.reason,
        count: cnt,
        total: amt,
      };
    });

    return {
      branchId,
      branchName,
      branchCode,
      cutoffHour,
      businessDate: range.businessDate,
      startTime: range.startSql,
      endTime: range.endSql,
      generatedAt: new Date().toISOString(),
      totalRevenue,
      totalBills,
      avgBillAmount,
      firstPaymentTime,
      lastPaymentTime,
      paymentMethods,
      cashTotal,
      transferTotal,
      cardTotal,
      grossSalesAmount,
      discountAmount,
      serviceChargeAmount,
      vatAmount,
      discountedBillCount,
      unpaidSessionsCount,
      unpaidEstimatedAmount,
      cashiers,
      categorySales,
      topItems,
      totalVoidCount,
      totalVoidAmount,
      voidReasons,
      closure: null,
    };
}

/**
 * แปลงแถวในตาราง settlements ให้เป็นข้อมูลสถานะการปิดยอดที่หน้าจอใช้แสดงผล
 *
 * @param row - แถวผลปิดยอดที่อ่านมาจากฐานข้อมูล
 * @returns ข้อมูลการปิดยอด เลขที่ Z คนที่กดปิด และผลต่างเงินสด
 */
function toClosure(row: SettlementRow): SettlementClosure {
  return {
    zNumber: Number(row.z_number),
    closedAt: new Date(row.closed_at).toISOString(),
    closedByName: row.closed_by_name,
    countedCash: row.counted_cash === null ? null : Number(row.counted_cash),
    cashDifference: row.cash_difference === null ? null : Number(row.cash_difference),
    note: row.note,
  };
}

/**
 * ดึงรายงานสรุปปิดยอดประจำวัน (End-of-Day Settlement / Z-Report)
 * ถ้าวันทำการนั้นถูกปิดยอดไปแล้ว จะคืนตัวเลขชุดที่แช่แข็งไว้ตอนกดปิด ไม่คำนวณใหม่
 * เพื่อไม่ให้รายงานย้อนหลังขยับตามการแก้ข้อมูลที่เกิดขึ้นทีหลัง
 *
 * @param request - คำขอที่อาจระบุ query string date=YYYY-MM-DD
 * @returns รายงานสรุปปิดยอดประจำวันพร้อมสถานะการปิดยอดในฟิลด์ closure
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCapability('settlement');
    if (!auth.ok) return authFailureResponse(auth.reason);

    const branchId = await getEffectiveBranchId(request, auth.user);
    const activeBranch = await getActiveBranch(request, auth.user);
    const cutoffHour = activeBranch?.businessDayCutoffHour ?? getBusinessCutoffHour();
    const branchName = activeBranch?.name ?? 'ทุกสาขา (ภาพรวมส่วนกลาง)';
    const branchCode = activeBranch?.code ?? 'ALL';

    const rawDate = (request.nextUrl.searchParams.get('date') ?? '').trim();
    // หากไม่ระบุวันที่ ให้ใช้วันทำการปัจจุบันของสาขา
    const targetDate = rawDate || businessDayRange(undefined, cutoffHour).businessDate;

    // มุมมองรวมทุกสาขา (branchId เป็น null) ไม่มีใบปิดยอดของตัวเอง จึงคำนวณสดเสมอ
    const settled = branchId ? await findSettlement(branchId, targetDate) : null;
    if (settled) {
      const frozen = JSON.parse(settled.report_json) as DailySettlementReport;
      frozen.closure = toClosure(settled);
      return apiOk(frozen);
    }

    const report = await buildSettlementReport(
      branchId,
      branchName,
      branchCode,
      cutoffHour,
      targetDate,
    );
    return apiOk(report);
  } catch (err) {
    return serverError(err, 'GET /api/admin/settlement');
  }
}

/**
 * ปิดยอดประจำวันแล้วบันทึกรายงาน (Z-Report) ลงตาราง settlements แบบถาวร
 * ปิดได้ครั้งเดียวต่อสาขาต่อวันทำการ และเมื่อปิดแล้ววันทำการนั้นจะรับชำระเงินเพิ่มไม่ได้อีก
 *
 * @param request - คำขอที่มี body เป็น JSON { date, countedCash?, note? }
 * @returns เลขที่ Z-Report และรายงานที่ถูกแช่แข็ง หรือ error พร้อมข้อความไทยบอกสาเหตุที่ปิดไม่ได้
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireCapability('settlement');
    if (!auth.ok) return authFailureResponse(auth.reason);

    const branchId = await getEffectiveBranchId(request, auth.user);
    const activeBranch = await getActiveBranch(request, auth.user);
    if (!branchId || !activeBranch) {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'กรุณาเลือกสาขาที่ต้องการปิดยอดก่อน ระบบไม่อนุญาตให้ปิดยอดจากมุมมองรวมทุกสาขา',
      );
    }

    const parsed = closeSettlementSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
    }

    const cutoffHour = activeBranch.businessDayCutoffHour ?? getBusinessCutoffHour();
    const targetDate = parsed.data.date;
    const currentBusinessDate = businessDayRange(undefined, cutoffHour).businessDate;

    // ห้ามปิดยอดล่วงหน้า เพราะวันทำการนั้นยังไม่เริ่มเก็บเงิน
    if (targetDate > currentBusinessDate) {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'ยังปิดยอดของวันทำการในอนาคตไม่ได้ กรุณาเลือกวันทำการปัจจุบันหรือย้อนหลัง',
      );
    }

    const existing = await findSettlement(branchId, targetDate);
    if (existing) {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        `วันทำการนี้ปิดยอดไปแล้วเป็นใบที่ Z-${existing.z_number} โดย ${existing.closed_by_name} ปิดซ้ำไม่ได้`,
        409,
      );
    }

    const report = await buildSettlementReport(
      branchId,
      activeBranch.name,
      activeBranch.code,
      cutoffHour,
      targetDate,
    );

    // ปิดยอดของวันทำการปัจจุบันได้ต่อเมื่อเก็บเงินครบทุกโต๊ะแล้ว
    // (วันย้อนหลังไม่ต้องเช็ค เพราะโต๊ะที่เปิดค้างอยู่ตอนนี้เป็นของวันทำการปัจจุบัน)
    if (targetDate === currentBusinessDate && report.unpaidSessionsCount > 0) {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        `ยังมีโต๊ะที่ยังไม่เช็คบิลอยู่ ${report.unpaidSessionsCount} โต๊ะ กรุณาปิดบิลให้ครบก่อนปิดยอดประจำวัน`,
        409,
      );
    }

    const countedCash = parsed.data.countedCash ?? null;
    const cashDifference =
      countedCash === null ? null : Number((countedCash - report.cashTotal).toFixed(2));
    const note = parsed.data.note?.trim() || null;
    const reportJson = JSON.stringify(report);

    const zNumber = await withTransaction(async (conn) => {
      // ล็อกแถวของสาขานี้ไว้ก่อนออกเลขที่ใบปิดยอด กันสองเครื่องกดปิดพร้อมกันแล้วได้เลขซ้ำ
      const [maxRows] = await conn.execute<(RowDataPacket & { next_z: number })[]>(
        'SELECT COALESCE(MAX(z_number), 0) + 1 AS next_z FROM settlements WHERE branch_id = ? FOR UPDATE',
        [branchId],
      );
      const nextZ = Number(maxRows[0]?.next_z ?? 1);

      await conn.execute<ResultSetHeader>(
        `INSERT INTO settlements
           (branch_id, business_date, z_number, cutoff_hour, period_start, period_end,
            total_revenue, total_bills, cash_total, transfer_total, card_total,
            void_count, void_amount, counted_cash, cash_difference, note, report_json, closed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          branchId,
          targetDate,
          nextZ,
          cutoffHour,
          report.startTime,
          report.endTime,
          report.totalRevenue,
          report.totalBills,
          report.cashTotal,
          report.transferTotal,
          report.cardTotal,
          report.totalVoidCount,
          report.totalVoidAmount,
          countedCash,
          cashDifference,
          note,
          reportJson,
          auth.user.id,
        ],
      );
      return nextZ;
    });

    report.closure = {
      zNumber,
      closedAt: new Date().toISOString(),
      closedByName: auth.user.fullName,
      countedCash,
      cashDifference,
      note,
    };

    return apiOk(report, 201);
  } catch (err) {
    // ชน UNIQUE KEY แปลว่ามีคนกดปิดยอดวันเดียวกันสำเร็จไปก่อนเสี้ยววินาที
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'วันทำการนี้เพิ่งถูกปิดยอดโดยผู้ใช้อื่น กรุณารีเฟรชหน้าจอเพื่อดูใบปิดยอดล่าสุด',
        409,
      );
    }
    return serverError(err, 'POST /api/admin/settlement');
  }
}
