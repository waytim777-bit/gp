import type React from 'react';
import { useMemo, useState } from 'react';
import { Card } from '@heroui/react/card';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { KlineRow, KlineSeriesReport, ReportLanguage } from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';
import { coerceFiniteNumber, formatGrowthPct } from './financialFormat';

interface KlineChartSectionProps {
  klineSeries?: KlineSeriesReport;
  weeklyKlineSeries?: KlineSeriesReport;
  language?: ReportLanguage;
  compact?: boolean;
  variant?: 'daily' | 'weekly';
  displayMode?: 'tabs' | 'single';
}

type ChartRow = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  ma5?: number | null;
  ma10?: number | null;
  ma20?: number | null;
};

const normalizeRow = (row: KlineRow): ChartRow | null => {
  const open = coerceFiniteNumber(row.open);
  const high = coerceFiniteNumber(row.high);
  const low = coerceFiniteNumber(row.low);
  const close = coerceFiniteNumber(row.close);
  const date = row.date;
  if (!date || open == null || high == null || low == null || close == null) {
    return null;
  }
  return {
    date,
    open,
    high,
    low,
    close,
    ma5: coerceFiniteNumber(row.ma5),
    ma10: coerceFiniteNumber(row.ma10),
    ma20: coerceFiniteNumber(row.ma20),
  };
};

const formatDateLabel = (value: string): string => value.slice(5);

const normalizeRows = (klineSeries?: KlineSeriesReport): ChartRow[] => (
  (klineSeries?.rows ?? [])
    .map((row) => normalizeRow(row))
    .filter((row): row is ChartRow => row != null)
);

