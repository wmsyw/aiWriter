'use client';

import React, { useMemo, useState } from 'react';

type HookStatus = 'planted' | 'referenced' | 'resolved' | 'abandoned';
type HookType = 'foreshadowing' | 'chekhov_gun' | 'mystery' | 'promise' | 'setup';
type HookImportance = 'critical' | 'major' | 'minor';

export interface NarrativeHook {
  id: string;
  type: HookType;
  description: string;
  plantedInChapter: number;
  plantedContext?: string;
  referencedInChapters: number[];
  resolvedInChapter?: number;
  resolutionContext?: string;
  status: HookStatus;
  importance: HookImportance;
  expectedResolutionBy?: number;
  reminderThreshold?: number;
  relatedCharacters: string[];
  notes?: string;
  createdAt: string;
}

interface HookTimelineProps {
  hooks: NarrativeHook[];
  totalChapters?: number;
}

const CHAPTER_WIDTH = 60;
const LANE_HEIGHT = 20;
const TOP_PADDING = 30;
const BOTTOM_PADDING = 30;
const DOT_RADIUS = 6;

const COLORS = {
  critical: '#f43f5e',
  major: '#f97316',
  minor: '#6b7280',
  resolved: '#10b981',
  line: '#cbd5e1',
  lineResolved: '#10b981',
  deadZone: 'rgba(239, 68, 68, 0.05)',
  grid: 'rgba(255, 255, 255, 0.05)',
  text: '#94a3b8',
};

