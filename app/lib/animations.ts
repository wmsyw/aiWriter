import { Variants, Transition } from 'framer-motion';

export const springTransition: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
};

export const smoothTransition: Transition = {
  type: 'tween',
  ease: [0.16, 1, 0.3, 1],
  duration: 0.4,
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: smoothTransition },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

export const slideUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: smoothTransition },
  exit: { opacity: 0, y: 10, transition: { duration: 0.2 } },
};

export const slideDown: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0, transition: smoothTransition },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: smoothTransition },
  exit: { opacity: 0, x: 20, transition: { duration: 0.2 } },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: smoothTransition },
  exit: { opacity: 0, x: -20, transition: { duration: 0.2 } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: springTransition },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
};

export const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 10 },
  visible: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 500,
      damping: 35,
    }
  },
  exit: { 
    opacity: 0, 
    scale: 0.96, 
    transition: { duration: 0.15 } 
  },
};

export const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: smoothTransition,
  },
};

export const cardHover = {
  rest: { 
    scale: 1, 
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.36)',
  },
  hover: { 
    scale: 1.02, 
    boxShadow: '0 12px 40px 0 rgba(99, 102, 241, 0.2)',
    transition: springTransition,
  },
  tap: { 
    scale: 0.98,
    transition: { duration: 0.1 },
  },
};

export const buttonHover = {
  rest: { scale: 1 },
  hover: { scale: 1.02, transition: springTransition },
  tap: { scale: 0.98, transition: { duration: 0.1 } },
};

export const pulseGlow = {
  animate: {
    boxShadow: [
      '0 0 0 0 rgba(99, 102, 241, 0.4)',
      '0 0 0 10px rgba(99, 102, 241, 0)',
    ],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

export const shimmer: Variants = {
  animate: {
    backgroundPosition: ['200% 0', '-200% 0'],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

export const progressBar = {
  initial: { width: 0 },
  animate: (percent: number) => ({
    width: `${percent}%`,
    transition: { duration: 0.5, ease: 'easeOut' },
  }),
};

export const typewriter = {
  hidden: { width: 0 },
  visible: {
    width: '100%',
    transition: {
      duration: 0.8,
      ease: 'linear',
    },
  },
};

export const revealText: Variants = {
  hidden: { 
    opacity: 0,
    y: 20,
    filter: 'blur(10px)',
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

export const listItem: Variants = {
  hidden: { opacity: 0, x: -10 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: smoothTransition,
  },
  exit: { 
    opacity: 0, 
    x: 10, 
    transition: { duration: 0.2 } 
  },
};
