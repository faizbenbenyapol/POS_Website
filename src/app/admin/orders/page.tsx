'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Modal from '@/components/Modal';
import ConfirmModal from '@/components/ConfirmModal';
import PromptPayQR from '@/components/PromptPayQR';
import ReceiptPrintModal, { ReceiptData, isBarItem } from '@/components/ReceiptPrintModal';
import CancelReasonModal from '@/components/CancelReasonModal';
import CancellationAuditModal from '@/components/CancellationAuditModal';
import { TableSkeleton, EmptyState, ErrorState, Notice } from '@/components/DataState';
import { SelectField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { apiFetch, jsonBody } from '@/lib/client';
import { downloadCsvFile } from '@/lib/exportCsv';
import { formatBaht, formatBahtWithSign, formatThaiTime } from '@/lib/format';
import {
  BellIcon,
  BellOffIcon,
  DownloadIcon,
  CookingIcon,
  CheckIcon,
  CloseIcon,
  PrintIcon,
  CreditCardIcon,
  RefreshIcon,
  ClockIcon,
  KanbanIcon,
  ListIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DrinkIcon,
  VolumeIcon,
  VolumeMuteIcon,
} from '@/components/Icons';

/** ออเดอร์ 1 ใบบนกระดาน */
type BoardOrder = {
  id: number;
  branch_id?: number | null;
  branch_name?: string | null;
  branch_address?: string | null;
  branch_phone?: string | null;
  order_code: string;
  status: string;
  total_amount: string;
  created_at: string;
  session_id: number;
  session_status: string;
  table_no: string;
};

/** รายการอาหารของออเดอร์บนกระดาน */
type BoardItem = {
  id: number;
  order_id: number;
  item_name: string;
  unit_price: string;
  quantity: number;
  note: string | null;
  status: string;
  category_name?: string | null;
};

/** คำอธิบายสถานะภาษาไทย มีข้อความกำกับเสมอ ไม่สื่อความหมายด้วยสีอย่างเดียว */
const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'รอครัวรับ', className: 'bg-char text-slip-dim' },
  PREPARING: { label: 'กำลังทำ', className: 'bg-waiting/10 text-waiting' },
  SERVED: { label: 'เสิร์ฟแล้ว', className: 'bg-served/10 text-served' },
  CANCELLED: { label: 'ยกเลิกแล้ว', className: 'bg-void/10 text-void' },
};

/** ตัวเลือกกรองสถานะบนหัวกระดาน */
const STATUS_FILTERS = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'PENDING', label: 'รอครัวรับ' },
  { value: 'PREPARING', label: 'กำลังทำ' },
  { value: 'SERVED', label: 'เสิร์ฟแล้ว' },
  { value: 'CANCELLED', label: 'ยกเลิกแล้ว' },
];

/** วิธีชำระเงินที่ร้านรับ ตรงกับ ENUM ในตาราง payments */
const PAYMENT_METHODS = [
  { value: 'CASH', label: 'เงินสด' },
  { value: 'TRANSFER', label: 'โอนเงิน' },
  { value: 'CARD', label: 'บัตรเครดิต/เดบิต' },
];

/**
 * แปลงวันนี้เป็นข้อความ YYYY-MM-DD สำหรับตัวกรองวันที่
 *
 * @returns ข้อความวันที่รูปแบบที่ input type="date" รับได้
 */
function todayInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** โทนเสียงแจ้งเตือนออเดอร์ */
export type SoundTone = 'CHIME' | 'BELL' | 'ALERT';

/**
 * สังเคราะห์เสียงสัญญาณเตือนเมื่อมีออเดอร์ใหม่เข้ามาด้วย Web Audio API
 * รองรับ 3 โทนเสียง พร้อมระดับเสียงที่ปรับได้ ไม่ต้องพึ่งพาไฟล์เสียงภายนอก (.mp3)
 *
 * @param tone - โทนเสียง ('CHIME' | 'BELL' | 'ALERT')
 * @param volume - ระดับความดัง (0.0 ถึง 1.0)
 */
