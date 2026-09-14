import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { queryOne } from '@/lib/db';

/** แถวสรุปผลปิดยอดที่บันทึกไว้แล้วในตาราง settlements */
export type SettlementRow = RowDataPacket & {
  id: number;
  branch_id: number;
  business_date: string;
  z_number: number;
  cutoff_hour: number;
  period_start: string;
  period_end: string;
  total_revenue: string;
  total_bills: number;
  cash_total: string;
  transfer_total: string;
  card_total: string;
  void_count: number;
  void_amount: string;
  counted_cash: string | null;
  cash_difference: string | null;
  note: string | null;
  report_json: string;
  closed_by: number;
  closed_at: string;
  closed_by_name: string;
};

/** คำสั่ง SQL กลางสำหรับอ่านผลปิดยอดของวันทำการหนึ่ง พร้อมชื่อคนที่กดปิด */
const FIND_SETTLEMENT_SQL = `SELECT s.*, u.full_name AS closed_by_name
     FROM settlements s
     JOIN users u ON u.id = s.closed_by
    WHERE s.branch_id = ? AND s.business_date = ?`;

/**
 * ค้นว่าวันทำการนั้นของสาขานั้นถูกปิดยอด (Z-Report) ไปแล้วหรือยัง
 * ใช้เป็นด่านตรวจก่อนทุกงานที่จะเขียนเงินเข้าไปในวันทำการนั้น
 *
 * @param branchId - รหัสสาขาที่ต้องการตรวจ
 * @param businessDate - วันทำการรูปแบบ YYYY-MM-DD
 * @param conn - connection ของ transaction ที่กำลังทำงานอยู่ ถ้าไม่ส่งจะอ่านผ่าน pool ปกติ
 * @returns แถวผลปิดยอด หรือ null เมื่อวันทำการนั้นยังไม่ถูกปิด
 */
export async function findSettlement(
  branchId: number,
  businessDate: string,
  conn?: PoolConnection,
): Promise<SettlementRow | null> {
  if (conn) {
    const [rows] = await conn.execute<SettlementRow[]>(FIND_SETTLEMENT_SQL, [
      branchId,
      businessDate,
    ]);
    return rows[0] ?? null;
  }
  return queryOne<SettlementRow>(FIND_SETTLEMENT_SQL, [branchId, businessDate]);
}
