/**
 * ธีมมาตรฐานสำหรับ SweetAlert2 สไตล์ Commercial Flat & Slate
 * ใช้แทน Alert สไตล์การ์ตูน: ตัวอักษรคมชัด, ปุ่มสวยงาม, ไร้อีโมจิ, ป้องกันการซ้อนทับขอบจอ
 */

export const swalCommercialTheme = {
  customClass: {
    container: 'z-[9999]',
    popup: 'rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl font-sans text-slate-900 max-w-md w-full mx-4',
    title: 'text-base font-bold text-slate-900 tracking-tight leading-tight',
    htmlContainer: 'text-sm text-slate-600 leading-relaxed mt-2',
    actions: 'flex items-center justify-end gap-2.5 mt-5 w-full border-t border-slate-100 pt-4',
    confirmButton: 'rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700 cursor-pointer shadow-xs',
    cancelButton: 'rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer',
    denyButton: 'rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-700 transition-colors cursor-pointer',
  },
  buttonsStyling: false,
  backdrop: 'rgba(0, 0, 0, 0.5)',
};

export const swalToastTheme = {
  toast: true,
  position: 'top-end' as const,
  showConfirmButton: false,
  timer: 3500,
  timerProgressBar: true,
  customClass: {
    container: 'z-[9999]',
    popup: 'rounded-2xl border border-slate-200 bg-white p-4 shadow-xl font-sans text-slate-900 flex items-center gap-3',
    title: 'text-xs font-semibold text-slate-900 leading-tight',
    htmlContainer: 'text-xs text-slate-600',
  },
};
