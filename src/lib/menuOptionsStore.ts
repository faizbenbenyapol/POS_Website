import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { query } from '@/lib/db';
import type { MenuOptionGroup } from '@/lib/menuOptions';

/** แถวกลุ่มตัวเลือกจากฐานข้อมูล */
type GroupRow = RowDataPacket & {
  id: number;
  menu_item_id: number;
  name: string;
  min_select: number;
  max_select: number;
  sort_order: number;
  is_active: number;
};

/** แถวตัวเลือกจากฐานข้อมูล */
type OptionRow = RowDataPacket & {
  id: number;
  group_id: number;
  name: string;
  price_delta: string;
  sort_order: number;
  is_active: number;
};

/** กลุ่มตัวเลือกแบบเต็มสำหรับหน้าแก้ไขของแอดมิน รวมกลุ่มและตัวเลือกที่ปิดใช้ไว้ด้วย */
export type AdminOptionGroup = Omit<MenuOptionGroup, 'options'> & {
  isActive: boolean;
  options: (MenuOptionGroup['options'][number] & { isActive: boolean })[];
};

/**
 * อ่านกลุ่มตัวเลือกของหลายเมนูในสองคำสั่ง (ไม่ยิงทีละเมนู) แล้วจัดกลุ่มตาม menu_item_id
 *
 * activeOnly = true ใช้กับหน้าลูกค้าและตอนสั่ง: ตัดกลุ่มและตัวเลือกที่ปิดใช้ออก
 * และตัดกลุ่มที่ไม่เหลือตัวเลือกเปิดใช้เลยทิ้งด้วย เพราะลูกค้าเลือกให้ครบไม่ได้อยู่ดี
 * จำนวนที่เลือกได้สูงสุดถูกบีบไม่ให้เกินจำนวนตัวเลือกที่เหลือ กันกลุ่มบังคับที่เลือกครบไม่ได้
 *
 * @param menuItemIds - id ของเมนูที่ต้องการ
 * @param activeOnly - true คืนเฉพาะที่เปิดใช้ false คืนทั้งหมดสำหรับหน้าแก้ไข
 * @param conn - connection ใน transaction (ถ้ามี) เพื่ออ่านค่าชุดเดียวกับที่กำลังเขียน
 * @returns Map จาก menu_item_id ไปยังกลุ่มตัวเลือกที่เรียงตาม sort_order แล้ว
 */
export async function loadOptionGroups(
  menuItemIds: number[],
  activeOnly: boolean,
  conn?: PoolConnection,
): Promise<Map<number, AdminOptionGroup[]>> {
  const result = new Map<number, AdminOptionGroup[]>();
  const ids = [...new Set(menuItemIds)];
  if (ids.length === 0) return result;

  const placeholders = ids.map(() => '?').join(',');
  const run = async <T extends RowDataPacket>(sql: string, params: unknown[]): Promise<T[]> => {
    if (conn) {
      const [rows] = await conn.execute<T[]>(sql, params);
      return rows;
    }
    return query<T>(sql, params);
  };

  const groups = await run<GroupRow>(
    `SELECT id, menu_item_id, name, min_select, max_select, sort_order, is_active
       FROM menu_option_groups
      WHERE menu_item_id IN (${placeholders}) ${activeOnly ? 'AND is_active = 1' : ''}
      ORDER BY sort_order, id`,
    ids,
  );
  if (groups.length === 0) return result;

  const groupIds = groups.map((g) => g.id);
  const options = await run<OptionRow>(
    `SELECT id, group_id, name, price_delta, sort_order, is_active
       FROM menu_options
      WHERE group_id IN (${groupIds.map(() => '?').join(',')}) ${activeOnly ? 'AND is_active = 1' : ''}
      ORDER BY sort_order, id`,
    groupIds,
  );

  const optionsByGroup = new Map<number, AdminOptionGroup['options']>();
  for (const row of options) {
    const list = optionsByGroup.get(row.group_id) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      priceDelta: Number(row.price_delta),
      isActive: row.is_active === 1,
    });
    optionsByGroup.set(row.group_id, list);
  }

  for (const row of groups) {
    const groupOptions = optionsByGroup.get(row.id) ?? [];
    if (activeOnly && groupOptions.length === 0) continue;
    const list = result.get(row.menu_item_id) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      minSelect: activeOnly ? Math.min(row.min_select, groupOptions.length) : row.min_select,
      maxSelect: activeOnly ? Math.min(row.max_select, groupOptions.length) : row.max_select,
      isActive: row.is_active === 1,
      options: groupOptions,
    });
    result.set(row.menu_item_id, list);
  }
  return result;
}