export default function HookTimeline({ hooks, totalChapters }: HookTimelineProps) {
  const [hoveredHook, setHoveredHook] = useState<string | null>(null);

  const { 
    lanes, 
    maxChapter, 
    calculatedHeight,
    deadZones 
  } = useMemo(() => {
    const maxHookChapter = Math.max(
      ...hooks.map(h => Math.max(
        h.plantedInChapter, 
        ...(h.referencedInChapters || []), 
        h.resolvedInChapter || 0,
        h.expectedResolutionBy || 0
      )), 
      0
    );
    const finalMaxChapter = Math.max(totalChapters || 0, maxHookChapter, 10);

    const items = hooks.map(hook => {
      const start = hook.plantedInChapter;
      const end = Math.max(
        start, 
        ...(hook.referencedInChapters || []), 
        hook.resolvedInChapter || start
      );
      
      return {
        ...hook,
        start,
        end,
      };
    }).sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

    const laneBusyUntil: number[] = [];
    const processedItems: (typeof items[0] & { lane: number })[] = [];

    items.forEach(item => {
      let laneIndex = -1;
      
      for (let i = 0; i < laneBusyUntil.length; i++) {
        if (laneBusyUntil[i] < item.start) {
          laneIndex = i;
          break;
        }
      }

      if (laneIndex === -1) {
        laneIndex = laneBusyUntil.length;
        laneBusyUntil.push(0);
      }

      laneBusyUntil[laneIndex] = item.end + 0.5; 
      
      processedItems.push({ ...item, lane: laneIndex });
    });

    const laneCount = Math.max(laneBusyUntil.length, 3);
    const calculatedHeight = Math.max(120, laneCount * LANE_HEIGHT + TOP_PADDING + BOTTOM_PADDING);

    const chaptersWithActivity = new Set<number>();
    hooks.forEach(h => chaptersWithActivity.add(h.plantedInChapter));
    
    const deadZones: { start: number, end: number }[] = [];
    let currentDeadRun = 0;
    let deadStart = -1;

    for (let i = 1; i <= finalMaxChapter; i++) {
      if (!chaptersWithActivity.has(i)) {
        if (currentDeadRun === 0) deadStart = i;
        currentDeadRun++;
      } else {
        if (currentDeadRun >= 3) {
          deadZones.push({ start: deadStart, end: i - 1 });
        }
        currentDeadRun = 0;
      }
    }
    
    if (currentDeadRun >= 3) {
      deadZones.push({ start: deadStart, end: finalMaxChapter });
    }

    return {
      lanes: processedItems,
      maxChapter: finalMaxChapter,
      calculatedHeight,
      deadZones
    };
  }, [hooks, totalChapters]);

  const getX = (chapter: number) => (chapter - 1) * CHAPTER_WIDTH + CHAPTER_WIDTH / 2;
  const getY = (lane: number) => TOP_PADDING + lane * LANE_HEIGHT + LANE_HEIGHT / 2;
  const getColor = (importance: HookImportance) => COLORS[importance] || COLORS.minor;

  return (
    <div className="w-full overflow-hidden rounded-2xl bg-[#0f172a]/50 border border-white/5 backdrop-blur-sm relative group">
      <div className="overflow-x-auto overflow-y-hidden custom-scrollbar" style={{ height: '120px' }}>
        <div style={{ width: `${maxChapter * CHAPTER_WIDTH}px`, height: '100%', minWidth: '100%' }} className="relative">
          <svg 
            width={Math.max(maxChapter * CHAPTER_WIDTH, 100)} 
            height={calculatedHeight}
            className="absolute top-0 left-0"
            style={{ minHeight: '100%' }}
          >
            <defs>
              <pattern id="grid" width={CHAPTER_WIDTH} height="100%" patternUnits="userSpaceOnUse">
                <line x1={CHAPTER_WIDTH} y1="0" x2={CHAPTER_WIDTH} y2="100%" stroke={COLORS.grid} strokeWidth="1" strokeDasharray="4 4" />
              </pattern>
            </defs>

            <rect width="100%" height="100%" fill="url(#grid)" />

            {deadZones.map((zone, i) => (
              <rect
                key={`dead-${i}`}
                x={(zone.start - 1) * CHAPTER_WIDTH}
                y="0"
                width={(zone.end - zone.start + 1) * CHAPTER_WIDTH}
                height="100%"
                fill={COLORS.deadZone}
                className="animate-pulse"
              />
            ))}

            <g transform={`translate(0, ${calculatedHeight - 20})`}>
              {Array.from({ length: maxChapter }).map((_, i) => {
                const chapterNum = i + 1;
                return (
                  <text
                    key={`ch-${chapterNum}`}
                    x={getX(chapterNum)}
                    y="10"
                    textAnchor="middle"
                    fill={COLORS.text}
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {chapterNum}
                  </text>
                );
              })}
            </g>

            {lanes.map((hook) => {
              const y = getY(hook.lane);
              const startX = getX(hook.plantedInChapter);
              const color = getColor(hook.importance);
              const isResolved = !!hook.resolvedInChapter;
              const opacity = hoveredHook && hoveredHook !== hook.id ? 0.2 : 1;

              let pathD = `M ${startX} ${y}`;
              
              const points = [
                ...(hook.referencedInChapters || []).map((ch: number) => ({ x: getX(ch), type: 'ref' })),
                ...(hook.resolvedInChapter ? [{ x: getX(hook.resolvedInChapter), type: 'res' }] : [])
              ].sort((a, b) => a.x - b.x);

              points.forEach(p => {
                pathD += ` L ${p.x} ${y}`;
              });

              return (
                <g 
                  key={hook.id} 
                  style={{ opacity, transition: 'opacity 0.2s' }}
                  onMouseEnter={() => setHoveredHook(hook.id)}
                  onMouseLeave={() => setHoveredHook(null)}
                >
                  <path
                    d={pathD}
                    stroke={isResolved ? COLORS.resolved : color}
                    strokeWidth="2"
                    fill="none"
                    strokeDasharray={isResolved ? 'none' : '4 4'}
                    opacity="0.6"
                  />

                  <circle
                    cx={startX}
                    cy={y}
                    r={DOT_RADIUS}
                    fill={color}
                    className="cursor-pointer transition-all hover:r-8"
                  />
                  
                  {hook.referencedInChapters.map((ch: number, idx: number) => (
                    <circle
                      key={`ref-${idx}`}
                      cx={getX(ch)}
                      cy={y}
                      r={DOT_RADIUS - 2}
                      fill={color}
                      stroke="#0f172a"
                      strokeWidth="2"
                    />
                  ))}

                  {hook.resolvedInChapter && (
                    <g transform={`translate(${getX(hook.resolvedInChapter)}, ${y})`}>
                       <circle
                        r={DOT_RADIUS}
                        fill={COLORS.resolved}
                        stroke="#0f172a"
                        strokeWidth="2"
                      />
                      <path d="M-2.5 0 L-1 2 L 3 -2" stroke="white" strokeWidth="1.5" fill="none" />
                    </g>
                  )}
                  
                  {hook.expectedResolutionBy && !hook.resolvedInChapter && hook.expectedResolutionBy < (totalChapters || maxChapter) && (
                     <circle
                       cx={getX(hook.expectedResolutionBy)}
                       cy={y}
                       r={DOT_RADIUS + 2}
                       fill="none"
                       stroke={COLORS.major}
                       strokeWidth="1.5"
                       strokeDasharray="2 2"
                       className="animate-ping"
                     />
                  )}
                </g>
              );
            })}
          </svg>
          
          {hoveredHook && (
            (() => {
              const hook = lanes.find(h => h.id === hoveredHook);
              if (!hook) return null;
              const x = getX(hook.plantedInChapter);
              const left = Math.min(Math.max(x, 10), (maxChapter * CHAPTER_WIDTH) - 200); 
              
              return (
                <div 
                  className="absolute pointer-events-none z-10 bg-slate-800/90 backdrop-blur border border-slate-700 p-3 rounded-lg shadow-xl text-xs w-64"
                  style={{ 
                    left: left, 
                    top: getY(hook.lane) + 15 
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-bold uppercase ${
                      hook.importance === 'critical' ? 'text-rose-400' : 
                      hook.importance === 'major' ? 'text-orange-400' : 'text-gray-400'
                    }`}>
                      {hook.importance}
                    </span>
                    <span className="text-slate-400">Ch {hook.plantedInChapter}</span>
                  </div>
                  <p className="text-white font-medium mb-1 line-clamp-2">{hook.description}</p>
                  <div className="text-slate-500 flex gap-2">
                    {hook.referencedInChapters.length > 0 && <span>Refs: {hook.referencedInChapters.join(', ')}</span>}
                    {hook.resolvedInChapter && <span className="text-emerald-400">Resolved: {hook.resolvedInChapter}</span>}
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
}
