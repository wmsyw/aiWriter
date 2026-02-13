'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthShell from '@/app/components/AuthShell';
import { Input } from '@/app/components/ui/Input';
import { Button } from '@/app/components/ui/Button';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => router.push('/login'), 1800);
      return () => clearTimeout(timer);
    }
  }, [success, router]);

  if (!token) {
    return (
      <AuthShell
        title="链接无效"
        subtitle="密码重置链接无效或已过期，请重新申请。"
        tone="amber"
        icon={
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <circle cx="12" cy="12" r="9" strokeWidth={2}></circle>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 9l-6 6m0-6l6 6" />
          </svg>
        }
      >
        <div className="text-center text-zinc-400 text-sm">请检查邮件中的最新链接后重试。</div>
      </AuthShell>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '重置失败');
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置失败');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthShell
        title="密码已更新"
        subtitle="即将返回登录页，请使用新密码登录。"
        tone="emerald"
        icon={
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        }
      >
        <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
          <div className="h-full bg-emerald-500 animate-[shimmer_1.8s_linear_infinite]" />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="重置密码"
      subtitle="请输入新密码并确认。"
      tone="emerald"
      icon={
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2h-1V9a5 5 0 10-10 0v2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
        </svg>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          type="password"
          label="新密码"
          placeholder="至少 8 位字符"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />

        <Input
          type="password"
          label="确认密码"
          placeholder="再次输入新密码"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={8}
          required
        />

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm animate-fade-in">
            {error}
          </div>
        )}

        <Button type="submit" isLoading={loading} className="w-full h-11 text-base mt-1">
          {loading ? '重置中...' : '重置密码'}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-14 h-14 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
