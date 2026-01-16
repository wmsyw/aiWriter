export const colors = {
  dark: {
    bg: '#09090b',
    bgSecondary: '#18181b',
    bgTertiary: '#27272a',
    surface: 'rgba(24, 24, 27, 0.95)',
    surfaceHover: 'rgba(39, 39, 42, 0.95)',
    border: 'rgba(63, 63, 70, 1)',
    borderHover: 'rgba(82, 82, 91, 1)',
    borderActive: 'rgba(16, 185, 129, 0.5)',
  },
  text: {
    primary: '#f4f4f5',
    secondary: '#a1a1aa',
    tertiary: '#71717a',
    muted: '#52525b',
    inverse: '#09090b',
  },
  primary: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',
    600: '#059669',
    700: '#047857',
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    glow: 'rgba(16, 185, 129, 0.4)',
  },
  accent: {
    amber: '#f59e0b',
    amberLight: '#fbbf24',
    emerald: '#10b981',
    blue: '#3b82f6',
    rose: '#f43f5e',
  },
  status: {
    success: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
    warning: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' },
    error: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
    info: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
    queued: { bg: 'rgba(113, 113, 122, 0.15)', text: '#a1a1aa', border: 'rgba(113, 113, 122, 0.3)' },
    running: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' },
  },
} as const;

export const spacing = {
  0: '0',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
} as const;

export const typography = {
  fontFamily: {
    sans: "'Inter', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif",
    serif: "'Noto Serif SC', 'Songti SC', 'SimSun', serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },
  fontSize: {
    xs: ['0.75rem', { lineHeight: '1rem' }],
    sm: ['0.875rem', { lineHeight: '1.25rem' }],
    base: ['1rem', { lineHeight: '1.75rem' }],
    lg: ['1.125rem', { lineHeight: '1.75rem' }],
    xl: ['1.25rem', { lineHeight: '1.75rem' }],
    '2xl': ['1.5rem', { lineHeight: '2rem' }],
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const;

export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.4)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.4)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.4)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
  surface: '0 8px 32px 0 rgba(0, 0, 0, 0.5)',
  glow: {
    primary: '0 0 24px rgba(16, 185, 129, 0.3)',
    accent: '0 0 24px rgba(245, 158, 11, 0.3)',
    success: '0 0 24px rgba(16, 185, 129, 0.3)',
    error: '0 0 24px rgba(239, 68, 68, 0.3)',
  },
} as const;

export const radii = {
  none: '0',
  sm: '0.375rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
  '2xl': '1.5rem',
  full: '9999px',
} as const;

export const transitions = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  normal: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
  spring: '500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

export const zIndex = {
  dropdown: 50,
  sticky: 100,
  fixed: 200,
  modal: 300,
  popover: 400,
  tooltip: 500,
} as const;
