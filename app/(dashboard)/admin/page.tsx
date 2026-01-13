'use client';

import { useState, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  role: string;
  createdAt: string;
}

interface AuditEvent {
  id: string;
  userId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  success: boolean;
  createdAt: string;
}

interface ModelPrice {
  id: string;
  provider: string;
  model: string;
  promptTokenPrice: number;
  completionTokenPrice: number;
}

interface UsageStats {
  totalTokens: number;
  totalCost: number;
  byProvider: Record<string, { tokens: number; cost: number }>;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'audit' | 'pricing' | 'usage'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [prices, setPrices] = useState<ModelPrice[]>([]);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingPrice, setEditingPrice] = useState<ModelPrice | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  async function loadData() {
    setLoading(true);
    try {
      if (activeTab === 'audit') {
        const res = await fetch('/api/audit');
        if (res.ok) {
          const data = await res.json();
          setAuditEvents(data.events || []);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const tabs = [
    { id: 'users', label: 'Users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { id: 'audit', label: 'Audit Log', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { id: 'pricing', label: 'Model Pricing', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'usage', label: 'Usage Stats', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  ];

  return (
    <div className="p-8 animate-fade-in">
      <h1 className="text-3xl font-bold text-gradient mb-8">Admin Panel</h1>

      <div className="flex gap-2 mb-8">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
              activeTab === tab.id
                ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white'
                : 'glass-card hover:bg-white/10'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {activeTab === 'users' && (
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-xl font-semibold mb-4">User Management</h2>
              <p className="text-gray-400">User management features coming soon.</p>
              <p className="text-gray-500 mt-2 text-sm">Current implementation uses direct database access.</p>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-xl font-semibold mb-4">Audit Log</h2>
              <div className="space-y-2">
                {auditEvents.length === 0 ? (
                  <p className="text-gray-400">No audit events found.</p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-white/10">
                        <th className="pb-2">Time</th>
                        <th className="pb-2">Action</th>
                        <th className="pb-2">Resource</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditEvents.slice(0, 50).map(event => (
                        <tr key={event.id} className="border-b border-white/5">
                          <td className="py-2 text-sm text-gray-400">
                            {new Date(event.createdAt).toLocaleString()}
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
                              {event.success ? 'Success' : 'Failed'}
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

          {activeTab === 'pricing' && (
            <div className="glass-card rounded-2xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Model Pricing</h2>
                <button className="btn-primary px-4 py-2 rounded-lg text-sm">
                  Add Model
                </button>
              </div>
              <p className="text-gray-400 mb-4">Configure token prices per model for cost tracking.</p>
              
              <div className="grid gap-4">
                {[
                  { provider: 'openai', model: 'gpt-4', promptPrice: 30, completionPrice: 60 },
                  { provider: 'openai', model: 'gpt-4-turbo', promptPrice: 10, completionPrice: 30 },
                  { provider: 'openai', model: 'gpt-3.5-turbo', promptPrice: 0.5, completionPrice: 1.5 },
                  { provider: 'claude', model: 'claude-3-opus', promptPrice: 15, completionPrice: 75 },
                  { provider: 'claude', model: 'claude-3-sonnet', promptPrice: 3, completionPrice: 15 },
                  { provider: 'gemini', model: 'gemini-pro', promptPrice: 0.5, completionPrice: 1.5 },
                ].map((price, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                    <div>
                      <span className="text-purple-400 uppercase text-xs font-semibold">{price.provider}</span>
                      <p className="font-medium">{price.model}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-gray-400">Input: ${price.promptPrice}/M tokens</p>
                      <p className="text-gray-400">Output: ${price.completionPrice}/M tokens</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'usage' && (
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-xl font-semibold mb-4">Usage Statistics</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-gradient-to-br from-purple-500/20 to-indigo-500/20 rounded-xl">
                  <p className="text-gray-400 text-sm">Total Tokens</p>
                  <p className="text-2xl font-bold">0</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-xl">
                  <p className="text-gray-400 text-sm">Total Cost</p>
                  <p className="text-2xl font-bold">$0.00</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl">
                  <p className="text-gray-400 text-sm">Jobs Completed</p>
                  <p className="text-2xl font-bold">0</p>
                </div>
              </div>
              <p className="text-gray-400">Detailed usage analytics will appear here as you use the platform.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
