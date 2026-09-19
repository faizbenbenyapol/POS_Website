'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { TableSkeleton, ErrorState } from '@/components/DataState';
import { CloseIcon, PlusIcon } from '@/components/Icons';
import { apiFetch, jsonBody } from '@/lib/client';
import { describeGroupRule } from '@/lib/menuOptions';
import type { AdminOptionGroup } from '@/lib/menuOptionsStore';

/** ตัวเลือก 1 แถวในฟอร์ม เก็บตัวเลขเป็นข้อความเพื่อให้ลบจนว่างระหว่างพิมพ์ได้ */
type DraftOption = { key: string; id?: number; name: string; priceDelta: string; isActive: boolean };

/** กลุ่มตัวเลือก 1 กลุ่มในฟอร์ม */
type DraftGroup = {
  key: string;
  id?: number;
  name: string;
  minSelect: string;
  maxSelect: string;
  isActive: boolean;
  options: DraftOption[];
};

/** แม่แบบกลุ่มตัวเลือกที่ร้านอาหารไทยใช้บ่อย กดครั้งเดียวได้ทั้งกลุ่ม แล้วค่อยแก้ต่อ */
const TEMPLATES: { label: string; group: Omit<DraftGroup, 'key' | 'options'> & { options: [string, number][] } }[] = [
  {
    label: 'ระดับความเผ็ด',
    group: {
      name: 'ระดับความเผ็ด',
      minSelect: '1',
      maxSelect: '1',
      isActive: true,
      options: [['ไม่เผ็ด', 0], ['เผ็ดน้อย', 0], ['เผ็ดกลาง', 0], ['เผ็ดมาก', 0]],
    },
  },
  {
    label: 'ธรรมดา / พิเศษ',
    group: { name: 'ขนาด', minSelect: '1', maxSelect: '1', isActive: true, options: [['ธรรมดา', 0], ['พิเศษ', 20]] },
  },
  {
    label: 'ท็อปปิ้ง',
    group: {
      name: 'เพิ่มท็อปปิ้ง',
      minSelect: '0',
      maxSelect: '2',
      isActive: true,
      options: [['ไข่ดาว', 10], ['ไข่เจียว', 15]],
    },
  },
  {
    label: 'ความหวาน',
    group: {
      name: 'ความหวาน',
      minSelect: '1',
      maxSelect: '1',
      isActive: true,
      options: [['หวานปกติ', 0], ['หวานน้อย', 0], ['ไม่หวาน', 0]],
    },
  },
];

let keySeq = 0;

/**
 * สร้างคีย์ชั่วคราวให้แถวในฟอร์ม ใช้เป็น key ของ React สำหรับแถวที่ยังไม่มี id จากฐานข้อมูล
 *
 * @returns คีย์ที่ไม่ซ้ำภายในหน้านี้
 */
function nextKey(): string {
  keySeq += 1;
  return `draft-${keySeq}`;
}

/**
 * แปลงกลุ่มตัวเลือกจากเซิร์ฟเวอร์เป็นแถวในฟอร์ม
 *
 * @param groups - กลุ่มตัวเลือกที่อ่านจาก GET /api/admin/menu-items/[id]/options
 * @returns กลุ่มในรูปแบบที่แก้ในฟอร์มได้
 */
function toDraft(groups: AdminOptionGroup[]): DraftGroup[] {
  return groups.map((g) => ({
    key: `g-${g.id}`,
    id: g.id,
    name: g.name,
    minSelect: String(g.minSelect),
    maxSelect: String(g.maxSelect),
    isActive: g.isActive,
    options: g.options.map((o) => ({
      key: `o-${o.id}`,
      id: o.id,
      name: o.name,
      priceDelta: String(o.priceDelta),
      isActive: o.isActive,
    })),
  }));
}

