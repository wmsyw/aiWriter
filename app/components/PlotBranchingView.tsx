'use client';

import React, { useState } from 'react';

export interface PlotBranch {
  id: string;
  path: string[];
  description: string;
  probability: number;
  engagement: number;
  consistency: number;
  novelty: number;
  tensionArc: number;
  overallScore: number;
  risks: string[];
  opportunities: string[];
}

export interface HookOpportunity {
  hookId: string;
  hookDescription: string;
  suggestedResolution: string;
}

interface PlotBranchingViewProps {
  branches: PlotBranch[];
  hookOpportunities?: HookOpportunity[];
  deadEndWarnings?: string[];
  onSelectBranch?: (branchId: string) => void;
  selectedBranchId?: string;
}

const cssStyles = `
  .pb-container {
    --color-bg: #0f172a;
    --color-card-bg: rgba(30, 41, 59, 0.7);
    --color-card-border: rgba(255, 255, 255, 0.1);
    --color-primary: #3b82f6;
    --color-emerald: #10b981;
    --color-amber: #f59e0b;
    --color-rose: #f43f5e;
    --color-text-main: #f8fafc;
    --color-text-secondary: #94a3b8;
    --color-highlight: rgba(59, 130, 246, 0.2);

    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: var(--color-text-main);
    padding: 24px;
    background: transparent;
    border-radius: 16px;
    width: 100%;
    box-sizing: border-box;
  }

  .pb-header {
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pb-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text-main);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pb-title::before {
    content: '';
    display: block;
    width: 4px;
    height: 24px;
    background: var(--color-primary);
    border-radius: 2px;
  }

  .pb-warning-box {
    background: rgba(244, 63, 94, 0.1);
    border: 1px solid rgba(244, 63, 94, 0.3);
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 24px;
    color: #fca5a5;
    font-size: 0.9rem;
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .pb-branches {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .pb-branch-card {
    background: var(--color-card-bg);
    border: 1px solid var(--color-card-border);
    border-radius: 12px;
    padding: 20px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
  }

  .pb-branch-card:hover {
    background: rgba(30, 41, 59, 0.9);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-2px);
    box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
  }

  .pb-branch-card.selected {
    border-color: var(--color-primary);
    background: rgba(59, 130, 246, 0.05);
    box-shadow: 0 0 0 1px var(--color-primary);
  }

  .pb-branch-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 12px;
  }

  .pb-branch-desc {
    font-size: 1.1rem;
    font-weight: 500;
    line-height: 1.5;
    color: var(--color-text-main);
  }

  .pb-score-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: rgba(0, 0, 0, 0.2);
    padding: 8px 12px;
    border-radius: 8px;
    min-width: 60px;
  }

  .pb-score-value {
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1;
  }

  .pb-score-label {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    margin-top: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .pb-metrics-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px 24px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .pb-metric-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .pb-metric-header {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: var(--color-text-secondary);
  }

  .pb-progress-bg {
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    overflow: hidden;
  }

  .pb-progress-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.5s ease-out;
  }

  .pb-expanded-content {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    animation: slideDown 0.3s ease-out;
  }

  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .pb-section-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text-secondary);
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .pb-path-list {
    list-style: none;
    padding: 0;
    margin: 0 0 20px 0;
    counter-reset: path-counter;
  }

  .pb-path-item {
    position: relative;
    padding-left: 32px;
    margin-bottom: 12px;
    font-size: 0.95rem;
    line-height: 1.5;
    color: var(--color-text-main);
  }

  .pb-path-item::before {
    counter-increment: path-counter;
    content: counter(path-counter);
    position: absolute;
    left: 0;
    top: 0;
    width: 20px;
    height: 20px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }

  .pb-path-item::after {
    content: '';
    position: absolute;
    left: 9px;
    top: 24px;
    bottom: -16px;
    width: 2px;
    background: rgba(255, 255, 255, 0.05);
  }

  .pb-path-item:last-child::after {
    display: none;
  }

  .pb-tags-group {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 20px;
  }

  .pb-tag {
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .pb-tag-risk {
    background: rgba(244, 63, 94, 0.15);
    color: #fda4af;
    border: 1px solid rgba(244, 63, 94, 0.2);
  }

  .pb-tag-opportunity {
    background: rgba(16, 185, 129, 0.15);
    color: #6ee7b7;
    border: 1px solid rgba(16, 185, 129, 0.2);
  }

  .pb-select-btn {
    width: 100%;
    padding: 12px;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition: background 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .pb-select-btn:hover {
    background: #2563eb;
  }

  .pb-hooks-section {
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .pb-hook-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 12px;
  }

  .pb-hook-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    color: var(--color-amber);
    font-size: 0.9rem;
    font-weight: 500;
  }

  .pb-hook-desc {
    color: var(--color-text-main);
    font-size: 0.95rem;
    margin-bottom: 8px;
  }

  .pb-hook-resolution {
    font-size: 0.9rem;
    color: var(--color-text-secondary);
    padding-left: 12px;
    border-left: 2px solid var(--color-text-secondary);
  }

  .text-emerald { color: var(--color-emerald); }
  .text-amber { color: var(--color-amber); }
  .text-rose { color: var(--color-rose); }
`;

