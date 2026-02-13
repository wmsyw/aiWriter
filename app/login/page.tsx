'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthShell from '@/app/components/AuthShell';
import { Input } from '@/app/components/ui/Input';
import { Button } from '@/app/components/ui/Button';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '登录失败');
      }

      router.push('/novels');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="欢迎回来"
      subtitle="登录 AI Writer，继续你的创作进度"
      tone="emerald"
      icon={
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      }
      footer={
        <>
          还没有账号？{' '}
          <Link href="/setup" className="text-emerald-400 hover:text-emerald-300 font-medium">
            注册账号
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          type="email"
          label="邮箱地址"
          placeholder="author@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-zinc-300">密码</label>
            <Link href="/reset-password" className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
              忘记密码？
            </Link>
          </div>
          <Input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm animate-fade-in">
            {error}
          </div>
        )}

        <Button type="submit" isLoading={loading} className="w-full h-11 text-base mt-1">
          {loading ? '登录中...' : '立即登录'}
        </Button>
      </form>
    </AuthShell>
  );
}