/**
 * หน้าต่างแก้กลุ่มตัวเลือกของเมนู (ระดับความเผ็ด / ธรรมดา-พิเศษ / ท็อปปิ้ง)
 * บันทึกทั้งชุดในครั้งเดียว กลุ่มหรือตัวเลือกที่ลบออกจากฟอร์มจะถูกลบจากเมนู
 * บิลเก่าไม่เปลี่ยน เพราะตัวเลือกที่ลูกค้าเคยเลือกถูกคัดลอกเก็บไว้กับรายการอาหารแล้ว
 *
 * @param menuItem - เมนูที่กำลังแก้ null คือปิดหน้าต่าง
 * @param onClose - ปิดหน้าต่างโดยไม่บันทึก
 * @param onSaved - เรียกหลังบันทึกสำเร็จ พร้อมจำนวนกลุ่มที่เหลือ
 * @returns หน้าต่างแก้ไขกลุ่มตัวเลือก
 */
export default function OptionGroupsEditor({
  menuItem,
  onClose,
  onSaved,
}: {
  menuItem: { id: number; name: string } | null;
  onClose: () => void;
  onSaved: (groupCount: number) => void;
}) {
  const [groups, setGroups] = useState<DraftGroup[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const menuItemId = menuItem?.id ?? null;

  useEffect(() => {
    if (menuItemId === null) return;
    let cancelled = false;
    setGroups(null);
    setLoadError('');
    setSaveError('');
    apiFetch<{ groups: AdminOptionGroup[] }>(`/api/admin/menu-items/${menuItemId}/options`).then((res) => {
      if (cancelled) return;
      if (res.ok) setGroups(toDraft(res.data.groups));
      else setLoadError(res.message);
    });
    return () => {
      cancelled = true;
    };
  }, [menuItemId]);

  /**
   * แก้กลุ่มหนึ่งกลุ่มในฟอร์ม
   *
   * @param key - คีย์ของกลุ่ม
   * @param patch - ฟิลด์ที่ต้องการเปลี่ยน
   */
  function updateGroup(key: string, patch: Partial<DraftGroup>) {
    setGroups((prev) => prev?.map((g) => (g.key === key ? { ...g, ...patch } : g)) ?? prev);
  }

  /**
   * แก้ตัวเลือกหนึ่งแถวในกลุ่ม
   *
   * @param groupKey - คีย์ของกลุ่ม
   * @param optionKey - คีย์ของตัวเลือก
   * @param patch - ฟิลด์ที่ต้องการเปลี่ยน
   */
  function updateOption(groupKey: string, optionKey: string, patch: Partial<DraftOption>) {
    setGroups(
      (prev) =>
        prev?.map((g) =>
          g.key === groupKey
            ? { ...g, options: g.options.map((o) => (o.key === optionKey ? { ...o, ...patch } : o)) }
            : g,
        ) ?? prev,
    );
  }

  /**
   * เลื่อนลำดับกลุ่มขึ้นหรือลง ลำดับในฟอร์มคือลำดับที่ลูกค้าเห็น
   *
   * @param index - ตำแหน่งปัจจุบันของกลุ่ม
   * @param direction - -1 เลื่อนขึ้น 1 เลื่อนลง
   */
  function moveGroup(index: number, direction: -1 | 1) {
    setGroups((prev) => {
      if (!prev) return prev;
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  /**
   * เพิ่มกลุ่มใหม่จากแม่แบบ หรือกลุ่มว่างเมื่อไม่ส่งแม่แบบมา
   *
   * @param template - แม่แบบกลุ่มตัวเลือก
   */
  function addGroup(template?: (typeof TEMPLATES)[number]['group']) {
    const group: DraftGroup = template
      ? {
          ...template,
          key: nextKey(),
          options: template.options.map(([name, delta]) => ({
            key: nextKey(),
            name,
            priceDelta: String(delta),
            isActive: true,
          })),
        }
      : {
          key: nextKey(),
          name: '',
          minSelect: '0',
          maxSelect: '1',
          isActive: true,
          options: [{ key: nextKey(), name: '', priceDelta: '0', isActive: true }],
        };
    setGroups((prev) => [...(prev ?? []), group]);
  }

  /**
   * ส่งฟอร์มทั้งชุดไปบันทึก เซิร์ฟเวอร์ตรวจกติกาซ้ำอีกชั้น (min <= max, max ไม่เกินจำนวนตัวเลือก)
   *
   * @param event - เหตุการณ์ submit ของฟอร์ม
   */
  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!groups || menuItemId === null) return;
    setSaving(true);
    setSaveError('');
    const res = await apiFetch<{ groups: AdminOptionGroup[] }>(`/api/admin/menu-items/${menuItemId}/options`, {
      method: 'PUT',
      body: jsonBody({
        groups: groups.map((g) => ({
          id: g.id,
          name: g.name,
          minSelect: Number(g.minSelect) || 0,
          maxSelect: Number(g.maxSelect) || 0,
          isActive: g.isActive,
          options: g.options.map((o) => ({
            id: o.id,
            name: o.name,
            priceDelta: Number(o.priceDelta) || 0,
            isActive: o.isActive,
          })),
        })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setSaveError(res.message);
      return;
    }
    onSaved(res.data.groups.length);
  }

  const inputClass =
    'min-h-[40px] rounded-lg border border-rule bg-white px-2.5 text-sm text-slip focus:border-emerald-600 focus:outline-none';

  return (
    <Modal
      title={menuItem ? `ตัวเลือกของเมนู: ${menuItem.name}` : 'ตัวเลือกของเมนู'}
      open={menuItem !== null}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      {loadError && <ErrorState message={loadError} onRetry={onClose} />}
      {!loadError && groups === null && <TableSkeleton rows={3} />}
      {!loadError && groups !== null && (
        <form onSubmit={handleSave} className="flex flex-col gap-4" noValidate>
          <p className="text-sm text-slip-dim">
            ลูกค้าเลือกตัวเลือกเหล่านี้ได้ตอนกดใส่ตะกร้า ราคาที่บวกเพิ่มจะคิดรวมในบิลเอง
            ครัวจะเห็นตัวเลือกที่ลูกค้าเลือกบนกระดานออเดอร์และตั๋วพิมพ์
          </p>

          {groups.length === 0 && (
            <p className="rounded-lg border border-dashed border-rule px-3 py-4 text-center text-sm text-slip-dim">
              เมนูนี้ยังไม่มีตัวเลือก ลูกค้าจะสั่งได้ทันทีโดยไม่ต้องเลือกอะไร
            </p>
          )}

          {groups.map((group, groupIndex) => {
            const min = Number(group.minSelect) || 0;
            const max = Number(group.maxSelect) || 0;
            return (
              <fieldset key={group.key} className="flex flex-col gap-3 rounded-xl border border-rule bg-char/50 p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-slip-dim">
                    ชื่อกลุ่ม
                    <input
                      value={group.name}
                      onChange={(e) => updateGroup(group.key, { name: e.target.value })}
                      placeholder="เช่น ระดับความเผ็ด"
                      maxLength={60}
                      className={inputClass}
                    />
                  </label>
                  <label className="flex w-24 flex-col gap-1 text-xs text-slip-dim">
                    บังคับเลือก
                    <input
                      type="number"
                      min={0}
                      value={group.minSelect}
                      onChange={(e) => updateGroup(group.key, { minSelect: e.target.value })}
                      className={`num text-right ${inputClass}`}
                    />
                  </label>
                  <label className="flex w-24 flex-col gap-1 text-xs text-slip-dim">
                    เลือกได้สูงสุด
                    <input
                      type="number"
                      min={1}
                      value={group.maxSelect}
                      onChange={(e) => updateGroup(group.key, { maxSelect: e.target.value })}
                      className={`num text-right ${inputClass}`}
                    />
                  </label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => moveGroup(groupIndex, -1)}
                      disabled={groupIndex === 0}
                      aria-label="เลื่อนกลุ่มขึ้น"
                      className="h-10 w-10 rounded-lg border border-rule bg-white text-sm text-slip disabled:opacity-40 cursor-pointer"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveGroup(groupIndex, 1)}
                      disabled={groupIndex === groups.length - 1}
                      aria-label="เลื่อนกลุ่มลง"
                      className="h-10 w-10 rounded-lg border border-rule bg-white text-sm text-slip disabled:opacity-40 cursor-pointer"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroups((prev) => prev?.filter((g) => g.key !== group.key) ?? prev)}
                      aria-label={`ลบกลุ่ม ${group.name || 'นี้'}`}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 cursor-pointer"
                    >
                      <CloseIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slip border border-rule">
                    ลูกค้าจะเห็น: {max >= 1 ? describeGroupRule({ minSelect: min, maxSelect: max }) : '—'}
                  </span>
                  <label className="flex items-center gap-1.5 text-slip-dim cursor-pointer">
                    <input
                      type="checkbox"
                      checked={group.isActive}
                      onChange={(e) => updateGroup(group.key, { isActive: e.target.checked })}
                      className="h-4 w-4 accent-emerald-600"
                    />
                    เปิดใช้กลุ่มนี้
                  </label>
                </div>

                <div className="flex flex-col gap-1.5">
                  {group.options.map((option) => (
                    <div key={option.key} className="flex flex-wrap items-center gap-2">
                      <input
                        value={option.name}
                        onChange={(e) => updateOption(group.key, option.key, { name: e.target.value })}
                        placeholder="ชื่อตัวเลือก เช่น เผ็ดน้อย"
                        maxLength={60}
                        aria-label="ชื่อตัวเลือก"
                        className={`min-w-[9rem] flex-1 ${inputClass}`}
                      />
                      <label className="flex items-center gap-1 text-xs text-slip-dim">
                        +฿
                        <input
                          type="number"
                          step="any"
                          value={option.priceDelta}
                          onChange={(e) => updateOption(group.key, option.key, { priceDelta: e.target.value })}
                          aria-label={`ราคาที่บวกเพิ่มของ ${option.name || 'ตัวเลือกนี้'}`}
                          className={`num w-20 text-right ${inputClass}`}
                        />
                      </label>
                      <label className="flex items-center gap-1 text-xs text-slip-dim cursor-pointer">
                        <input
                          type="checkbox"
                          checked={option.isActive}
                          onChange={(e) => updateOption(group.key, option.key, { isActive: e.target.checked })}
                          className="h-4 w-4 accent-emerald-600"
                        />
                        มีขาย
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          updateGroup(group.key, {
                            options: group.options.filter((o) => o.key !== option.key),
                          })
                        }
                        disabled={group.options.length <= 1}
                        aria-label={`ลบตัวเลือก ${option.name || 'นี้'}`}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-rule bg-white text-slip-dim hover:text-red-600 disabled:opacity-40 cursor-pointer"
                      >
                        <CloseIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      updateGroup(group.key, {
                        options: [
                          ...group.options,
                          { key: nextKey(), name: '', priceDelta: '0', isActive: true },
                        ],
                      })
                    }
                    className="flex min-h-[38px] items-center gap-1.5 self-start rounded-lg px-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                  >
                    <PlusIcon className="w-4 h-4" />
                    เพิ่มตัวเลือก
                  </button>
                </div>
              </fieldset>
            );
          })}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => addGroup()}
              className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
            >
              <PlusIcon className="w-4 h-4" />
              เพิ่มกลุ่มว่าง
            </button>
            <span className="text-xs text-slip-dim">หรือเริ่มจากแม่แบบ:</span>
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => addGroup(t.group)}
                className="min-h-[36px] rounded-full border border-rule bg-white px-3 text-xs font-semibold text-slip hover:border-slate-400 cursor-pointer"
              >
                + {t.label}
              </button>
            ))}
          </div>

          {saveError && (
            <p role="alert" className="rounded-lg border-l-4 border-void bg-char px-3 py-2 text-sm text-slip">
              {saveError}
            </p>
          )}
          <div className="flex justify-end gap-2.5 border-t border-rule pt-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] rounded-xl border border-rule bg-white px-4 text-xs font-semibold text-slip-dim hover:bg-slate-50 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[42px] rounded-xl bg-emerald-600 px-5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'กำลังบันทึก…' : 'บันทึกตัวเลือก'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
