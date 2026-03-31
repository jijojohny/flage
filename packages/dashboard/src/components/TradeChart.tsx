'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { ChartDataPoint } from '@/lib/types';

interface TradeChartProps {
  data: ChartDataPoint[];
}

export function TradeChart({ data }: TradeChartProps) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      padding: '20px',
    }}>
      {data.length === 0 ? (
        <div className="empty-state" style={{ height: 160 }}>No trade data yet</div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} barGap={2} barCategoryGap="30%">
            <XAxis
              dataKey="time"
              tick={{ fill: '#444430', fontSize: 10, fontFamily: 'var(--font)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#444430', fontSize: 10, fontFamily: 'var(--font)' }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip
              contentStyle={{
                background: '#0e0e0e',
                border: '1px solid var(--border)',
                color: 'var(--accent)',
                fontFamily: 'var(--font)',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
              cursor={{ fill: 'rgba(255,230,0,0.03)' }}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#444430', fontFamily: 'var(--font)', textTransform: 'uppercase', letterSpacing: '0.08em' }} />
            <Bar dataKey="buys"  name="Buys"  fill="#39ff14" radius={[2,2,0,0]} />
            <Bar dataKey="sells" name="Sells" fill="#ff3131" radius={[2,2,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
