'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/app/components/ui/Button';

interface AuditEvent {
  id: string;
  userId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  success: boolean;
  createdAt: string;
}

export default function AdminPage() {
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch('/api/audit');
      if (res.ok) {
        const data = await res.json();
        setAuditEvents(data.events || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      <div className="page-header items-start gap-4">
        <div>
          <h1 className="page-title">审计日志</h1>
          <p className="page-subtitle">查看关键操作与审计追踪记录（显示最近 50 条）</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="min-w-[96px]"
          onClick={loadData}
          isLoading={loading}
          loadingText="刷新中..."
          leftIcon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m14.836 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-14.837-2m14.837 2H15" />
            </svg>
          }
        >
          刷新
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-emerald-500/40 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="content-section">
          <div className="space-y-2">
            {auditEvents.length === 0 ? (
              <p className="text-zinc-400">暂无审计记录</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800/80 text-left text-zinc-400">
                    <th className="pb-3 font-medium">时间</th>
                    <th className="pb-3 font-medium">操作</th>
                    <th className="pb-3 font-medium">资源</th>
                    <th className="pb-3 font-medium">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEvents.slice(0, 50).map(event => (
                    <tr key={event.id} className="border-b border-zinc-800/40 last:border-b-0 hover:bg-white/[0.02] transition-colors">
                      <td className="py-2 text-sm text-zinc-400">
                        {new Date(event.createdAt).toLocaleString('zh-CN')}
                      </td>
                      <td className="py-2 font-mono text-sm">{event.action}</td>
                      <td className="py-2 text-sm">
                        {event.resource}
                        {event.resourceId && <span className="text-zinc-500 ml-1">#{event.resourceId.slice(0, 8)}</span>}
                      </td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          event.success ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {event.success ? '成功' : '失败'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
