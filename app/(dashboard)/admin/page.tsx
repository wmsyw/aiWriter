'use client';

import { useState, useEffect } from 'react';

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
    <div className="p-8 animate-fade-in">
      <h1 className="text-3xl font-bold text-gradient mb-8">审计日志</h1>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-6">
          <div className="space-y-2">
            {auditEvents.length === 0 ? (
              <p className="text-gray-400">暂无审计记录</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-white/10">
                    <th className="pb-2">时间</th>
                    <th className="pb-2">操作</th>
                    <th className="pb-2">资源</th>
                    <th className="pb-2">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEvents.slice(0, 50).map(event => (
                    <tr key={event.id} className="border-b border-white/5">
                      <td className="py-2 text-sm text-gray-400">
                        {new Date(event.createdAt).toLocaleString('zh-CN')}
                      </td>
                      <td className="py-2 font-mono text-sm">{event.action}</td>
                      <td className="py-2 text-sm">
                        {event.resource}
                        {event.resourceId && <span className="text-gray-500 ml-1">#{event.resourceId.slice(0, 8)}</span>}
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
