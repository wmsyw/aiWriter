'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthShell from '@/app/components/AuthShell';
import { Input } from '@/app/components/ui/Input';
import { Button } from '@/app/components/ui/Button';

export default function SetupPage() {
  const router = useRouter();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth/setup')
      .then(res => res.json())
      .then(data => {
        if (!data.needsSetup) {
          router.push('/');
        } else {
          setNeedsSetup(true);
        }
      });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, token }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '设置失败');
      }

      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '设置失败');
    } finally {
      setLoading(false);
    }
  };

  if (needsSetup === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-14 h-14 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <AuthShell
      title="系统初始化"
      subtitle="创建管理员账号，完成首次部署配置"
      tone="sky"
      icon={
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          type="email"
          label="管理员邮箱"
          placeholder="admin@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <Input
          type="password"
          label="设置密码"
          placeholder="至少 8 位字符"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />

        <Input
          type="text"
          label="安全令牌"
          placeholder="请输入 ADMIN_SETUP_TOKEN"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
        />

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm animate-fade-in">
            {error}
          </div>
        )}

        <Button type="submit" isLoading={loading} className="w-full h-11 text-base mt-1">
          {loading ? '创建中...' : '创建管理员账号'}
        </Button>
      </form>
    </AuthShell>
  );
}
