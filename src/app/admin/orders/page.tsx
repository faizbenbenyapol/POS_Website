'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ReceiptPrintModal, { ReceiptData, isBarItem } from '@/components/ReceiptPrintModal';
import CancelReasonModal, { REFUND_REASONS } from '@/components/CancelReasonModal';
import CancellationAuditModal from '@/components/CancellationAuditModal';
import { TableSkeleton, EmptyState, ErrorState, Notice } from '@/components/DataState';
import { useToast } from '@/components/Toast';
import { apiFetch, jsonBody } from '@/lib/client';
import { downloadCsvFile } from '@/lib/exportCsv';
import { formatBaht, formatBahtWithSign, formatThaiTime } from '@/lib/format';
import type { BillTotals, DiscountInput, PaymentInput } from '@/lib/billing';
import { ChevronDownIcon, ChevronUpIcon, CookingIcon, DrinkIcon } from '@/components/Icons';
import OrderToolbar from '@/components/admin/orders/OrderToolbar';
import OrderCard from '@/components/admin/orders/OrderCard';
import CheckoutModal from '@/components/admin/orders/CheckoutModal';
import SoundSettings from '@/components/admin/orders/SoundSettings';
import { playNewOrderSound, type SoundTone } from '@/components/admin/orders/orderSound';
import {
  computeKitchenPrepSummary,
  todayInputValue,
} from '@/components/admin/orders/orderBoardUtils';
import {
  STATUS_LABELS,
  type BoardItem,
  type BoardOrder,
  type BoardViewMode,
  type StationFilter,
} from '@/components/admin/orders/types';

/**
 * กระดานออเดอร์ฝั่งร้าน จัดแบบกองใบสั่งเรียงใหม่สุดขึ้นบน
 * ดึงข้อมูลใหม่ทุก 10 วินาทีด้วยการ poll ธรรมดาตามข้อกำหนดหัวข้อ 10
 *
 * @returns หน้าจอกระดานออเดอร์พร้อมปุ่มเปลี่ยนสถานะและปิดบิล
 */
