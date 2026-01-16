export const colors = {
  dark: {
    bg: 'var(--color-dark-bg, #0f1117)',
    bgSecondary: 'var(--color-dark-secondary, #1a1b26)',
    bgTertiary: '#1a1d28',
    surface: 'var(--color-card-bg, rgba(30, 32, 48, 0.4))',
    surfaceHover: 'rgba(26, 29, 40, 0.8)',
    border: 'var(--color-card-border, rgba(255, 255, 255, 0.08))',
    borderHover: 'rgba(255, 255, 255, 0.12)',
    borderActive: 'rgba(99, 102, 241, 0.5)',
  },
  text: {
    primary: '#f1f5f9',
    secondary: '#94a3b8',
    tertiary: '#64748b',
    muted: '#475569',
    inverse: '#0f172a',
  },
  primary: {
    50: '#eef2ff',
    100: '#e0e7ff',
    200: '#c7d2fe',
    300: '#a5b4fc',
    400: 'var(--color-primary-start, #818cf8)',
    500: '#6366f1',
    600: '#4f46e5',
    700: '#4338ca',
    gradient: 'linear-gradient(135deg, var(--color-primary-start, #818cf8) 0%, var(--color-primary-end, #c084fc) 100%)',
    glow: 'rgba(99, 102, 241, 0.4)',
  },
  accent: {
    cyan: 'var(--color-accent, #22d3ee)',
    emerald: '#10b981',
    amber: '#f59e0b',
    rose: '#f43f5e',
  },
  status: {
    success: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
    warning: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' },
    error: { bg: 'rgba(244, 63, 94, 0.15)', text: '#f43f5e', border: 'rgba(244, 63, 94, 0.3)' },
    info: { bg: 'rgba(34, 211, 238, 0.15)', text: '#22d3ee', border: 'rgba(34, 211, 238, 0.3)' },
    queued: { bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)' },
    running: { bg: 'rgba(99, 102, 241, 0.15)', text: '#818cf8', border: 'rgba(99, 102, 241, 0.3)' },
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
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.3)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
  glass: '0 8px 32px 0 rgba(0, 0, 0, 0.36)',
  glow: {
    primary: '0 0 20px rgba(99, 102, 241, 0.3)',
    success: '0 0 20px rgba(16, 185, 129, 0.3)',
    error: '0 0 20px rgba(244, 63, 94, 0.3)',
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