const getScoreColor = (score: number) => {
  if (score >= 80) return 'var(--color-emerald)';
  if (score >= 60) return 'var(--color-amber)';
  return 'var(--color-rose)';
};

const getScoreTextColor = (score: number) => {
  if (score >= 80) return '#34d399';
  if (score >= 60) return '#fbbf24';
  return '#f87171';
};

export default function PlotBranchingView({
  branches,
  hookOpportunities = [],
  deadEndWarnings = [],
  onSelectBranch,
  selectedBranchId,
}: PlotBranchingViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(branches[0]?.id || null);

  const handleCardClick = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (onSelectBranch) {
      onSelectBranch(id);
    }
  };

  return (
    <div className="pb-container">
      <style>{cssStyles}</style>
      
      <div className="pb-header">
        <div className="pb-title">剧情分支预测</div>
      </div>

      {deadEndWarnings.length > 0 && (
        <div className="pb-warning-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            {deadEndWarnings.map((warning, idx) => (
              <div key={idx}>{warning}</div>
            ))}
          </div>
        </div>
      )}

      <div className="pb-branches">
        {branches.map((branch) => {
          const isSelected = selectedBranchId === branch.id;
          const isExpanded = expandedId === branch.id;

          return (
            <div
              key={branch.id}
              className={`pb-branch-card ${isSelected ? 'selected' : ''}`}
              onClick={() => handleCardClick(branch.id)}
            >
              <div className="pb-branch-header">
                <div style={{ flex: 1 }}>
                  <div className="pb-branch-desc">{branch.description}</div>
                </div>
                <div className="pb-score-badge">
                  <span 
                    className="pb-score-value" 
                    style={{ color: getScoreTextColor(branch.overallScore * 100) }}
                  >
                    {Math.round(branch.overallScore * 100)}
                  </span>
                  <span className="pb-score-label">综合评分</span>
                </div>
              </div>

              <div className="pb-metrics-grid">
                <MetricBar label="参与度" value={Math.round(branch.engagement * 100)} />
                <MetricBar label="一致性" value={Math.round(branch.consistency * 100)} />
                <MetricBar label="新颖度" value={Math.round(branch.novelty * 100)} />
                <MetricBar label="张力曲线" value={Math.round(branch.tensionArc * 100)} />
              </div>

              {isExpanded && (
                <div className="pb-expanded-content">
                  <div className="pb-section-title">路径推演</div>
                  <ul className="pb-path-list">
                    {branch.path.map((step, idx) => (
                      <li key={idx} className="pb-path-item">
                        {step}
                      </li>
                    ))}
                  </ul>

                  {(branch.risks.length > 0 || branch.opportunities.length > 0) && (
                    <>
                      <div className="pb-section-title">风险与机会</div>
                      <div className="pb-tags-group">
                        {branch.risks.map((risk, idx) => (
                          <span key={`risk-${idx}`} className="pb-tag pb-tag-risk">
                            ⚠️ {risk}
                          </span>
                        ))}
                        {branch.opportunities.map((opp, idx) => (
                          <span key={`opp-${idx}`} className="pb-tag pb-tag-opportunity">
                            ✨ {opp}
                          </span>
                        ))}
                      </div>
                    </>
                  )}

                  <button 
                    className="pb-select-btn"
                    onClick={(e) => handleSelect(e, branch.id)}
                  >
                    {isSelected ? '当前选择' : '选择此路线'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hookOpportunities.length > 0 && (
        <div className="pb-hooks-section">
          <div className="pb-section-title">待解决伏笔</div>
          {hookOpportunities.map((hook) => (
            <div key={hook.hookId} className="pb-hook-card">
              <div className="pb-hook-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4.4 4.4 0 106.242 6.242l2.828-2.829m-4-7.071l1.06-1.06a5.001 5.001 0 017.072 0l4 4a4.4 4.4 0 11-6.242 6.242l-2.748-2.748" />
                </svg>
                <span>伏笔 #{hook.hookId}</span>
              </div>
              <div className="pb-hook-desc">{hook.hookDescription}</div>
              <div className="pb-hook-resolution">
                建议: {hook.suggestedResolution}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="pb-metric-item">
      <div className="pb-metric-header">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="pb-progress-bg">
        <div 
          className="pb-progress-fill"
          style={{ 
            width: `${value}%`, 
            backgroundColor: getScoreColor(value) 
          }}
        />
      </div>
    </div>
  );
}
