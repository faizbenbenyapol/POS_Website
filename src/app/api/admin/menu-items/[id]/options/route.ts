import type { NextRequest } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, serverError, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { queryOne, withTransaction } from '@/lib/db';
import { loadOptionGroups } from '@/lib/menuOptionsStore';
import { menuOptionGroupsSchema, firstErrorMessage } from '@/lib/validation';

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type RouteContext = { params: Promise<{ id: string }> };

/**
 * อ่านกลุ่มตัวเลือกทั้งหมดของเมนู รวมที่ปิดใช้ไว้ด้วย สำหรับหน้าแก้ไขของแอดมิน
 *
 * @param _request - คำขอ ไม่ได้ใช้พารามิเตอร์ใด
 * @param context - พารามิเตอร์เส้นทางที่มี id ของเมนู
 * @returns กลุ่มตัวเลือกพร้อมตัวเลือกในแต่ละกลุ่ม เรียงตามลำดับที่ลูกค้าเห็น
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const menuItemId = parseId((await context.params).id);
  if (!menuItemId) return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสเมนูไม่ถูกต้อง');

  try {
    const groups = await loadOptionGroups([menuItemId], false);
    return apiOk({ groups: groups.get(menuItemId) ?? [] });
  } catch (err) {
    return serverError(err, 'GET /api/admin/menu-items/[id]/options');
  }
}

/**
 * บันทึกกลุ่มตัวเลือกของเมนูทั้งชุดในคราวเดียว ใช้ได้เฉพาะแอดมินเพราะกระทบราคาที่ลูกค้าจ่าย
 *
 * แถวที่ส่ง id มาคือแก้ของเดิม ไม่มี id คือเพิ่มใหม่ ส่วนกลุ่มหรือตัวเลือกเดิมที่ไม่ถูกส่งมาจะถูกลบ
 * บิลเก่าไม่กระทบ เพราะชื่อและราคาของตัวเลือกถูกคัดลอกไว้ใน order_item_options ตั้งแต่ตอนสั่ง
 * ทำใน transaction เดียว ถ้าพังกลางทางจะไม่มีเมนูที่ตัวเลือกหายไปครึ่งชุด
 *
 * @param request - คำขอที่มี body ตาม menuOptionGroupsSchema
 * @param context - พารามิเตอร์เส้นทางที่มี id ของเมนู
 * @returns กลุ่มตัวเลือกชุดใหม่หลังบันทึก หรือ error พร้อมข้อความไทย
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const menuItemId = parseId((await context.params).id);
  if (!menuItemId) return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสเมนูไม่ถูกต้อง');

  const parsed = menuOptionGroupsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  try {
    const menu = await queryOne<RowDataPacket & { id: number }>(
      'SELECT id FROM menu_items WHERE id = ? LIMIT 1',
      [menuItemId],
    );
    if (!menu) return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบเมนูนี้ กรุณารีเฟรชหน้า', 404);

    const saved = await withTransaction<{ ok: true } | { ok: false; message: string }>(async (conn) => {
      const [existingGroups] = await conn.execute<(RowDataPacket & { id: number })[]>(
        'SELECT id FROM menu_option_groups WHERE menu_item_id = ? FOR UPDATE',
        [menuItemId],
      );
      const ownedGroupIds = new Set(existingGroups.map((g) => g.id));
      const keptGroupIds: number[] = [];

      for (const [groupIndex, group] of parsed.data.groups.entries()) {
        let groupId = group.id;
        if (groupId !== undefined && !ownedGroupIds.has(groupId)) {
          return { ok: false, message: 'มีกลุ่มตัวเลือกที่ไม่ใช่ของเมนูนี้ กรุณาปิดหน้าต่างแล้วเปิดใหม่' };
        }
        if (groupId !== undefined) {
          await conn.execute(
            `UPDATE menu_option_groups
                SET name = ?, min_select = ?, max_select = ?, sort_order = ?, is_active = ?
              WHERE id = ?`,
            [group.name, group.minSelect, group.maxSelect, groupIndex, group.isActive ? 1 : 0, groupId],
          );
        } else {
          const [inserted] = await conn.execute<ResultSetHeader>(
            `INSERT INTO menu_option_groups (menu_item_id, name, min_select, max_select, sort_order, is_active)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [menuItemId, group.name, group.minSelect, group.maxSelect, groupIndex, group.isActive ? 1 : 0],
          );
          groupId = inserted.insertId;
        }
        keptGroupIds.push(groupId);

        const [existingOptions] = await conn.execute<(RowDataPacket & { id: number })[]>(
          'SELECT id FROM menu_options WHERE group_id = ?',
          [groupId],
        );
        const ownedOptionIds = new Set(existingOptions.map((o) => o.id));
        const keptOptionIds: number[] = [];

        for (const [optionIndex, option] of group.options.entries()) {
          if (option.id !== undefined && !ownedOptionIds.has(option.id)) {
            return { ok: false, message: 'มีตัวเลือกที่ไม่ใช่ของกลุ่มนี้ กรุณาปิดหน้าต่างแล้วเปิดใหม่' };
          }
          if (option.id !== undefined) {
            await conn.execute(
              'UPDATE menu_options SET name = ?, price_delta = ?, sort_order = ?, is_active = ? WHERE id = ?',
              [option.name, option.priceDelta, optionIndex, option.isActive ? 1 : 0, option.id],
            );
            keptOptionIds.push(option.id);
          } else {
            const [inserted] = await conn.execute<ResultSetHeader>(
              `INSERT INTO menu_options (group_id, name, price_delta, sort_order, is_active)
               VALUES (?, ?, ?, ?, ?)`,
              [groupId, option.name, option.priceDelta, optionIndex, option.isActive ? 1 : 0],
            );
            keptOptionIds.push(inserted.insertId);
          }
        }

        const removedOptions = [...ownedOptionIds].filter((id) => !keptOptionIds.includes(id));
        if (removedOptions.length > 0) {
          await conn.execute(
            `DELETE FROM menu_options WHERE id IN (${removedOptions.map(() => '?').join(',')})`,
            removedOptions,
          );
        }
      }

      const removedGroups = [...ownedGroupIds].filter((id) => !keptGroupIds.includes(id));
      if (removedGroups.length > 0) {
        await conn.execute(
          `DELETE FROM menu_option_groups WHERE id IN (${removedGroups.map(() => '?').join(',')})`,
          removedGroups,
        );
      }
      return { ok: true };
    });

    if (!saved.ok) return apiError(ERROR_CODES.VALIDATION_ERROR, saved.message, 409);

    const groups = await loadOptionGroups([menuItemId], false);
    return apiOk({ groups: groups.get(menuItemId) ?? [] });
  } catch (err) {
    return serverError(err, 'PUT /api/admin/menu-items/[id]/options');
  }
}
