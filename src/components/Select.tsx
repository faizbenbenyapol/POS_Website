'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';

export type SelectOption = {
  value: string;
  label: string;
  icon?: ReactNode;
};

export type CustomSelectProps = {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  icon?: ReactNode;
  className?: string;
  disabled?: boolean;
};

/**
 * Dropdown สไตล์ flat — ไม่มี backdrop-blur ไม่มี gradient
 * มองเห็นชัดเจน ทำงานเร็ว เหมือน dropdown ของ Stripe/Linear
 */
export default function CustomSelect({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = 'เลือกรายการ...',
  icon,
  className = '',
  disabled = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`flex flex-col gap-1 ${className}`} ref={containerRef}>
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-zinc-500">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          id={id}
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen((prev) => !prev)}
          className={`flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-white px-3 text-sm text-zinc-800 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-green-600/30 ${
            isOpen ? 'border-green-600 ring-2 ring-green-600/20' : 'border-zinc-300'
          } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
        >
          <div className="flex items-center gap-2 truncate">
            {icon && <span className="shrink-0 text-zinc-400">{icon}</span>}
            <span className="truncate text-xs">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
          </div>

          <svg
            className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform duration-150 ${
              isOpen ? 'rotate-180' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown menu — shadow เบา ไม่มี blur */}
        {isOpen && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-center text-xs text-zinc-400">ไม่มีตัวเลือก</div>
            ) : (
              options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors ${
                      isSelected
                        ? 'bg-green-50 font-semibold text-green-700'
                        : 'text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    {option.icon && <span>{option.icon}</span>}
                    <span className="truncate">{option.label}</span>
                    {isSelected && (
                      <svg className="ml-auto h-3.5 w-3.5 shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
