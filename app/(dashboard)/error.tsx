'use client';

import { useEffect } from 'react';
import { Button } from '@/app/components/ui/Button';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

const CHUNK_RETRY_KEY = 'dashboard_chunk_retry_once';

function isChunkLoadError(error: Error): boolean {
  const message = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
  return (
    message.includes('chunkloaderror') ||
    message.includes('loading chunk') ||
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('importing a module script failed')
  );
}

export default function DashboardError({ error, reset }: ErrorProps) {
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  useEffect(() => {
    if (!chunkError) {
      sessionStorage.removeItem(CHUNK_RETRY_KEY);
      return;
    }

    const retried = sessionStorage.getItem(CHUNK_RETRY_KEY) === '1';
    if (!retried) {
      sessionStorage.setItem(CHUNK_RETRY_KEY, '1');
      window.location.reload();
      return;
    }

    sessionStorage.removeItem(CHUNK_RETRY_KEY);
  }, [chunkError]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="glass-card rounded-2xl p-8 max-w-md text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        
        <div>
          <h2 className="text-xl font-bold text-white mb-2">出现了问题</h2>
          <p className="text-gray-400 text-sm">
            {chunkError
              ? '检测到资源版本不一致，正在尝试自动刷新。若仍失败，请点击“强制刷新”。'
              : '页面加载时发生错误，请尝试刷新或返回上一页。'}
          </p>
        </div>

        {error.digest && (
          <p className="text-xs text-gray-600 font-mono">
            错误代码: {error.digest}
          </p>
        )}

        <div className="flex gap-3 justify-center">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={reset}
            className="px-6"
          >
            重试
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => window.history.back()}
            className="px-6"
          >
            返回
          </Button>
          {chunkError && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => window.location.reload()}
              className="px-6"
            >
              强制刷新
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
