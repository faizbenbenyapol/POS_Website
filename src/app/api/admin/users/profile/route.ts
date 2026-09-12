import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, serverError, ERROR_CODES } from '@/lib/api';
import { requireStaff, verifyPassword, hashPassword, setAuthCookie, createToken } from '@/lib/auth';
import { queryOne, execute } from '@/lib/db';
import { z } from 'zod';

/** Schema สำหรับการแก้ไขข้อมูลส่วนตัวและเปลี่ยนรหัสผ่าน */
const updateProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'ชื่อ-นามสกุลต้องมีความยาวอย่างน้อย 2 ตัวอักษร')
    .max(100, 'ชื่อ-นามสกุลต้องไม่เกิน 100 ตัวอักษร')
    .optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
  confirmPassword: z.string().optional(),
});

type UserProfileRow = RowDataPacket & {
  id: number;
  username: string;
  full_name: string;
  role: 'ADMIN' | 'STAFF';
  branch_id: number | null;
  branch_name: string | null;
  branch_code: string | null;
  created_at: string;
};

type UserStatsRow = RowDataPacket & {
  bills_closed: number;
  payments_received: number;
  total_received: string;
  tickets_handled: number;
};

/**
 * ดึงข้อมูลโปรไฟล์ของผู้ใช้ที่ล็อกอินอยู่ พร้อมสถิติการปฏิบัติงาน
 *
 * @returns ข้อมูลส่วนตัวของผู้ใช้และสถิติการทำงาน
 */
export async function GET() {
  try {
    const auth = await requireStaff();
    if (!auth.ok) return authFailureResponse(auth.reason);

    const userId = auth.user.id;

    const [userProfile, userStats] = await Promise.all([
      queryOne<UserProfileRow>(
        `SELECT u.id, u.username, u.full_name, u.role, u.branch_id, u.created_at,
                b.name AS branch_name, b.code AS branch_code
           FROM users u
           LEFT JOIN branches b ON b.id = u.branch_id
          WHERE u.id = ?
          LIMIT 1`,
        [userId],
      ),
      queryOne<UserStatsRow>(
        `SELECT
           (SELECT COUNT(*) FROM table_sessions WHERE closed_by = ?) AS bills_closed,
           (SELECT COUNT(*) FROM payments WHERE received_by = ?) AS payments_received,
           (SELECT COALESCE(SUM(total_amount), 0) FROM payments WHERE received_by = ?) AS total_received,
           (SELECT COUNT(*) FROM tickets WHERE created_by = ? OR assigned_to = ?) AS tickets_handled`,
        [userId, userId, userId, userId, userId],
      ),
    ]);

    if (!userProfile) {
      return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบข้อมูลผู้ใช้ในระบบ', 404);
    }

    return apiOk({
      profile: {
        id: userProfile.id,
        username: userProfile.username,
        fullName: userProfile.full_name,
        role: userProfile.role,
        branchId: userProfile.branch_id,
        branchName: userProfile.branch_name,
        branchCode: userProfile.branch_code,
        createdAt: userProfile.created_at,
      },
      stats: {
        billsClosed: Number(userStats?.bills_closed ?? 0),
        paymentsReceived: Number(userStats?.payments_received ?? 0),
        totalReceived: Number(userStats?.total_received ?? 0),
        ticketsHandled: Number(userStats?.tickets_handled ?? 0),
      },
    });
  } catch (err) {
    return serverError(err, 'GET /api/admin/users/profile');
  }
}

/**
 * แก้ไขชื่อ-นามสกุล หรือเปลี่ยนรหัสผ่านของผู้ใช้ปัจจุบัน
 * หากเปลี่ยนชื่อ จะออก JWT Token ชุดใหม่และอัปเดต Cookie ทันที
 *
 * @param request - คำขอแก้ไขข้อมูล { fullName?, currentPassword?, newPassword?, confirmPassword? }
 * @returns ผลการบันทึกข้อมูล
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireStaff();
    if (!auth.ok) return authFailureResponse(auth.reason);

    const body = await request.json().catch(() => null);
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง';
      return apiError(ERROR_CODES.VALIDATION_ERROR, firstError);
    }

    const { fullName, currentPassword, newPassword, confirmPassword } = parsed.data;
    const userId = auth.user.id;

    // ตรวจสอบกรณีเปลี่ยนรหัสผ่าน
    const isChangingPassword = Boolean(newPassword || currentPassword || confirmPassword);
    if (isChangingPassword) {
      if (!currentPassword) {
        return apiError(
          ERROR_CODES.VALIDATION_ERROR,
          'กรุณาระบุรหัสผ่านปัจจุบันเพื่อยืนยันตัวตน',
          400,
        );
      }
      if (!newPassword || newPassword.length < 6) {
        return apiError(
          ERROR_CODES.VALIDATION_ERROR,
          'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร',
          400,
        );
      }
      if (newPassword !== confirmPassword) {
        return apiError(
          ERROR_CODES.VALIDATION_ERROR,
          'รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน',
          400,
        );
      }

      // ตรวจสอบรหัสผ่านเดิมจากฐานข้อมูล
      const existing = await queryOne<RowDataPacket & { password_hash: string }>(
        'SELECT password_hash FROM users WHERE id = ? LIMIT 1',
        [userId],
      );
      if (!existing || !(await verifyPassword(currentPassword, existing.password_hash))) {
        return apiError(
          ERROR_CODES.VALIDATION_ERROR,
          'รหัสผ่านปัจจุบันไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่อีกครั้ง',
          400,
        );
      }

      const newHash = await hashPassword(newPassword);
      await execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);
    }

    // ตรวจสอบกรณีเปลี่ยนชื่อ-นามสกุล
    let effectiveFullName = auth.user.fullName;
    if (fullName && fullName !== auth.user.fullName) {
      effectiveFullName = fullName.trim();
      await execute('UPDATE users SET full_name = ? WHERE id = ?', [effectiveFullName, userId]);

      // อัปเดต Cookie เซสชันของผู้ใช้ทันที เพื่อให้ Navigation Bar แสดงชื่อใหม่โดยไม่ต้องเข้าสู่ระบบใหม่
      const refreshedToken = await createToken({
        id: auth.user.id,
        username: auth.user.username,
        fullName: effectiveFullName,
        role: auth.user.role,
        branchId: auth.user.branchId,
        branchName: auth.user.branchName,
      });
      await setAuthCookie(refreshedToken);
    }

    return apiOk({
      id: userId,
      fullName: effectiveFullName,
      message: isChangingPassword
        ? 'บันทึกข้อมูลและเปลี่ยนรหัสผ่านสำเร็จเรียบร้อยแล้ว'
        : 'บันทึกข้อมูลส่วนตัวเรียบร้อยแล้ว',
    });
  } catch (err) {
    return serverError(err, 'PUT /api/admin/users/profile');
  }
}
