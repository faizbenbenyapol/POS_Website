'use client';

import {
  CheckIcon,
  CloseIcon,
  CookingIcon,
  CreditCardIcon,
  DrinkIcon,
  MoneyIcon,
  PrintIcon,
} from '@/components/Icons';
import { isBarItem } from '@/components/ReceiptPrintModal';
import { formatBaht, formatThaiTime } from '@/lib/format';
import ActionMenu, { ActionMenuDivider, ActionMenuItem } from './ActionMenu';
import { getOrderAge } from './orderBoardUtils';
import { STATUS_LABELS, type BoardItem, type BoardOrder, type StationFilter } from './types';

/** คำสั่งหลัก 1 ปุ่มที่การ์ดจะโชว์ตามสถานะปัจจุบันของใบสั่ง */
type PrimaryAction = {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
};

/**
 * การ์ดออเดอร์ 1 ใบ รองรับทั้งมุมมองรายการปกติและมุมมองกระดานครัว (KDS)
 * แสดงเฉพาะ "คำสั่งถัดไป" เป็นปุ่มเดียวตามสถานะ ส่วนคำสั่งรองอย่างการพิมพ์ตั๋ว
 * และการยกเลิกถูกยุบไว้ในเมนูจุดสามจุด เพื่อลดจำนวนปุ่มบนจอช่วงร้านแน่น
 *
 * @param order - ใบสั่งที่จะแสดง
 * @param orderItems - รายการอาหารทั้งหมดของใบสั่งนี้
 * @param isKds - true เมื่อวางอยู่ในคอลัมน์ KDS ใช้ปรับสไตล์กรอบการ์ด
 * @param stationFilter - สถานีที่กำลังเลือกอยู่ ใช้หรี่รายการที่ไม่ใช่ของสถานีนั้น
 * @param canVoidOrder - true เมื่อผู้ใช้มีสิทธิ์ยกเลิกออเดอร์ทั้งใบ (เฉพาะ ADMIN)
 * @param canRefundBill - true เมื่อผู้ใช้มีสิทธิ์คืนเงินบิลที่ปิดไปแล้ว (เฉพาะ ADMIN)
 * @param onChangeOrderStatus - เปลี่ยนสถานะทั้งใบ รับ (order, status ใหม่)
 * @param onServeItem - ทำเครื่องหมายว่าอาหารจานนั้นเสิร์ฟแล้ว
 * @param onRequestCancelOrder - ขอยกเลิกทั้งใบ หน้าแม่จะเปิด modal ให้ระบุเหตุผล
 * @param onRequestCancelItem - ขอยกเลิกอาหารรายจาน หน้าแม่จะเปิด modal ให้ระบุเหตุผล
 * @param onDenyVoidOrder - เรียกเมื่อผู้ใช้ที่ไม่มีสิทธิ์กดยกเลิกทั้งใบ ใช้แจ้งเตือน
 * @param onRequestRefundBill - ขอคืนเงินบิลที่ปิดแล้ว หน้าแม่จะเปิด modal ให้ระบุเหตุผล
 * @param onDenyRefundBill - เรียกเมื่อผู้ใช้ที่ไม่มีสิทธิ์กดคืนเงิน ใช้แจ้งเตือน
 * @param onPrintTicket - เปิดหน้าพิมพ์ตั๋ว รับ (order, items, สถานีที่จะพิมพ์)
 * @param onCheckout - เปิด modal ปิดบิลของโต๊ะนี้
 * @param canCheckout - true เมื่อบทบาทนี้ปิดบิลได้ ครัวและบาร์จะไม่เห็นปุ่มปิดบิลเลย
 * @returns การ์ดออเดอร์พร้อมหัวบิล รายการอาหาร และแถบคำสั่งด้านล่าง
 */
