'use client';

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-slide-up">
      {children}
    </div>
  );
}
