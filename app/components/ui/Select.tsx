'use client';

import { useState, useRef, useEffect } from 'react';

interface Option {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
}

export function Select({ label, value, onChange, options, placeholder = '请选择...', className = '' }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && <label className="block text-sm font-medium text-gray-300 mb-2">{label}</label>}
      <button
        type="button"
        className={`glass-input w-full px-4 py-2 flex justify-between items-center cursor-pointer hover:border-white/30 transition-colors ${
          isOpen ? 'border-indigo-500/50 ring-1 ring-indigo-500/50 bg-black/30' : ''
        }`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={`block truncate ${selectedOption ? 'text-white' : 'text-gray-500'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ml-2 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 glass-panel rounded-xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar animate-slide-up border border-white/10 overflow-hidden">
          <div className="py-1">
            {options.map((option) => (
              <div
                key={option.value}
                className={`px-4 py-2.5 text-sm cursor-pointer transition-all duration-150 ${
                  option.value === value
                    ? 'bg-indigo-500/20 text-indigo-300 font-medium'
                    : 'text-gray-300 hover:bg-white/10 hover:text-white hover:pl-5'
                }`}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                {option.label}
              </div>
            ))}
            {options.length === 0 && (
               <div className="px-4 py-3 text-sm text-gray-500 text-center">无选项</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