export const KlineChartSection: React.FC<KlineChartSectionProps> = ({
  klineSeries,
  weeklyKlineSeries,
  language,
  compact = false,
  variant = 'daily',
  displayMode = 'tabs',
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const dailyRows = useMemo(() => normalizeRows(klineSeries), [klineSeries]);
  const weeklyRows = useMemo(() => normalizeRows(weeklyKlineSeries), [weeklyKlineSeries]);
  const hasDaily = dailyRows.length > 0;
  const hasWeekly = weeklyRows.length > 0;
  const initialTab = variant === 'weekly' && hasWeekly && !hasDaily ? 'weekly' : 'daily';
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly'>(initialTab);

  if (!hasDaily && !hasWeekly) {
    return null;
  }

  const selectedTab = displayMode === 'single'
    ? variant
    : activeTab === 'weekly' && hasWeekly
      ? 'weekly'
      : activeTab === 'daily' && hasDaily ? 'daily' : hasWeekly ? 'weekly' : 'daily';
  const activeSeries = selectedTab === 'weekly' ? weeklyKlineSeries : klineSeries;
  const rows = selectedTab === 'weekly' ? weeklyRows : dailyRows;
  const snapshot = activeSeries?.snapshot;
  const copy = reportLanguage === 'en'
    ? {
      title: 'K-Line Trend',
      range: 'Range High/Low',
      latest: 'Latest Close',
      fromLow: 'From Low',
      fromHigh: 'From High',
      change20d: '20D Change',
      source: 'Source',
      daily: 'D',
      weekly: 'W',
      close: 'Close',
      ma5: 'MA5',
      ma10: 'MA10',
      ma20: 'MA20',
      chartLabel: 'K-line trend chart with moving averages',
    }
    : {
      title: 'K线走势',
      range: '区间高/低',
      latest: '最新收盘',
      fromLow: '距低点',
      fromHigh: '距高点',
      change20d: '近20日涨跌',
      source: '数据源',
      daily: '日',
      weekly: '周',
      close: '收盘',
      ma5: 'MA5',
      ma10: 'MA10',
      ma20: 'MA20',
      chartLabel: 'K线走势与均线',
    };

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold leading-none text-foreground">
          {copy.title}
        </h3>
        {activeSeries?.source ? (
          <span className="shrink-0 truncate text-xs font-medium text-secondary-text">
            {copy.source}: {activeSeries.source}
          </span>
        ) : null}
      </div>

      {snapshot ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold leading-5 text-foreground">
          <span>
            {copy.range}: {snapshot.periodHigh ?? snapshot.period_high ?? '--'} / {snapshot.periodLow ?? snapshot.period_low ?? '--'}
          </span>
          <span>
            {copy.latest}: {snapshot.latestClose ?? snapshot.latest_close ?? '--'}
          </span>
          <span>
            {copy.fromLow}: {formatGrowthPct(snapshot.distanceFromLowPct ?? snapshot.distance_from_low_pct)}
          </span>
          <span>
            {copy.fromHigh}: {formatGrowthPct(snapshot.distanceFromHighPct ?? snapshot.distance_from_high_pct)}
          </span>
          <span>
            {copy.change20d}: {formatGrowthPct(snapshot.change20dPct ?? snapshot.change_20d_pct)}
          </span>
        </div>
      ) : null}

      {displayMode === 'tabs' && hasDaily && hasWeekly ? (
        <div className="inline-grid h-7 w-32 grid-cols-2 overflow-hidden border border-primary">
          <button
            type="button"
            className={`text-xs font-semibold transition-colors ${
              selectedTab === 'daily'
                ? 'bg-primary text-primary-foreground'
                : 'bg-transparent text-foreground hover:bg-primary/10'
            }`}
            onClick={() => setActiveTab('daily')}
          >
            {copy.daily}
          </button>
          <button
            type="button"
            className={`text-xs font-semibold transition-colors ${
              selectedTab === 'weekly'
                ? 'bg-primary text-primary-foreground'
                : 'bg-transparent text-foreground hover:bg-primary/10'
            }`}
            onClick={() => setActiveTab('weekly')}
          >
            {copy.weekly}
          </button>
        </div>
      ) : displayMode === 'single' ? (
        <div className="inline-grid h-7 w-40 grid-cols-2 overflow-hidden border border-primary">
          <button
            type="button"
            className={`text-sm font-semibold transition-colors ${
              selectedTab === 'daily'
                ? 'bg-primary text-primary-foreground'
                : 'bg-transparent text-foreground'
            }`}
            disabled
          >
            {copy.daily}
          </button>
          <button
            type="button"
            className={`text-sm font-semibold transition-colors ${
              selectedTab === 'weekly'
                ? 'bg-primary text-primary-foreground'
                : 'bg-transparent text-foreground'
            }`}
            disabled
          >
            {copy.weekly}
          </button>
        </div>
      ) : null}

      <div
        className="h-72 min-w-0 py-2 print:break-inside-avoid"
        aria-label={copy.chartLabel}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid
              stroke="hsl(var(--muted-text) / 0.24)"
              strokeDasharray="4 4"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateLabel}
              minTickGap={24}
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            />
            <YAxis
              domain={['auto', 'auto']}
              axisLine={false}
              tickLine={false}
              width={34}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            />
            <RechartsTooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                color: 'hsl(var(--foreground))',
              }}
              formatter={(value, name) => [String(value), String(name)]}
              labelFormatter={(label) => String(label)}
            />
            <Line type="monotone" dataKey="close" stroke="#06b6d4" dot={false} strokeWidth={2.4} name={copy.close} />
            <Line type="monotone" dataKey="ma5" stroke="#10d48c" dot={false} strokeWidth={2.4} name={copy.ma5} />
            <Line type="monotone" dataKey="ma20" stroke="#fbbf24" dot={false} strokeWidth={2.2} name={copy.ma20} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );

  return (
    <Card className={`rounded-xl text-left shadow-none ${
      displayMode === 'single'
        ? 'border border-subtle'
        : 'border-0'
    }`}
    >
      <Card.Content className={
        displayMode === 'single'
          ? 'space-y-5 py-5'
          : compact ? 'space-y-4 py-4' : 'space-y-4 py-5'
      }
      >
        {content}
      </Card.Content>
    </Card>
  );
};