function OrdersBoardContent() {
  const searchParams = useSearchParams();
  const urlTableNo = searchParams.get('tableNo') ?? '';

  const [orders, setOrders] = useState<BoardOrder[] | null>(null);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState(todayInputValue());
  const [tableFilter, setTableFilter] = useState(urlTableNo);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string }>({
    tone: 'success',
    message: '',
  });
  const [checkoutOrder, setCheckoutOrder] = useState<BoardOrder | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printType, setPrintType] = useState<'KITCHEN' | 'RECEIPT'>('KITCHEN');
  const [printStation, setPrintStation] = useState<StationFilter>('ALL');
  const [printData, setPrintData] = useState<ReceiptData | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundTone, setSoundTone] = useState<SoundTone>('CHIME');
  const [soundVolume, setSoundVolume] = useState<number>(0.6);
  const [showSoundSettings, setShowSoundSettings] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<{ role: string; fullName: string } | null>(null);
  const [cancelConfirmOrder, setCancelConfirmOrder] = useState<BoardOrder | null>(null);
  const [refundTarget, setRefundTarget] = useState<BoardOrder | null>(null);
  const [cancelItemTarget, setCancelItemTarget] = useState<{ item: BoardItem; order: BoardOrder } | null>(null);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const { warning: toastWarning } = useToast();
  const knownOrderIdsRef = useRef<Set<number> | null>(null);

  // ตัวกรองสถานีครัว vs บาร์
  const [stationFilter, setStationFilter] = useState<StationFilter>('ALL');

  // การแสดงผลและการควบคุมการรีเฟรช
  const [viewMode, setViewMode] = useState<BoardViewMode>('LIST');
  const [refreshIntervalSec, setRefreshIntervalSec] = useState<number>(10);
  const [countdown, setCountdown] = useState<number>(10);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [showPrepSummary, setShowPrepSummary] = useState<boolean>(true);
  const [_timeTick, setTimeTick] = useState<number>(Date.now());

  // โหลดการตั้งค่าเสียงจาก localStorage ตอนเปิดหน้า
  useEffect(() => {
    try {
      const savedTone = localStorage.getItem('pos_order_sound_tone') as SoundTone | null;
      if (savedTone && (savedTone === 'CHIME' || savedTone === 'BELL' || savedTone === 'ALERT')) {
        setSoundTone(savedTone);
      }
      const savedVol = localStorage.getItem('pos_order_sound_vol');
      if (savedVol !== null) {
        setSoundVolume(Math.max(0, Math.min(1, Number(savedVol))));
      }
      const savedEnabled = localStorage.getItem('pos_order_sound_enabled');
      if (savedEnabled !== null) {
        setSoundEnabled(savedEnabled === 'true');
      }
    } catch {
      // ป้องกันกรณีเบราว์เซอร์ไม่อนุญาต localStorage
    }
  }, []);

  /**
   * สลับเปิด/ปิดเสียงเตือน พร้อมบันทึกสถานะ
   *
   * @returns ไม่คืนค่า มีผลข้างเคียงคือเขียน localStorage และเล่นเสียงตัวอย่างเมื่อเปิด
   */
  function handleToggleSound() {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('pos_order_sound_enabled', String(next));
      } catch {}
      if (next) playNewOrderSound(soundTone, soundVolume);
      return next;
    });
  }

  /**
   * เปลี่ยนโทนเสียงเตือน พร้อมบันทึกและเล่นตัวอย่าง
   *
   * @param tone - โทนเสียงที่เลือกใหม่
   */
  function handleChangeTone(tone: SoundTone) {
    setSoundTone(tone);
    try {
      localStorage.setItem('pos_order_sound_tone', tone);
    } catch {}
    playNewOrderSound(tone, soundVolume);
  }

  /**
   * ปรับระดับความดัง พร้อมบันทึก
   *
   * @param vol - ระดับความดังใหม่ (0.0 ถึง 1.0)
   */
  function handleChangeVolume(vol: number) {
    setSoundVolume(vol);
    try {
      localStorage.setItem('pos_order_sound_vol', String(vol));
    } catch {}
  }

  /**
   * เปิด Modal สำหรับพิมพ์ตั๋วครัวของออเดอร์
   *
   * @param order - ข้อมูลใบสั่งอาหาร
   * @param orderItems - รายการอาหารในใบสั่ง
   * @param targetStation - สถานีที่ต้องการพิมพ์ ('ALL' | 'KITCHEN' | 'BAR')
   */
  function handleOpenKitchenPrint(
    order: BoardOrder,
    orderItems: BoardItem[],
    targetStation: StationFilter = 'ALL',
  ) {
    setPrintStation(targetStation);
    setPrintType('KITCHEN');
    setPrintData({
      branchName: order.branch_name || undefined,
      branchAddress: order.branch_address || undefined,
      branchPhone: order.branch_phone || undefined,
      tableNo: order.table_no,
      orderCode: order.order_code,
      createdAt: order.created_at,
      items: orderItems
        .filter((i) => i.status !== 'CANCELLED')
        .map((i) => ({
          itemName: i.item_name,
          quantity: i.quantity,
          note: i.note,
          categoryName: i.category_name,
        })),
    });
    setPrintModalOpen(true);
  }

  /**
   * โหลดกระดานใหม่ตามตัวกรองปัจจุบัน
   *
   * @param showSkeleton - true ตอนเปิดหน้าหรือเปลี่ยนตัวกรอง ให้โชว์โครงร่าง
   *                       false ตอน poll ตามรอบ เพื่อไม่ให้กระดานกะพริบขณะพนักงานกำลังอ่าน
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือปรับ state ของกระดาน
   */
  const load = useCallback(
    async (showSkeleton: boolean) => {
      if (showSkeleton) {
        setOrders(null);
        setLoadError('');
      }
      setIsSyncing(true);
      const params = new URLSearchParams({
        status: statusFilter,
        date: dateFilter,
        tableNo: tableFilter.trim(),
      });
      const result = await apiFetch<{ orders: BoardOrder[]; items: BoardItem[] }>(
        `/api/admin/orders?${params.toString()}`,
      );
      setIsSyncing(false);
      if (!result.ok) {
        if (showSkeleton) setLoadError(result.message);
        return;
      }

      setLastSyncTime(formatThaiTime(new Date().toISOString()));
      setCountdown(refreshIntervalSec > 0 ? refreshIntervalSec : 0);

      const newOrders = result.data.orders;
      if (knownOrderIdsRef.current !== null && soundEnabled) {
        const hasNewOrder = newOrders.some((o) => !knownOrderIdsRef.current!.has(o.id));
        if (hasNewOrder) {
          playNewOrderSound(soundTone, soundVolume);
          setNotice({
            tone: 'success',
            message: 'มีออเดอร์ใหม่เข้ามาที่หน้ากระดาน!',
          });
        }
      }
      knownOrderIdsRef.current = new Set(newOrders.map((o) => o.id));

      setOrders(newOrders);
      setItems(result.data.items);
    },
    [statusFilter, dateFilter, tableFilter, soundEnabled, soundTone, soundVolume, refreshIntervalSec],
  );

  useEffect(() => {
    load(true);
    apiFetch<{ role: string; fullName: string }>('/api/auth/me').then((res) => {
      if (res.ok) setCurrentUser(res.data);
    });
  }, [load]);

  // ตัวนับเวลาถอยหลังการดึงข้อมูลและอัปเดตอายุออเดอร์
  useEffect(() => {
    const timer = window.setInterval(() => {
      setTimeTick(Date.now());

      if (refreshIntervalSec > 0) {
        setCountdown((prev) => {
          if (prev <= 1) {
            load(false);
            return refreshIntervalSec;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [refreshIntervalSec, load]);

  /**
   * เปลี่ยนสถานะของใบสั่งทั้งใบด้วยการกดครั้งเดียว
   *
   * @param order - ใบสั่งที่จะเปลี่ยนสถานะ
   * @param status - สถานะใหม่
   * @param reason - เหตุผลการยกเลิก (ถ้ามี)
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือเขียนสถานะลงฐานข้อมูลและรีโหลดกระดาน
   */
  async function changeOrderStatus(order: BoardOrder, status: string, reason?: string) {
    const result = await apiFetch(`/api/admin/orders/${order.id}`, {
      method: 'PATCH',
      body: jsonBody({ status, reason }),
    });
    if (!result.ok) {
      setNotice({ tone: 'error', message: result.message });
      return;
    }
    load(false);
  }

  /**
   * เปลี่ยนสถานะอาหารรายจาน ใช้ตอนบางจานเสร็จก่อนหรือทำจานนั้นไม่ได้
   *
   * @param item - รายการอาหารที่จะเปลี่ยนสถานะ
   * @param status - สถานะใหม่
   * @param reason - เหตุผลการยกเลิก (ถ้ามี)
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือเขียนสถานะลงฐานข้อมูลและรีโหลดกระดาน
   */
  async function changeItemStatus(item: BoardItem, status: string, reason?: string) {
    const result = await apiFetch(`/api/admin/order-items/${item.id}`, {
      method: 'PATCH',
      body: jsonBody({ status, reason }),
    });
    if (!result.ok) {
      setNotice({ tone: 'error', message: result.message });
      return;
    }
    load(false);
  }

  /**
   * รวบรวมใบสั่งและรายการอาหารทั้งหมดของรอบการนั่งที่กำลังจะปิดบิล
   *
   * @param order - ใบสั่งที่กดปิดบิล ใช้อ้างอิง session_id
   * @returns ใบสั่งในรอบ รายการอาหารที่ยังไม่ถูกยกเลิก และยอดรวมสุทธิหน่วยบาท
   */
  function getCheckoutContext(order: BoardOrder) {
    const sessionOrders = orders?.filter((o) => o.session_id === order.session_id) ?? [];
    const sessionOrderIds = new Set(sessionOrders.map((o) => o.id));
    const sessionItems = items.filter(
      (i) => sessionOrderIds.has(i.order_id) && i.status !== 'CANCELLED',
    );
    const total = sessionItems.reduce((sum, i) => sum + Number(i.unit_price) * i.quantity, 0);
    return { sessionOrders, sessionItems, total };
  }

  /**
   * ปิดบิลของโต๊ะ บันทึกการชำระเงินแล้วปิดรอบการนั่งให้โต๊ะกลับมาว่าง
   *
   * ส่งขึ้นไปเฉพาะ "เจตนา" คือช่องทางที่แบ่งจ่ายและส่วนลดที่ให้ ไม่ส่งยอดที่คำนวณเอง
   * เซิร์ฟเวอร์จะคิดยอดใหม่ทั้งใบแล้วคืนยอดจริงกลับมาใช้พิมพ์ใบเสร็จ
   *
   * @param payments - ช่องทางการชำระเงินที่แคชเชียร์กรอก อาจมีมากกว่า 1 ช่องทาง
   * @param discount - ส่วนลดของบิล type เป็น NONE เมื่อไม่มีส่วนลด
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือบันทึก payments เปิดหน้าพิมพ์ใบเสร็จ และรีโหลดกระดาน
   */
  async function handleCheckout(payments: PaymentInput[], discount: DiscountInput) {
    if (!checkoutOrder) return;
    const { sessionItems } = getCheckoutContext(checkoutOrder);

    setCheckingOut(true);
    const result = await apiFetch<{
      total: number;
      bill: BillTotals;
      changeDue: number;
      payments: PaymentInput[];
    }>(`/api/admin/sessions/${checkoutOrder.session_id}/checkout`, {
      method: 'POST',
      body: jsonBody({
        payments: payments.map((p) => ({
          method: p.method,
          amount: p.amount,
          receivedAmount: p.receivedAmount ?? null,
        })),
        discount: {
          type: discount.type,
          value: discount.value,
          reason: discount.reason ?? undefined,
        },
      }),
    });
    setCheckingOut(false);

    if (!result.ok) {
      setNotice({ tone: 'error', message: result.message });
      return;
    }

    const bill = result.data.bill;

    setNotice({
      tone: 'success',
      message: `ปิดบิลโต๊ะ ${checkoutOrder.table_no} แล้ว เก็บเงิน ${formatBahtWithSign(result.data.total)} โต๊ะกลับมาว่างพร้อมรับลูกค้ากลุ่มใหม่`,
    });

    setPrintType('RECEIPT');
    setPrintData({
      branchName: checkoutOrder.branch_name || undefined,
      branchAddress: checkoutOrder.branch_address || undefined,
      branchPhone: checkoutOrder.branch_phone || undefined,
      tableNo: checkoutOrder.table_no,
      createdAt: checkoutOrder.created_at,
      items: sessionItems.map((i) => ({
        itemName: i.item_name,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        note: i.note,
      })),
      totalAmount: bill.grandTotal,
      bill,
      payments: result.data.payments.map((p) => ({
        method: p.method,
        amount: p.amount,
        receivedAmount: p.receivedAmount ?? null,
        changeAmount:
          p.method === 'CASH' ? Math.max(0, Number(p.receivedAmount ?? p.amount) - p.amount) : 0,
      })),
      orderCode: checkoutOrder.order_code,
      paidAt: new Date().toISOString(),
      cashierName: currentUser?.fullName,
    });
    setCheckoutOrder(null);
    setPrintModalOpen(true);
    load(false);
  }

  /**
   * คืนเงินบิลที่ปิดไปแล้วทั้งใบ ใช้ตอนแคชเชียร์ปิดผิดโต๊ะหรือเก็บเงินเกิน
   *
   * เซิร์ฟเวอร์จะบันทึกแถวคืนเงินเป็นยอดติดลบตามช่องทางที่เคยรับมา
   * แล้วทำเครื่องหมายว่าบิลใบนั้นเป็นโมฆะ ไม่มีการลบข้อมูลเดิมทิ้ง
   *
   * @param order - ใบสั่งที่กดคืนเงิน ใช้อ้างอิง session_id ของบิลที่จะคืน
   * @param reason - เหตุผลการคืนเงิน บังคับกรอกเพื่อบันทึกลง Audit Log
   * @returns ไม่คืนค่า มีผลข้างเคียงคือบันทึกการคืนเงินและรีโหลดกระดาน
   */
  async function handleRefundBill(order: BoardOrder, reason: string) {
    const result = await apiFetch<{ refundAmount: number; tableNo: string }>(
      `/api/admin/sessions/${order.session_id}/refund`,
      { method: 'POST', body: jsonBody({ reason }) },
    );
    if (!result.ok) {
      setNotice({ tone: 'error', message: result.message });
      return;
    }
    setNotice({
      tone: 'success',
      message: `คืนเงินบิลโต๊ะ ${result.data.tableNo} แล้ว ${formatBahtWithSign(result.data.refundAmount)} บิลใบนี้เป็นโมฆะและถูกหักออกจากยอดขายวันนี้`,
    });
    load(false);
  }

  /**
   * แจ้งเตือนเมื่อพนักงานที่ไม่ใช่เจ้าของร้านพยายามคืนเงินบิลที่ปิดแล้ว
   *
   * @returns ไม่คืนค่า มีผลข้างเคียงคือแสดง toast เตือนสิทธิ์
   */
  function handleDenyRefundBill() {
    toastWarning(
      'สงวนสิทธิ์เฉพาะเจ้าของร้าน (ADMIN)',
      'หากต้องคืนเงินบิลที่ปิดไปแล้ว กรุณาแจ้งผู้จัดการ',
    );
  }

  /**
   * แจ้งเตือนเมื่อพนักงานที่ไม่ใช่เจ้าของร้านพยายามยกเลิกออเดอร์ทั้งใบ
   *
   * @returns ไม่คืนค่า มีผลข้างเคียงคือแสดง toast เตือนสิทธิ์
   */
  function handleDenyVoidOrder() {
    toastWarning(
      'สงวนสิทธิ์เฉพาะเจ้าของร้าน (ADMIN)',
      'หากจำเป็นต้องยกเลิกออเดอร์ทั้งใบ กรุณาแจ้งผู้จัดการ',
    );
  }

  /**
   * สร้างและดาวน์โหลดไฟล์ CSV สำหรับรายการออเดอร์ตามตัวกรองปัจจุบัน
   *
   * @returns ไม่คืนค่า มีผลข้างเคียงคือสั่งให้เบราว์เซอร์ดาวน์โหลดไฟล์
   */
  function handleExportOrdersCsv() {
    if (!orders || orders.length === 0) return;
    const filename = `orders-report-${dateFilter || 'all'}.csv`;
    const headers = [
      'รหัสออเดอร์',
      'สาขา',
      'เลขโต๊ะ',
      'วันเวลาที่สั่ง',
      'สถานะออเดอร์',
      'รายการอาหารทั้งหมด',
      'ยอดรวม (บาท)',
      'สถานะรอบโต๊ะ',
    ];

    const rows = orders.map((order) => {
      const orderItems = items.filter((i) => i.order_id === order.id);
      const itemsSummary = orderItems
        .map((i) => `${i.quantity}x ${i.item_name}${i.note ? ` (${i.note})` : ''}`)
        .join(' | ');

      const statusObj = STATUS_LABELS[order.status] ?? STATUS_LABELS.PENDING;

      return [
        order.order_code,
        order.branch_name || '-',
        order.table_no,
        formatThaiTime(order.created_at),
        statusObj.label,
        itemsSummary,
        order.total_amount,
        order.session_status === 'CLOSED' ? 'ปิดบิลแล้ว' : 'กำลังเปิด',
      ];
    });

    downloadCsvFile(filename, headers, rows);
  }

  const prepSummary = computeKitchenPrepSummary(orders, items, stationFilter);
  const totalPrepDishes = prepSummary.reduce((sum, p) => sum + p.quantity, 0);

  // คำนวณยอดค้างทำแยกตามแผนกสำหรับป้าย Badge บนแท็บสถานี
  const kitchenPendingCount = items
    .filter(
      (i) =>
        (i.status === 'PENDING' || i.status === 'PREPARING') &&
        !isBarItem({
          itemName: i.item_name,
          quantity: i.quantity,
          categoryName: i.category_name,
        }),
    )
    .reduce((sum, i) => sum + i.quantity, 0);

  const barPendingCount = items
    .filter(
      (i) =>
        (i.status === 'PENDING' || i.status === 'PREPARING') &&
        isBarItem({
          itemName: i.item_name,
          quantity: i.quantity,
          categoryName: i.category_name,
        }),
    )
    .reduce((sum, i) => sum + i.quantity, 0);

  const totalPendingDishes = kitchenPendingCount + barPendingCount;

  // กรองออเดอร์ตามสถานีที่เลือก
  const displayOrders = orders
    ? orders.filter((o) => {
        if (stationFilter === 'ALL') return true;
        const orderItems = items.filter((i) => i.order_id === o.id);
        return orderItems.some((i) => {
          const isBar = isBarItem({
            itemName: i.item_name,
            quantity: i.quantity,
            categoryName: i.category_name,
          });
          return stationFilter === 'BAR' ? isBar : !isBar;
        });
      })
    : null;

  /**
   * เรนเดอร์การ์ดออเดอร์ 1 ใบ โดยส่ง handler ทั้งหมดที่การ์ดต้องใช้ให้ครบ
   *
   * @param order - ใบสั่งที่จะแสดง
   * @param isKds - true เมื่อวางอยู่ในคอลัมน์ KDS
   * @returns การ์ดออเดอร์พร้อมใช้งาน
   */
  function renderOrderCard(order: BoardOrder, isKds: boolean = false) {
    return (
      <OrderCard
        key={order.id}
        order={order}
        orderItems={items.filter((item) => item.order_id === order.id)}
        isKds={isKds}
        stationFilter={stationFilter}
        canVoidOrder={currentUser?.role === 'ADMIN'}
        canRefundBill={currentUser?.role === 'ADMIN'}
        onChangeOrderStatus={changeOrderStatus}
        onServeItem={(item) => changeItemStatus(item, 'SERVED')}
        onRequestCancelOrder={setCancelConfirmOrder}
        onRequestCancelItem={(item, itemOrder) => setCancelItemTarget({ item, order: itemOrder })}
        onDenyVoidOrder={handleDenyVoidOrder}
        onRequestRefundBill={setRefundTarget}
        onDenyRefundBill={handleDenyRefundBill}
        onPrintTicket={handleOpenKitchenPrint}
        onCheckout={setCheckoutOrder}
      />
    );
  }

  const checkoutContext = checkoutOrder ? getCheckoutContext(checkoutOrder) : null;

  return (
    <div className="flex flex-col gap-4">
      <OrderToolbar
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        lastSyncTime={lastSyncTime}
        countdown={countdown}
        refreshIntervalSec={refreshIntervalSec}
        onChangeRefreshInterval={(seconds) => {
          setRefreshIntervalSec(seconds);
          setCountdown(seconds);
        }}
        isSyncing={isSyncing}
        onManualRefresh={() => load(false)}
        statusFilter={statusFilter}
        onChangeStatusFilter={setStatusFilter}
        dateFilter={dateFilter}
        onChangeDateFilter={setDateFilter}
        tableFilter={tableFilter}
        onChangeTableFilter={setTableFilter}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        soundSettingsOpen={showSoundSettings}
        onToggleSoundSettings={() => setShowSoundSettings((prev) => !prev)}
        canExport={Boolean(orders && orders.length > 0)}
        onExportCsv={handleExportOrdersCsv}
        isAdmin={currentUser?.role === 'ADMIN'}
        onOpenAuditLog={() => setAuditModalOpen(true)}
      />

      {/* แผงควบคุมเสียงแจ้งเตือน เปิดจากเมนูตั้งค่ากระดาน */}
      {showSoundSettings && (
        <SoundSettings
          tone={soundTone}
          volume={soundVolume}
          onChangeTone={handleChangeTone}
          onChangeVolume={handleChangeVolume}
        />
      )}

      {/* แถบตัวกรองสถานี: ทุกแผนก / ครัวอาหาร / บาร์เครื่องดื่ม */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2">
        <div className="flex items-center rounded-xl bg-zinc-100 p-1 border border-zinc-200 shadow-2xs">
          <button
            type="button"
            onClick={() => setStationFilter('ALL')}
            className={`flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-sm font-bold transition-all cursor-pointer ${
              stationFilter === 'ALL'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <span>ทุกแผนก</span>
            <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-700 font-mono">
              {totalPendingDishes}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setStationFilter('KITCHEN')}
            className={`flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-sm font-bold transition-all cursor-pointer ${
              stationFilter === 'KITCHEN'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <CookingIcon className="w-4 h-4" />
            <span>ครัวอาหาร</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs font-mono ${
                stationFilter === 'KITCHEN' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {kitchenPendingCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setStationFilter('BAR')}
            className={`flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-sm font-bold transition-all cursor-pointer ${
              stationFilter === 'BAR'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <DrinkIcon className="w-4 h-4" />
            <span>บาร์เครื่องดื่ม</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs font-mono ${
                stationFilter === 'BAR' ? 'bg-cyan-700 text-white' : 'bg-cyan-100 text-cyan-800'
              }`}
            >
              {barPendingCount}
            </span>
          </button>
        </div>

        <div className="text-sm text-slip-dim">
          {stationFilter === 'ALL' && 'แสดงรายการทั้งแผนกครัวอาหารและบาร์เครื่องดื่ม'}
          {stationFilter === 'KITCHEN' && 'แสดงเฉพาะคิวจานอาหารของครัว'}
          {stationFilter === 'BAR' && 'แสดงเฉพาะคิวแก้วเครื่องดื่มของบาร์น้ำ'}
        </div>
      </div>

      {/* แถบสรุปรายการอาหารค้างปรุงสำหรับห้องครัวและบาร์น้ำ */}
      <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50/40 p-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white shadow-xs">
              <CookingIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900">
                  {stationFilter === 'KITCHEN'
                    ? 'สรุปคิวที่ต้องปรุง (ครัวอาหาร)'
                    : stationFilter === 'BAR'
                    ? 'สรุปคิวที่ต้องทำ (บาร์เครื่องดื่ม)'
                    : 'สรุปคิวที่ต้องเตรียม (ครัว & บาร์)'}
                </span>
                <span className="rounded-full bg-amber-600 px-2 py-0.5 text-xs font-extrabold text-white">
                  รวม {totalPrepDishes} รายการ ({prepSummary.length} เมนู)
                </span>
              </div>
              <p className="text-xs text-zinc-600">
                รวบรวมรายการที่รอคิวและกำลังทำ ช่วยให้ครัว/บาร์จัดเตรียมวัตถุดิบและทำพร้อมกันเป็นชุดได้เร็วขึ้น
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowPrepSummary((prev) => !prev)}
            className="flex min-h-[38px] items-center gap-1 rounded-lg bg-white border border-amber-200 px-3 text-sm font-bold text-amber-900 hover:bg-amber-100/60 transition-colors cursor-pointer"
          >
            <span>{showPrepSummary ? 'ย่อแถบสรุป' : 'ขยายดูรายละเอียด'}</span>
            {showPrepSummary ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
          </button>
        </div>

        {showPrepSummary && (
          <div className="mt-3 pt-2.5 border-t border-amber-200/60">
            {prepSummary.length === 0 ? (
              <p className="py-2 text-center text-sm font-medium text-emerald-800">
                เคลียร์ออเดอร์ครบถ้วนแล้ว ไม่มีรายการค้างทำในขณะนี้
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {prepSummary.map((item) => (
                  <div
                    key={item.name}
                    className="flex flex-col justify-between rounded-lg border border-amber-200 bg-white p-2.5 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-bold text-sm text-slate-800 line-clamp-2 leading-tight">
                          {item.name}
                        </span>
                        {item.isBar ? (
                          <span className="text-xs font-bold text-cyan-700">บาร์น้ำ</span>
                        ) : (
                          <span className="text-xs font-bold text-amber-700">ครัว</span>
                        )}
                      </div>
                      <span className="flex-shrink-0 rounded-md bg-amber-600 px-1.5 py-0.5 text-sm font-black text-white">
                        ×{item.quantity}
                      </span>
                    </div>
                    <div className="mt-2 text-xs font-semibold text-amber-900/80">
                      โต๊ะ: {item.tables.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Notice
        tone={notice.tone}
        message={notice.message}
        onDismiss={() => setNotice({ tone: 'success', message: '' })}
      />

      {loadError && <ErrorState message={loadError} onRetry={() => load(true)} />}
      {!loadError && orders === null && <TableSkeleton rows={4} />}
      {!loadError && orders !== null && orders.length === 0 && (
        <EmptyState
          message="ยังไม่มีออเดอร์ตามเงื่อนไขที่เลือก — เปิดหน้าโต๊ะจากหน้าจัดการโต๊ะเพื่อทดสอบสั่งอาหาร"
          action={
            <Link
              href="/admin/tables"
              className="flex min-h-[44px] items-center rounded-lg bg-griddle px-4 text-sm text-slip shadow-sm"
            >
              ไปหน้าโต๊ะและ QR
            </Link>
          }
        />
      )}

      {/* เมื่อมีออเดอร์ในระบบ แต่ไม่มีออเดอร์ในสถานีที่เลือก */}
      {!loadError && orders !== null && orders.length > 0 && displayOrders !== null && displayOrders.length === 0 && (
        <EmptyState
          message={`ไม่มีออเดอร์ในแผนก${stationFilter === 'KITCHEN' ? 'ครัวอาหาร' : 'บาร์เครื่องดื่ม'} ในขณะนี้`}
          action={
            <button
              type="button"
              onClick={() => setStationFilter('ALL')}
              className="flex min-h-[44px] items-center rounded-lg bg-char px-4 text-sm font-bold text-slip shadow-sm hover:bg-rule"
            >
              ดูออเดอร์ทุกแผนก
            </button>
          }
        />
      )}

      {/* มุมมองกระดานออเดอร์: แยกตาม viewMode (LIST vs KDS) */}
      {!loadError && displayOrders !== null && displayOrders.length > 0 && (
        viewMode === 'LIST' ? (
          <div className="flex flex-col gap-4">
            {displayOrders.map((order) => renderOrderCard(order, false))}
          </div>
        ) : (
          (() => {
            const pendingOrders = displayOrders.filter((o) => o.status === 'PENDING');
            const preparingOrders = displayOrders.filter((o) => o.status === 'PREPARING');
            const servedOrders = displayOrders.filter((o) => o.status === 'SERVED');
            const otherOrders = displayOrders.filter((o) => o.status !== 'PENDING' && o.status !== 'PREPARING' && o.status !== 'SERVED');

            return (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                  {/* คอลัมน์ 1: รอครัวรับ */}
                  <div className="flex flex-col gap-3 rounded-2xl bg-zinc-100/80 p-3 border border-zinc-200 shadow-xs">
                    <div className="flex items-center justify-between px-1 pb-1">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-slate-500" />
                        <h2 className="font-bold text-sm text-slate-800">รอครัวรับ (PENDING)</h2>
                      </div>
                      <span className="rounded-full bg-white border border-zinc-200 px-2.5 py-0.5 text-sm font-black text-slate-700">
                        {pendingOrders.length}
                      </span>
                    </div>
                    {pendingOrders.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-zinc-300 bg-white/60 p-6 text-center text-sm text-zinc-500">
                        ไม่มีออเดอร์รอรับ
                      </div>
                    ) : (
                      pendingOrders.map((order) => renderOrderCard(order, true))
                    )}
                  </div>

                  {/* คอลัมน์ 2: กำลังปรุง */}
                  <div className="flex flex-col gap-3 rounded-2xl bg-amber-50/70 p-3 border border-amber-200 shadow-xs">
                    <div className="flex items-center justify-between px-1 pb-1">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-amber-500" />
                        <h2 className="font-bold text-sm text-amber-900">กำลังปรุง (PREPARING)</h2>
                      </div>
                      <span className="rounded-full bg-white border border-amber-200 px-2.5 py-0.5 text-sm font-black text-amber-800">
                        {preparingOrders.length}
                      </span>
                    </div>
                    {preparingOrders.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-amber-200 bg-white/60 p-6 text-center text-sm text-amber-700">
                        ไม่มีออเดอร์กำลังปรุง
                      </div>
                    ) : (
                      preparingOrders.map((order) => renderOrderCard(order, true))
                    )}
                  </div>

                  {/* คอลัมน์ 3: เสิร์ฟแล้ว / รอเช็คบิล */}
                  <div className="flex flex-col gap-3 rounded-2xl bg-emerald-50/70 p-3 border border-emerald-200 shadow-xs">
                    <div className="flex items-center justify-between px-1 pb-1">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-emerald-500" />
                        <h2 className="font-bold text-sm text-emerald-900">เสิร์ฟแล้ว (SERVED)</h2>
                      </div>
                      <span className="rounded-full bg-white border border-emerald-200 px-2.5 py-0.5 text-sm font-black text-emerald-800">
                        {servedOrders.length}
                      </span>
                    </div>
                    {servedOrders.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-emerald-200 bg-white/60 p-6 text-center text-sm text-emerald-700">
                        ไม่มีออเดอร์รอเช็คบิล
                      </div>
                    ) : (
                      servedOrders.map((order) => renderOrderCard(order, true))
                    )}
                  </div>
                </div>

                {/* รายการสถานะอื่น ๆ เช่น ยกเลิกแล้ว (ถ้ามี) */}
                {otherOrders.length > 0 && (
                  <div className="flex flex-col gap-3 mt-2">
                    <h3 className="text-sm font-bold text-slip-dim">ออเดอร์ที่ถูกยกเลิกแล้ว</h3>
                    <div className="flex flex-col gap-3">
                      {otherOrders.map((order) => renderOrderCard(order, false))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()
        )
      )}

      <CheckoutModal
        order={checkoutOrder}
        sessionOrders={checkoutContext?.sessionOrders ?? []}
        sessionItems={checkoutContext?.sessionItems ?? []}
        isAdmin={currentUser?.role === 'ADMIN'}
        checkingOut={checkingOut}
        onClose={() => setCheckoutOrder(null)}
        onConfirm={handleCheckout}
        onRequestCancelItem={(item, itemOrder) => setCancelItemTarget({ item, order: itemOrder })}
      />

      <ReceiptPrintModal
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        type={printType}
        data={printData}
        initialStation={printStation}
      />

      {/* Modal บังคับระบุเหตุผลการยกเลิกอาหารรายจาน เพื่อบันทึก Audit Log */}
      {cancelItemTarget && (
        <CancelReasonModal
          open={Boolean(cancelItemTarget)}
          title={`ยกเลิกรายการ: ${cancelItemTarget.item.item_name} (×${cancelItemTarget.item.quantity})`}
          subtitle={`โต๊ะ ${cancelItemTarget.order.table_no} · ออเดอร์ ${cancelItemTarget.order.order_code}`}
          amountText={`฿${formatBaht(Number(cancelItemTarget.item.unit_price) * cancelItemTarget.item.quantity)}`}
          onConfirm={(reason) => {
            changeItemStatus(cancelItemTarget.item, 'CANCELLED', reason);
            setCancelItemTarget(null);
          }}
          onClose={() => setCancelItemTarget(null)}
        />
      )}

      {/* Modal บังคับระบุเหตุผลการ Void ยกเลิกออเดอร์ทั้งใบ (เฉพาะ ADMIN) */}
      {cancelConfirmOrder && (
        <CancelReasonModal
          open={Boolean(cancelConfirmOrder)}
          title={`ยกเลิกออเดอร์ทั้งใบ: ${cancelConfirmOrder.order_code}`}
          subtitle={`โต๊ะ ${cancelConfirmOrder.table_no} · มูลค่ารวมทั้งใบ`}
          amountText={`฿${formatBaht(cancelConfirmOrder.total_amount)}`}
          onConfirm={(reason) => {
            changeOrderStatus(cancelConfirmOrder, 'CANCELLED', reason);
            setCancelConfirmOrder(null);
          }}
          onClose={() => setCancelConfirmOrder(null)}
        />
      )}

      {/* Modal บังคับระบุเหตุผลการคืนเงินบิลที่ปิดไปแล้ว (เฉพาะ ADMIN) */}
      {refundTarget && (
        <CancelReasonModal
          open={Boolean(refundTarget)}
          title={`คืนเงินบิลโต๊ะ ${refundTarget.table_no}`}
          subtitle={`บิลนี้ปิดไปแล้ว การคืนเงินจะทำให้ทั้งใบเป็นโมฆะ · ออเดอร์ ${refundTarget.order_code}`}
          amountText={`฿${formatBaht(getCheckoutContext(refundTarget).total)}`}
          amountLabel="ยอดโดยประมาณที่ต้องจ่ายคืน (เซิร์ฟเวอร์จะคืนตามยอดที่รับมาจริง)"
          presetReasons={REFUND_REASONS}
          confirmLabel="ยืนยันการคืนเงิน"
          onConfirm={(reason) => {
            handleRefundBill(refundTarget, reason);
            setRefundTarget(null);
          }}
          onClose={() => setRefundTarget(null)}
        />
      )}

      {/* Modal ดูประวัติการยกเลิกย้อนหลังสำหรับผู้จัดการ/เจ้าของร้าน */}
      <CancellationAuditModal
        open={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
      />
    </div>
  );
}

/**
 * หน้าจอกระดานออเดอร์ ห่อด้วย Suspense เพื่อรองรับการอ่าน useSearchParams (?tableNo=...)
 *
 * @returns หน้ากระดานออเดอร์ที่พร้อมอ่านพารามิเตอร์จาก URL
 */
export default function OrdersBoardPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={6} />}>
      <OrdersBoardContent />
    </Suspense>
  );
}
