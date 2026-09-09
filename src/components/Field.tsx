/** คลาสพื้นฐานของช่องกรอกทุกชนิด ประกาศไว้ที่เดียวเพื่อให้ทุกฟอร์มหน้าตาเหมือนกัน */
const INPUT_CLASS =
  'min-h-[44px] w-full rounded-lg bg-char px-3 text-slip placeholder:text-slip-dim';

/**
 * ช่องกรอกข้อความพร้อมป้ายกำกับ ใช้กับชื่อ คำอธิบาย และรหัสผ่าน
 *
 * @param id - id ของ input ใช้ผูกกับ label ให้กดที่ป้ายแล้วโฟกัสได้
 * @param label - ข้อความป้ายกำกับภาษาไทย
 * @param value - ค่าปัจจุบันในช่อง
 * @param onChange - ฟังก์ชันรับค่าใหม่เมื่อผู้ใช้พิมพ์
 * @param type - ชนิดของ input ปกติเป็น text
 * @param placeholder - ตัวอย่างค่าที่ควรกรอก
 * @param hint - คำอธิบายเพิ่มใต้ช่อง เช่นเงื่อนไขความยาว
 * @returns บล็อกช่องกรอกพร้อมป้ายกำกับ
 */
export function TextField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'password' | 'date';
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm text-slip-dim">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoCapitalize="none"
        className={INPUT_CLASS}
      />
      {hint && <p className="text-sm text-slip-dim">{hint}</p>}
    </div>
  );
}

/**
 * ช่องกรอกตัวเลขพร้อมป้ายกำกับ จัดชิดขวาและใช้ฟอนต์ตัวเลขให้อ่านง่าย
 *
 * @param id - id ของ input
 * @param label - ข้อความป้ายกำกับภาษาไทย
 * @param value - ค่าปัจจุบันในรูปข้อความ (เก็บเป็นข้อความเพื่อให้ลบจนว่างได้)
 * @param onChange - ฟังก์ชันรับค่าใหม่
 * @param min - ค่าต่ำสุดที่ยอมรับ
 * @param step - ระยะการเพิ่ม/ลด เช่น 0.01 สำหรับราคา
 * @returns บล็อกช่องกรอกตัวเลข
 */
export function NumberField({
  id,
  label,
  value,
  onChange,
  min = 0,
  step = 1,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  step?: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm text-slip-dim">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`num text-right ${INPUT_CLASS}`}
      />
    </div>
  );
}

/**
 * ช่องเลือกจากรายการพร้อมป้ายกำกับ ใช้กับหมวดหมู่ บทบาท และสถานะ
 *
 * @param id - id ของ select
 * @param label - ข้อความป้ายกำกับภาษาไทย
 * @param value - ค่าที่เลือกอยู่
 * @param onChange - ฟังก์ชันรับค่าใหม่
 * @param options - ตัวเลือกทั้งหมด แต่ละตัวมี value และ label
 * @returns บล็อกช่องเลือก
 */
export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm text-slip-dim">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={INPUT_CLASS}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-char">
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * ช่องติ๊กถูกพร้อมคำอธิบาย ใช้กับสถานะเปิด/ปิดใช้งาน
 *
 * @param label - ข้อความอธิบายว่าติ๊กแล้วเกิดอะไรขึ้น
 * @param checked - สถานะปัจจุบัน
 * @param onChange - ฟังก์ชันรับสถานะใหม่
 * @returns บล็อกช่องติ๊กถูก
 */
export function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-[44px] items-center gap-3 text-slip">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 shrink-0"
      />
      <span>{label}</span>
    </label>
  );
}

/**
 * แถวปุ่มท้ายฟอร์ม พร้อมช่องแสดงข้อความผิดพลาดของฟอร์มนั้น
 * รวมไว้ที่เดียวเพื่อให้ทุกฟอร์มวางปุ่มและแสดง error เหมือนกัน
 *
 * @param error - ข้อความผิดพลาดจากเซิร์ฟเวอร์ ถ้าไม่มีจะไม่แสดงอะไร
 * @param saving - true ระหว่างกำลังบันทึก ใช้ปิดปุ่มกันกดซ้ำ
 * @param onCancel - ฟังก์ชันปิดฟอร์ม
 * @param submitLabel - ข้อความบนปุ่มบันทึก
 * @returns แถวปุ่มยกเลิกและบันทึก
 */
export function FormActions({
  error,
  saving,
  onCancel,
  submitLabel = 'บันทึก',
}: {
  error: string;
  saving: boolean;
  onCancel: () => void;
  submitLabel?: string;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="rounded-lg border-l-4 border-void bg-char px-3 py-2 text-sm text-slip">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] rounded-lg bg-char px-4 text-slip"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={saving}
          className="min-h-[44px] rounded-lg bg-flame px-4 font-medium text-char disabled:opacity-60"
        >
          {saving ? 'กำลังบันทึก…' : submitLabel}
        </button>
      </div>
    </>
  );
}