export default function OrderCard({
  order,
  orderItems,
  isKds = false,
  stationFilter,
  canVoidOrder,
  canRefundBill,
  onChangeOrderStatus,
  onServeItem,
  onRequestCancelOrder,
  onRequestCancelItem,
  onDenyVoidOrder,
  onRequestRefundBill,
  onDenyRefundBill,
  onPrintTicket,
  onCheckout,
  canCheckout = true,
}: {
  order: BoardOrder;
  orderItems: BoardItem[];
  isKds?: boolean;
  stationFilter: StationFilter;
  canVoidOrder: boolean;
  canRefundBill: boolean;
  onChangeOrderStatus: (order: BoardOrder, status: string) => void;
  onServeItem: (item: BoardItem) => void;
  onRequestCancelOrder: (order: BoardOrder) => void;
  onRequestCancelItem: (item: BoardItem, order: BoardOrder) => void;
  onDenyVoidOrder: () => void;
  onRequestRefundBill: (order: BoardOrder) => void;
  onDenyRefundBill: () => void;
  onPrintTicket: (order: BoardOrder, orderItems: BoardItem[], station: StationFilter) => void;
  onCheckout: (order: BoardOrder) => void;
  canCheckout?: boolean;
}) {
  const status = STATUS_LABELS[order.status] ?? STATUS_LABELS.PENDING;
  const closed = order.session_status === 'CLOSED';
  const refunded = Boolean(order.session_refunded_at);
  const ageInfo = getOrderAge(order.created_at);
  const showAge = !closed && order.status !== 'SERVED' && order.status !== 'CANCELLED';

  const hasKitchen = orderItems.some(
    (i) =>
      !isBarItem({
        itemName: i.item_name,
        quantity: i.quantity,
        categoryName: i.category_name,
      }),
  );
  const hasBar = orderItems.some((i) =>
    isBarItem({
      itemName: i.item_name,
      quantity: i.quantity,
      categoryName: i.category_name,
    }),
  );

  /**
   * เลือกคำสั่งหลักเพียงคำสั่งเดียวตามสถานะของใบสั่ง
   * PENDING ต้องรับออเดอร์ก่อน, PREPARING ต้องเสิร์ฟ, SERVED ต้องเก็บเงิน
   *
   * @returns คำสั่งหลักที่จะแสดงเป็นปุ่มใหญ่ หรือ null เมื่อไม่มีขั้นถัดไป (เช่น ยกเลิกแล้ว)
   */
  function resolvePrimaryAction(): PrimaryAction | null {
    if (order.status === 'PENDING') {
      return {
        label: 'รับออเดอร์ เริ่มทำ',
        icon: <CookingIcon className="w-4 h-4" />,
        onClick: () => onChangeOrderStatus(order, 'PREPARING'),
      };
    }
    if (order.status === 'PREPARING') {
      return {
        label: 'เสิร์ฟครบทั้งใบแล้ว',
        icon: <CheckIcon className="w-4 h-4" />,
        onClick: () => onChangeOrderStatus(order, 'SERVED'),
      };
    }
    if (order.status === 'SERVED' && canCheckout) {
      return {
        label: 'ปิดบิล เก็บเงิน',
        icon: <CreditCardIcon className="w-4 h-4" />,
        onClick: () => onCheckout(order),
      };
    }
    return null;
  }

  const primaryAction = resolvePrimaryAction();

  return (
    <article
      className={`lm-card overflow-hidden transition-all duration-200 ${
        ageInfo.isUrgent && showAge ? 'border-amber-300 ring-2 ring-amber-400/30' : ''
      } ${isKds ? 'bg-white shadow-xs rounded-xl border border-zinc-200' : ''}`}
    >
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-rule bg-char px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 font-bold text-sm text-white shadow-xs">
            {order.table_no}
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-slip">โต๊ะ {order.table_no}</span>
              {order.order_type === 'TAKEAWAY' && (
                <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs font-bold text-orange-700">
                  กลับบ้าน
                </span>
              )}
              {order.branch_name && (
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold text-zinc-600">
                  {order.branch_name}
                </span>
              )}
              {refunded && (
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">
                  คืนเงินแล้ว
                </span>
              )}
            </div>
            <p className="num text-xs text-slip-dim">
              {order.order_code} · {formatThaiTime(order.created_at)}
            </p>
          </div>
        </div>

        {/* ป้ายเตือนระยะเวลารอ */}
        {showAge && (
          <span className={`rounded-full border px-2 py-0.5 text-xs ${ageInfo.badgeClass}`}>
            {ageInfo.label}
          </span>
        )}

        <span className={`ml-auto rounded-full px-2.5 py-0.5 font-bold text-xs ${status.className}`}>
          {status.label}
        </span>
        <span className="num text-base font-bold text-emerald-700">
          {formatBaht(order.total_amount)}
        </span>
      </header>

      <ul className="px-3 py-2 divide-y divide-rule/60">
        {orderItems.map((item) => {
          const itemStatus = STATUS_LABELS[item.status] ?? STATUS_LABELS.PENDING;
          const isBar = isBarItem({
            itemName: item.item_name,
            quantity: item.quantity,
            categoryName: item.category_name,
          });
          const matchesActiveStation =
            stationFilter === 'ALL' ||
            (stationFilter === 'BAR' && isBar) ||
            (stationFilter === 'KITCHEN' && !isBar);

          return (
            <li
              key={item.id}
              className={`flex flex-wrap items-center gap-x-2.5 gap-y-1.5 py-2 first:pt-0 last:pb-0 transition-opacity ${
                matchesActiveStation ? 'opacity-100' : 'opacity-40 bg-zinc-50/40 rounded px-1'
              }`}
            >
              <span className="num font-black text-sm text-slip-dim">×{item.quantity}</span>
              <div className="min-w-0 flex-1 flex items-center gap-1.5">
                <span className="font-semibold text-sm text-slip">{item.item_name}</span>
                {isBar ? (
                  <span className="inline-flex items-center gap-0.5 rounded bg-cyan-50 px-1.5 py-0.5 text-xs font-bold text-cyan-800 border border-cyan-200 shrink-0">
                    <DrinkIcon className="w-3 h-3" />
                    บาร์
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200 shrink-0">
                    <CookingIcon className="w-3 h-3" />
                    ครัว
                  </span>
                )}
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${itemStatus.className}`}>
                {itemStatus.label}
              </span>
              {!closed && item.status !== 'CANCELLED' && (
                <div className="flex items-center gap-1">
                  {item.status !== 'SERVED' && (
                    <button
                      type="button"
                      onClick={() => onServeItem(item)}
                      className="min-h-[36px] rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 text-sm font-bold hover:bg-emerald-100 transition-colors cursor-pointer"
                    >
                      เสิร์ฟ
                    </button>
                  )}
                  {/* ยกเลิกรายจานถูกยุบไว้ในเมนู ไม่ให้อยู่ติดปุ่มเสิร์ฟจนกดพลาด */}
                  <ActionMenu title={`คำสั่งเพิ่มเติมของ ${item.item_name}`}>
                    <ActionMenuItem
                      icon={<CloseIcon className="w-4 h-4" />}
                      label="ยกเลิกรายการนี้"
                      hint="ต้องระบุเหตุผลเพื่อบันทึกประวัติ"
                      tone="danger"
                      onClick={() => onRequestCancelItem(item, order)}
                    />
                  </ActionMenu>
                </div>
              )}
              {item.options_text && (
                <p className="w-full text-xs font-bold text-slip pl-5">+ {item.options_text}</p>
              )}
              {item.note && (
                <p className="w-full text-xs font-bold text-amber-700 pl-5">
                  * หมายเหตุ: {item.note}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <footer className="flex flex-wrap items-center gap-2 border-t border-rule px-3 py-2.5 bg-slate-50/60">
        {closed ? (
          <>
            <p className="text-xs text-slip-dim py-1">
              {refunded
                ? 'บิลของโต๊ะนี้ถูกคืนเงินแล้ว เป็นโมฆะทั้งใบ'
                : 'บิลของโต๊ะนี้ปิดแล้ว แก้ไขไม่ได้'}
            </p>

            {/* คืนเงินเป็นทางเดียวที่แก้บิลซึ่งปิดไปแล้วได้ จึงยังต้องมีให้กดถึงแม้บิลจะล็อกอยู่ */}
            {!refunded && (
              <div className="ml-auto">
                <ActionMenu label="อื่น ๆ">
                  <ActionMenuItem
                    icon={<MoneyIcon className="w-4 h-4" />}
                    label="คืนเงิน ยกเลิกบิลใบนี้"
                    hint={canRefundBill ? 'ต้องระบุเหตุผล' : 'เฉพาะเจ้าของร้าน (ADMIN)'}
                    tone="danger"
                    onClick={() => {
                      if (!canRefundBill) {
                        onDenyRefundBill();
                        return;
                      }
                      onRequestRefundBill(order);
                    }}
                  />
                </ActionMenu>
              </div>
            )}
          </>
        ) : (
          <>
            {primaryAction && (
              <button
                type="button"
                onClick={primaryAction.onClick}
                className="min-h-[42px] flex-1 sm:flex-none rounded-xl bg-emerald-600 px-4 font-bold text-sm text-white shadow-xs hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {primaryAction.icon}
                <span>{primaryAction.label}</span>
              </button>
            )}

            {/* คำสั่งรองทั้งหมดอยู่ในเมนูเดียว เหลือปุ่มบนการ์ดแค่คำสั่งถัดไป */}
            <ActionMenu label="อื่น ๆ" align="left">
              {hasKitchen && (
                <ActionMenuItem
                  icon={<CookingIcon className="w-4 h-4 text-amber-700" />}
                  label="พิมพ์ตั๋วครัว"
                  hint="เฉพาะรายการอาหาร"
                  onClick={() => onPrintTicket(order, orderItems, 'KITCHEN')}
                />
              )}
              {hasBar && (
                <ActionMenuItem
                  icon={<DrinkIcon className="w-4 h-4 text-cyan-700" />}
                  label="พิมพ์ตั๋วบาร์"
                  hint="เฉพาะรายการเครื่องดื่ม"
                  onClick={() => onPrintTicket(order, orderItems, 'BAR')}
                />
              )}
              <ActionMenuItem
                icon={<PrintIcon className="w-4 h-4" />}
                label="พิมพ์ตั๋วรวม"
                hint="ทุกรายการในใบสั่งนี้"
                onClick={() => onPrintTicket(order, orderItems, 'ALL')}
              />
              {order.status !== 'SERVED' && canCheckout && (
                <ActionMenuItem
                  icon={<CreditCardIcon className="w-4 h-4" />}
                  label="ปิดบิล เก็บเงิน"
                  onClick={() => onCheckout(order)}
                />
              )}
              {order.status !== 'CANCELLED' && (
                <>
                  <ActionMenuDivider />
                  <ActionMenuItem
                    icon={<CloseIcon className="w-4 h-4" />}
                    label="ยกเลิกออเดอร์ทั้งใบ"
                    hint={canVoidOrder ? 'ต้องระบุเหตุผล' : 'เฉพาะเจ้าของร้าน (ADMIN)'}
                    tone="danger"
                    onClick={() => {
                      if (!canVoidOrder) {
                        onDenyVoidOrder();
                        return;
                      }
                      onRequestCancelOrder(order);
                    }}
                  />
                </>
              )}
            </ActionMenu>
          </>
        )}
      </footer>
    </article>
  );
}