function playNewOrderSound(tone: SoundTone = 'CHIME', volume: number = 0.6) {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const masterGain = Math.max(0, Math.min(1, volume));

    if (tone === 'BELL') {
      // โทนกระดิ่งโลหะก้องกังวาน (Kitchen Service Bell)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6
      osc2.frequency.setValueAtTime(2093, ctx.currentTime); // C7 overtone

      gain.gain.setValueAtTime(masterGain * 0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.65);
      osc2.stop(ctx.currentTime + 0.65);
    } else if (tone === 'ALERT') {
      // โทนสัญญาณเตือนฉุกเฉิน 3 สเต็ป (Urgent Tri-Tone)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2); // A5

      gain.gain.setValueAtTime(masterGain * 0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } else {
      // CHIME: เสียงกระดิ่งสองโทนละมุน (Default Two-Tone Chime)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

      gain.gain.setValueAtTime(masterGain * 0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch {
    // ป้องกันการทำงานล้มเหลวหากเบราว์เซอร์ยังไม่เปิดให้เล่นเสียงอัตโนมัติก่อนคลิก
  }
}

/**
 * คำนวณระยะเวลารอของออเดอร์ พร้อมกำหนดระดับความเร่งด่วนสำหรับห้องครัว
 *
 * @param createdAt - วันเวลาที่สั่งอาหาร
 * @returns ข้อมูลจำนวนนาที ข้อความกำกับ และคลาสสีของป้ายเตือน
 */
function getOrderAge(createdAt: string): {
  minutes: number;
  label: string;
  badgeClass: string;
  isUrgent: boolean;
} {
  const created = new Date(createdAt).getTime();
  const diffMs = Math.max(0, Date.now() - created);
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) {
    return {
      minutes,
      label: 'เพิ่งสั่ง',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      isUrgent: false,
    };
  }
  if (minutes < 10) {
    return {
      minutes,
      label: `รอ ${minutes} นาที`,
      badgeClass: 'bg-zinc-100 text-zinc-700 border-zinc-200',
      isUrgent: false,
    };
  }
  if (minutes < 20) {
    return {
      minutes,
      label: `⚠️ รอนาน ${minutes} น.`,
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
      isUrgent: true,
    };
  }
  return {
    minutes,
    label: `🔥 เร่งด่วน! ${minutes} น.`,
    badgeClass: 'bg-red-100 text-red-900 border-red-400 font-black animate-pulse',
    isUrgent: true,
  };
}

/** ข้อมูลสรุปเมนูอาหารค้างปรุงสำหรับห้องครัว */
type PrepItem = {
  name: string;
  quantity: number;
  tables: string[];
  isBar: boolean;
};

/**
 * รวมรายการอาหารที่ยังค้างปรุง (PENDING และ PREPARING) จากทุกใบสั่ง
 * รองรับการกรองตามสถานี (ครัวอาหาร หรือ บาร์น้ำ)
 *
 * @param orders - รายการออเดอร์ทั้งหมดบนกระดาน
 * @param items - รายการอาหารทั้งหมดบนกระดาน
 * @param stationFilter - ตัวกรองสถานี ('ALL' | 'KITCHEN' | 'BAR')
 * @returns รายการเมนูค้างปรุง เรียงจากจำนวนจานมากไปหาน้อย
 */
function computeKitchenPrepSummary(
  orders: BoardOrder[] | null,
  items: BoardItem[],
  stationFilter: 'ALL' | 'KITCHEN' | 'BAR' = 'ALL',
): PrepItem[] {
  if (!orders || orders.length === 0 || items.length === 0) return [];

  const activeOrderMap = new Map<number, BoardOrder>();
  for (const o of orders) {
    if (o.status === 'PENDING' || o.status === 'PREPARING') {
      activeOrderMap.set(o.id, o);
    }
  }

  const prepMap = new Map<string, { quantity: number; tables: Set<string>; isBar: boolean }>();

  for (const item of items) {
    const parentOrder = activeOrderMap.get(item.order_id);
    if (!parentOrder) continue;
    if (item.status === 'PENDING' || item.status === 'PREPARING') {
      const isBar = isBarItem({
        itemName: item.item_name,
        quantity: item.quantity,
        categoryName: item.category_name,
      });

      if (stationFilter === 'KITCHEN' && isBar) continue;
      if (stationFilter === 'BAR' && !isBar) continue;

      const existing = prepMap.get(item.item_name) || {
        quantity: 0,
        tables: new Set<string>(),
        isBar,
      };
      existing.quantity += item.quantity;
      existing.tables.add(parentOrder.table_no);
      prepMap.set(item.item_name, existing);
    }
  }

  return Array.from(prepMap.entries())
    .map(([name, data]) => ({
      name,
      quantity: data.quantity,
      tables: Array.from(data.tables).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
      isBar: data.isBar,
    }))
    .sort((a, b) => b.quantity - a.quantity);
}

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
  const [payMethod, setPayMethod] = useState('CASH');
  const [checkingOut, setCheckingOut] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printType, setPrintType] = useState<'KITCHEN' | 'RECEIPT'>('KITCHEN');
  const [printStation, setPrintStation] = useState<'ALL' | 'KITCHEN' | 'BAR'>('ALL');
  const [printData, setPrintData] = useState<ReceiptData | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundTone, setSoundTone] = useState<SoundTone>('CHIME');
  const [soundVolume, setSoundVolume] = useState<number>(0.6);
  const [showSoundSettings, setShowSoundSettings] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<{ role: string; fullName: string } | null>(null);
  const [cancelConfirmOrder, setCancelConfirmOrder] = useState<BoardOrder | null>(null);
  const [cancelItemTarget, setCancelItemTarget] = useState<{ item: BoardItem; order: BoardOrder } | null>(null);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const { warning: toastWarning } = useToast();
  const knownOrderIdsRef = useRef<Set<number> | null>(null);

  // ตัวกรองสถานีครัว vs บาร์
  const [stationFilter, setStationFilter] = useState<'ALL' | 'KITCHEN' | 'BAR'>('ALL');

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

  /** สลับเปิด/ปิดเสียงเตือน พร้อมบันทึกสถานะ */
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

  /** เปลี่ยนโทนเสียงเตือน พร้อมบันทึกและเล่นตัวอย่าง */
  function handleChangeTone(tone: SoundTone) {
    setSoundTone(tone);
    try {
      localStorage.setItem('pos_order_sound_tone', tone);
    } catch {}
    playNewOrderSound(tone, soundVolume);
  }

  /** ปรับระดับความดัง พร้อมบันทึก */
  function handleChangeVolume(vol: number) {
    setSoundVolume(vol);
    try {
      localStorage.setItem('pos_order_sound_vol', String(vol));
    } catch {}
  }

  // การแสดงผลและการควบคุมการรีเฟรช
  const [viewMode, setViewMode] = useState<'LIST' | 'KDS'>('LIST');
  const [refreshIntervalSec, setRefreshIntervalSec] = useState<number>(10);
  const [countdown, setCountdown] = useState<number>(10);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [showPrepSummary, setShowPrepSummary] = useState<boolean>(true);
  const [_timeTick, setTimeTick] = useState<number>(Date.now());

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
    targetStation: 'ALL' | 'KITCHEN' | 'BAR' = 'ALL',
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
   * ปิดบิลของโต๊ะ บันทึกการชำระเงินแล้วปิดรอบการนั่งให้โต๊ะกลับมาว่าง
   *
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือบันทึก payments และรีโหลดกระดาน
   */
  async function handleCheckout() {
    if (!checkoutOrder) return;
    setCheckingOut(true);
    const result = await apiFetch<{ total: number }>(
      `/api/admin/sessions/${checkoutOrder.session_id}/checkout`,
      { method: 'POST', body: jsonBody({ method: payMethod }) },
    );
    setCheckingOut(false);

    if (!result.ok) {
      setNotice({ tone: 'error', message: result.message });
      return;
    }

    const sessionOrders = orders?.filter((o) => o.session_id === checkoutOrder.session_id) ?? [];
    const sessionOrderIds = new Set(sessionOrders.map((o) => o.id));
    const sessionItems = items.filter((i) => sessionOrderIds.has(i.order_id) && i.status !== 'CANCELLED');

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
      totalAmount: result.data.total,
      paymentMethod: payMethod,
      orderCode: checkoutOrder.order_code,
      paidAt: new Date().toISOString(),
      cashierName: currentUser?.fullName,
    });
    setCheckoutOrder(null);
    setPrintModalOpen(true);
    load(false);
  }

  /**
   * สร้างและดาวน์โหลดไฟล์ CSV สำหรับรายการออเดอร์ตามตัวกรองปัจจุบัน
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
   * เรนเดอร์การ์ดออเดอร์ 1 ใบ รองรับทั้งมุมมองรายการปกติและมุมมองกระดานครัว (KDS)
   */
  function renderOrderCard(order: BoardOrder, isKds: boolean = false) {
    const status = STATUS_LABELS[order.status] ?? STATUS_LABELS.PENDING;
    const orderItems = items.filter((item) => item.order_id === order.id);
    const closed = order.session_status === 'CLOSED';
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

    return (
      <article
        key={order.id}
        className={`lm-card overflow-hidden transition-all duration-200 ${
          ageInfo.isUrgent && showAge
            ? 'border-amber-300 ring-2 ring-amber-400/30'
            : ''
        } ${isKds ? 'bg-white shadow-xs rounded-xl border border-zinc-200' : ''}`}
      >
        <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-rule bg-char px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 font-bold text-xs text-white shadow-xs">
              {order.table_no}
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs text-slip">โต๊ะ {order.table_no}</span>
                {order.branch_name && (
                  <span className="rounded bg-zinc-100 px-1 py-0.5 text-[9px] font-semibold text-zinc-600">
                    {order.branch_name}
                  </span>
                )}
              </div>
              <p className="num text-[11px] text-slip-dim">
                {order.order_code} · {formatThaiTime(order.created_at)}
              </p>
            </div>
          </div>

          {/* ป้ายเตือนระยะเวลารอ */}
          {showAge && (
            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${ageInfo.badgeClass}`}>
              {ageInfo.label}
            </span>
          )}

          <span className={`ml-auto rounded-full px-2.5 py-0.5 font-bold text-[11px] ${status.className}`}>
            {status.label}
          </span>
          <span className="num text-sm font-bold text-emerald-700">
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
                className={`flex flex-wrap items-center gap-x-2.5 gap-y-1.5 py-1.5 first:pt-0 last:pb-0 transition-opacity ${
                  matchesActiveStation ? 'opacity-100' : 'opacity-40 bg-zinc-50/40 rounded px-1'
                }`}
              >
                <span className="num font-black text-xs text-slip-dim">×{item.quantity}</span>
                <div className="min-w-0 flex-1 flex items-center gap-1.5">
                  <span className="font-medium text-xs text-slip">{item.item_name}</span>
                  {isBar ? (
                    <span className="inline-flex items-center gap-0.5 rounded bg-cyan-50 px-1 py-0.2 text-[9px] font-bold text-cyan-800 border border-cyan-200 shrink-0">
                      <DrinkIcon className="w-2.5 h-2.5" />
                      บาร์
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1 py-0.2 text-[9px] font-bold text-amber-800 border border-amber-200 shrink-0">
                      <CookingIcon className="w-2.5 h-2.5" />
                      ครัว
                    </span>
                  )}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${itemStatus.className}`}>
                  {itemStatus.label}
                </span>
                {!closed && item.status !== 'CANCELLED' && (
                  <div className="flex gap-1">
                    {item.status !== 'SERVED' && (
                      <button
                        type="button"
                        onClick={() => changeItemStatus(item, 'SERVED')}
                        className="min-h-[32px] rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 text-[11px] font-bold hover:bg-emerald-100 transition-colors cursor-pointer"
                      >
                        เสิร์ฟ
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setCancelItemTarget({ item, order })}
                      className="min-h-[32px] rounded-lg bg-void/10 px-2 text-[11px] font-bold text-void hover:bg-void/20 transition-colors cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                  </div>
                )}
                {item.note && (
                  <p className="w-full text-[11px] font-bold text-amber-700 pl-5">
                    * หมายเหตุ: {item.note}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <footer className="flex flex-wrap items-center gap-1.5 border-t border-rule px-3 py-2 bg-slate-50/60">
          {closed ? (
            <p className="text-[11px] text-slip-dim py-1">บิลของโต๊ะนี้ปิดแล้ว แก้ไขไม่ได้</p>
          ) : (
            <>
              {order.status === 'PENDING' && (
                <button
                  type="button"
                  onClick={() => changeOrderStatus(order, 'PREPARING')}
                  className="min-h-[36px] rounded-xl bg-emerald-600 px-3 font-bold text-xs text-white shadow-xs hover:bg-emerald-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <CookingIcon className="w-3.5 h-3.5" />
                  <span>ครัวรับแล้ว เริ่มทำ</span>
                </button>
              )}
              {order.status === 'PREPARING' && (
                <button
                  type="button"
                  onClick={() => changeOrderStatus(order, 'SERVED')}
                  className="min-h-[36px] rounded-xl bg-emerald-600 px-3 font-bold text-xs text-white shadow-xs hover:bg-emerald-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckIcon className="w-3.5 h-3.5" />
                  <span>เสิร์ฟครบทั้งใบแล้ว</span>
                </button>
              )}
              {order.status !== 'CANCELLED' && (
                <button
                  type="button"
                  onClick={() => {
                    if (currentUser?.role !== 'ADMIN') {
                      toastWarning(
                        'สงวนสิทธิ์เฉพาะเจ้าของร้าน (ADMIN)',
                        'หากจำเป็นต้องยกเลิกออเดอร์ทั้งใบ กรุณาแจ้งผู้จัดการ',
                      );
                      return;
                    }
                    setCancelConfirmOrder(order);
                  }}
                  className="min-h-[36px] rounded-xl bg-red-50 border border-red-200 px-2 font-bold text-xs text-red-700 hover:bg-red-100 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                  <span>ยกเลิกทั้งใบ</span>
                </button>
              )}
              {hasKitchen && (
                <button
                  type="button"
                  onClick={() => handleOpenKitchenPrint(order, orderItems, 'KITCHEN')}
                  className="min-h-[36px] rounded-xl border border-amber-200 bg-amber-50 px-2.5 font-bold text-[11px] text-amber-900 hover:bg-amber-100 transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                  title="พิมพ์ตั๋วห้องครัว (อาหาร)"
                >
                  <CookingIcon className="w-3.5 h-3.5 text-amber-700" />
                  <span>ตั๋วครัว</span>
                </button>
              )}
              {hasBar && (
                <button
                  type="button"
                  onClick={() => handleOpenKitchenPrint(order, orderItems, 'BAR')}
                  className="min-h-[36px] rounded-xl border border-cyan-200 bg-cyan-50 px-2.5 font-bold text-[11px] text-cyan-900 hover:bg-cyan-100 transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                  title="พิมพ์ตั๋วบาร์เครื่องดื่ม"
                >
                  <DrinkIcon className="w-3.5 h-3.5 text-cyan-700" />
                  <span>ตั๋วบาร์</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => handleOpenKitchenPrint(order, orderItems, 'ALL')}
                className="min-h-[36px] rounded-xl border border-rule bg-white px-2.5 font-bold text-[11px] text-slip hover:bg-slate-50 transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                title="พิมพ์ตั๋วรวมทุกรายการ"
              >
                <PrintIcon className="w-3.5 h-3.5" />
                <span>ตั๋วรวม</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCheckoutOrder(order);
                  setPayMethod('CASH');
                }}
                className="min-h-[36px] rounded-xl border border-emerald-600 bg-emerald-50 px-3 font-bold text-xs text-emerald-800 hover:bg-emerald-600 hover:text-white transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
              >
                <CreditCardIcon className="w-3.5 h-3.5" />
                <span>ปิดบิล</span>
              </button>
            </>
          )}
        </footer>
      </article>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ส่วนหัวหน้าจอ พร้อมตัวสลับมุมมองและรอบเวลารีเฟรช */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold text-slip">กระดานออเดอร์</h1>
            {/* ตัวสลับมุมมอง รายการ vs KDS */}
            <div className="flex items-center rounded-xl bg-zinc-100 p-1 border border-zinc-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('LIST')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'LIST'
                    ? 'bg-white text-slip shadow-xs'
                    : 'text-slip-dim hover:text-slip'
                }`}
              >
                <ListIcon className="w-3.5 h-3.5" />
                <span>รายการ</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('KDS')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'KDS'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slip-dim hover:text-slip'
                }`}
              >
                <KanbanIcon className="w-3.5 h-3.5" />
                <span>กระดานครัว (KDS)</span>
              </button>
            </div>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slip-dim">
            {refreshIntervalSec > 0 ? (
              <span className="flex items-center gap-1.5">
                <span className={`inline-block h-2 w-2 rounded-full ${isSyncing ? 'bg-emerald-500 animate-ping' : 'bg-emerald-500'}`} />
                <span>ซิงก์ล่าสุด {lastSyncTime || '-'} · รีเฟรชใน {countdown} วิ</span>
              </span>
            ) : (
              <span className="text-amber-700 font-medium">⏸️ หยุดรีเฟรชอัตโนมัติชั่วคราว</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* ตัวเลือกรอบเวลาการรีเฟรช */}
          <div className="flex items-center gap-1">
            <select
              value={refreshIntervalSec}
              onChange={(e) => {
                const val = Number(e.target.value);
                setRefreshIntervalSec(val);
                setCountdown(val);
              }}
              className="min-h-[40px] rounded-xl border border-rule bg-white px-2.5 text-xs font-semibold text-slip focus:outline-none cursor-pointer"
            >
              <option value={5}>รีเฟรช 5 วิ</option>
              <option value={10}>รีเฟรช 10 วิ</option>
              <option value={30}>รีเฟรช 30 วิ</option>
              <option value={0}>หยุดชั่วคราว</option>
            </select>
            <button
              type="button"
              onClick={() => load(false)}
              title="ดึงข้อมูลใหม่ทันที"
              disabled={isSyncing}
              className="flex h-[40px] w-[40px] items-center justify-center rounded-xl border border-rule bg-white text-slip-dim hover:text-slip hover:bg-zinc-50 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              <RefreshIcon className={`w-4 h-4 ${isSyncing ? 'animate-spin text-emerald-600' : ''}`} />
            </button>
          </div>

          {currentUser?.role === 'ADMIN' && (
            <button
              type="button"
              onClick={() => setAuditModalOpen(true)}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rule bg-white px-3.5 text-xs font-bold text-slip transition-colors hover:bg-zinc-50 shadow-2xs cursor-pointer"
            >
              <span>📜 บันทึกประวัติการยกเลิก</span>
            </button>
          )}
        </div>
      </div>

      {/* แถบตัวกรองสถานะ วันที่ เลขโต๊ะ และเสียงสัญญาณ */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg bg-griddle px-3 py-3 shadow-sm">
        <div className="min-w-[12rem] flex-1">
          <SelectField
            id="order-status-filter"
            label="กรองตามสถานะ"
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_FILTERS}
          />
        </div>
        <div className="min-w-[12rem] flex-1">
          <div className="flex flex-col gap-2">
            <label htmlFor="order-date-filter" className="text-sm text-slip-dim">
              วันที่
            </label>
            <input
              id="order-date-filter"
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="min-h-[44px] w-full rounded-lg bg-char px-3 text-slip"
            />
          </div>
        </div>
        <div className="w-full sm:w-36">
          <div className="flex flex-col gap-2">
            <label htmlFor="order-table-filter" className="text-sm text-slip-dim">
              เลขโต๊ะ
            </label>
            <div className="relative">
              <input
                id="order-table-filter"
                type="text"
                placeholder="ทุกโต๊ะ..."
                value={tableFilter}
                onChange={(event) => setTableFilter(event.target.value)}
                className="min-h-[44px] w-full rounded-lg bg-char px-3 text-slip focus:outline-none text-xs"
              />
              {tableFilter && (
                <button
                  type="button"
                  onClick={() => setTableFilter('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slip-dim hover:text-slip cursor-pointer"
                  title="ล้างตัวกรองโต๊ะ"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleToggleSound}
            className={`min-h-[44px] rounded-lg px-3.5 font-medium transition-colors flex items-center gap-2 cursor-pointer ${
              soundEnabled
                ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                : 'bg-char text-slip-dim hover:bg-rule'
            }`}
            title={soundEnabled ? 'ปิดเสียงเตือน' : 'เปิดเสียงเตือน'}
          >
            {soundEnabled ? (
              <>
                <BellIcon className="w-5 h-5 text-amber-700" />
                <span className="text-xs font-bold">เปิดเสียง</span>
              </>
            ) : (
              <>
                <BellOffIcon className="w-5 h-5" />
                <span className="text-xs font-bold">ปิดเสียง</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowSoundSettings((prev) => !prev)}
            className={`min-h-[44px] rounded-lg border px-3 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
              showSoundSettings
                ? 'bg-white border-zinc-400 text-zinc-900 shadow-xs'
                : 'bg-char border-rule text-slip-dim hover:bg-rule hover:text-slip'
            }`}
            title="ปรับโทนเสียงและระดับความดัง"
          >
            <VolumeIcon className="w-4 h-4" />
            <span>ตั้งค่าเสียง</span>
          </button>
        </div>
        <button
          type="button"
          onClick={handleExportOrdersCsv}
          disabled={!orders || orders.length === 0}
          className="min-h-[44px] rounded-lg bg-char px-4 text-slip transition-colors hover:bg-rule disabled:opacity-50 flex items-center gap-2"
        >
          <DownloadIcon className="w-5 h-5" />
          <span>ส่งออกออเดอร์ CSV</span>
        </button>
      </div>

      {/* แผงควบคุมเสียงแจ้งเตือน (Interactive Audio Chime Studio) */}
      {showSoundSettings && (
        <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800">โทนเสียง:</span>
              <div className="flex rounded-lg bg-zinc-100 p-0.5 border border-zinc-200">
                <button
                  type="button"
                  onClick={() => handleChangeTone('CHIME')}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                    soundTone === 'CHIME' ? 'bg-white text-zinc-900 shadow-xs font-bold' : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  🔔 ละมุน (Chime)
                </button>
                <button
                  type="button"
                  onClick={() => handleChangeTone('BELL')}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                    soundTone === 'BELL' ? 'bg-white text-amber-900 shadow-xs font-bold' : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  🛎️ กริ่งครัว (Bell)
                </button>
                <button
                  type="button"
                  onClick={() => handleChangeTone('ALERT')}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                    soundTone === 'ALERT' ? 'bg-white text-red-700 shadow-xs font-bold' : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  🚨 เตือนด่วน (Alert)
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <VolumeIcon className="w-4 h-4 text-zinc-500" />
              <span className="text-xs font-medium text-zinc-600">ระดับเสียง: {Math.round(soundVolume * 100)}%</span>
              <input
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={soundVolume}
                onChange={(e) => handleChangeVolume(Number(e.target.value))}
                className="w-24 accent-emerald-600 cursor-pointer"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => playNewOrderSound(soundTone, soundVolume)}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-2xs cursor-pointer"
          >
            <VolumeIcon className="w-3.5 h-3.5" />
            <span>🔊 ทดสอบเสียง ({soundTone})</span>
          </button>
        </div>
      )}

      {/* แถบตัวกรองสถานี: ทุกแผนก / ครัวอาหาร / บาร์เครื่องดื่ม */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2">
        <div className="flex items-center rounded-xl bg-zinc-100 p-1 border border-zinc-200 shadow-2xs">
          <button
            type="button"
            onClick={() => setStationFilter('ALL')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              stationFilter === 'ALL'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <span>📋 ทุกแผนก</span>
            <span className="rounded-full bg-zinc-200 px-1.5 py-0.2 text-[10px] text-zinc-700 font-mono">
              {totalPendingDishes}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setStationFilter('KITCHEN')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              stationFilter === 'KITCHEN'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <CookingIcon className="w-3.5 h-3.5" />
            <span>🍳 ครัวอาหาร</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                stationFilter === 'KITCHEN' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {kitchenPendingCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setStationFilter('BAR')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              stationFilter === 'BAR'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <DrinkIcon className="w-3.5 h-3.5" />
            <span>🍹 บาร์เครื่องดื่ม</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                stationFilter === 'BAR' ? 'bg-cyan-700 text-white' : 'bg-cyan-100 text-cyan-800'
              }`}
            >
              {barPendingCount}
            </span>
          </button>
        </div>

        <div className="text-xs text-slip-dim">
          {stationFilter === 'ALL' && 'แสดงรายการทั้งแผนกครัวอาหารและบาร์เครื่องดื่ม'}
          {stationFilter === 'KITCHEN' && '🍳 แสดงเฉพาะคิวจานอาหารของครัว'}
          {stationFilter === 'BAR' && '🍹 แสดงเฉพาะคิวแก้วเครื่องดื่มของบาร์น้ำ'}
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
              <p className="text-[11px] text-zinc-600">
                รวบรวมรายการที่รอคิวและกำลังทำ ช่วยให้ครัว/บาร์จัดเตรียมวัตถุดิบและทำพร้อมกันเป็นชุดได้เร็วขึ้น
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowPrepSummary((prev) => !prev)}
            className="flex items-center gap-1 rounded-lg bg-white border border-amber-200 px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100/60 transition-colors cursor-pointer"
          >
            <span>{showPrepSummary ? 'ย่อแถบสรุป' : 'ขยายดูรายละเอียด'}</span>
            {showPrepSummary ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showPrepSummary && (
          <div className="mt-3 pt-2.5 border-t border-amber-200/60">
            {prepSummary.length === 0 ? (
              <p className="py-2 text-center text-xs font-medium text-emerald-800">
                ✨ เคลียร์ออเดอร์ครบถ้วนแล้ว ไม่มีรายการค้างทำในขณะนี้
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
                        <span className="font-bold text-xs text-slate-800 line-clamp-2 leading-tight">
                          {item.name}
                        </span>
                        {item.isBar ? (
                          <span className="text-[9px] font-bold text-cyan-700">🍹 บาร์น้ำ</span>
                        ) : (
                          <span className="text-[9px] font-bold text-amber-700">🍳 ครัว</span>
                        )}
                      </div>
                      <span className="flex-shrink-0 rounded-md bg-amber-600 px-1.5 py-0.5 text-xs font-black text-white">
                        ×{item.quantity}
                      </span>
                    </div>
                    <div className="mt-2 text-[10px] font-semibold text-amber-900/80">
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
              className="flex min-h-[44px] items-center rounded-lg bg-griddle px-4 text-slip shadow-sm"
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
              className="flex min-h-[44px] items-center rounded-lg bg-char px-4 text-xs font-bold text-slip shadow-sm hover:bg-rule"
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
                      <span className="rounded-full bg-white border border-zinc-200 px-2.5 py-0.5 text-xs font-black text-slate-700">
                        {pendingOrders.length}
                      </span>
                    </div>
                    {pendingOrders.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-zinc-300 bg-white/60 p-6 text-center text-xs text-zinc-500">
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
                      <span className="rounded-full bg-white border border-amber-200 px-2.5 py-0.5 text-xs font-black text-amber-800">
                        {preparingOrders.length}
                      </span>
                    </div>
                    {preparingOrders.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-amber-200 bg-white/60 p-6 text-center text-xs text-amber-700">
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
                      <span className="rounded-full bg-white border border-emerald-200 px-2.5 py-0.5 text-xs font-black text-emerald-800">
                        {servedOrders.length}
                      </span>
                    </div>
                    {servedOrders.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-emerald-200 bg-white/60 p-6 text-center text-xs text-emerald-700">
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
                    <h3 className="text-xs font-bold text-slip-dim">ออเดอร์ที่ถูกยกเลิกแล้ว</h3>
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

      <Modal
        title={checkoutOrder ? `ปิดบิลโต๊ะ ${checkoutOrder.table_no}` : 'ปิดบิล'}
        open={checkoutOrder !== null}
        onClose={() => setCheckoutOrder(null)}
      >
        {checkoutOrder && (() => {
          const sessionOrders = orders?.filter((o) => o.session_id === checkoutOrder.session_id) ?? [];
          const sessionOrderIds = new Set(sessionOrders.map((o) => o.id));
          const sessionItems = items.filter((i) => sessionOrderIds.has(i.order_id) && i.status !== 'CANCELLED');
          const checkoutTotal = sessionItems.reduce((sum, i) => sum + Number(i.unit_price) * i.quantity, 0);

          return (
            <div className="flex flex-col gap-4">
              <p className="text-slip-dim">
                ระบบจะรวมทุกใบสั่งของรอบการนั่งนี้ ยกเว้นรายการที่ยกเลิก แล้วปิดโต๊ะให้ว่าง
                เมื่อปิดแล้วจะแก้ไขออเดอร์ของรอบนี้ไม่ได้อีก
              </p>
              <SelectField
                id="checkout-method"
                label="วิธีชำระเงิน"
                value={payMethod}
                onChange={setPayMethod}
                options={PAYMENT_METHODS}
              />
              {payMethod === 'TRANSFER' && (
                <PromptPayQR amount={checkoutTotal} />
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCheckoutOrder(null)}
                  className="min-h-[44px] rounded-lg bg-char px-4 text-slip"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={checkingOut}
                  className="min-h-[44px] rounded-lg bg-flame px-4 font-medium text-char disabled:opacity-60"
                >
                  {checkingOut ? 'กำลังปิดบิล…' : 'ยืนยันปิดบิล'}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

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
 */
export default function OrdersBoardPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={6} />}>
      <OrdersBoardContent />
    </Suspense>
  );
}
