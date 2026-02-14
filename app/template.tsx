'use client';

import PageTransition from '@/app/components/PageTransition';

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <PageTransition pageClassName="animate-fade-in">
      {children}
    </PageTransition>
  );
}
