import type React from 'react';
import { BarChart3 } from 'lucide-react';
import { Card } from '@heroui/react/card';
import {
  CartesianGrid,
  ComposedChart,
  Customized,
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
  language?: ReportLanguage;
  compact?: boolean;
  variant?: 'daily' | 'weekly';
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

type CandlestickLayerProps = {
  xAxisMap?: Record<string, { scale?: (value: string) => number; bandwidth?: () => number }>;
  yAxisMap?: Record<string, { scale?: (value: number) => number }>;
};

const buildCandlestickLayer = (rows: ChartRow[]) => {
  const CandlestickLayer = (props: CandlestickLayerProps) => {
    const xAxis = props.xAxisMap ? Object.values(props.xAxisMap)[0] : undefined;
    const yAxis = props.yAxisMap ? Object.values(props.yAxisMap)[0] : undefined;
    const xScale = xAxis?.scale;
    const yScale = yAxis?.scale;
    const bandwidth = xAxis?.bandwidth?.() ?? 8;
    if (!xScale || !yScale) {
      return null;
    }

    return (
      <g>
        {rows.map((row) => {
          const centerX = (xScale(row.date) ?? 0) + bandwidth / 2;
          const { open, close, high, low } = row;
          const isUp = close >= open;
          const color = isUp ? 'var(--home-price-up)' : 'var(--home-price-down)';
          const bodyTop = yScale(Math.max(open, close));
          const bodyBottom = yScale(Math.min(open, close));
          const bodyHeight = Math.max(bodyBottom - bodyTop, 1);
          const bodyWidth = Math.max(bandwidth * 0.55, 2);
          return (
            <g key={row.date}>
              <line
                x1={centerX}
                x2={centerX}
                y1={yScale(high)}
                y2={yScale(low)}
                stroke={color}
                strokeWidth={1}
              />
              <rect
                x={centerX - bodyWidth / 2}
                y={bodyTop}
                width={bodyWidth}
                height={bodyHeight}
                fill={color}
                stroke={color}
              />
            </g>
          );
        })}
      </g>
    );
  };
  return CandlestickLayer;
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

export const KlineChartSection: React.FC<KlineChartSectionProps> = ({
  klineSeries,
  language,
  compact = false,
  variant = 'daily',
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const rows = (klineSeries?.rows ?? [])
    .map((row) => normalizeRow(row))
    .filter((row): row is ChartRow => row != null);

  if (rows.length === 0) {
    return null;
  }

  const snapshot = klineSeries?.snapshot;
  const CandlestickLayer = buildCandlestickLayer(rows);
  const copy = variant === 'weekly'
    ? (reportLanguage === 'en'
      ? {
        eyebrow: 'TECHNICAL ANALYSIS',
        title: 'Weekly K-Line',
        range: 'Range High/Low',
        latest: 'Latest Close',
        fromLow: 'From Low',
        fromHigh: 'From High',
        change20d: 'Recent Trend',
        source: 'Source',
        ma5: 'MA5',
        ma10: 'MA10',
        ma20: 'MA20',
        chartLabel: 'Weekly candlestick chart with moving averages',
      }
      : {
        eyebrow: '技术分析',
        title: '周K走势',
        range: '区间高/低',
        latest: '最新收盘',
        fromLow: '距低点',
        fromHigh: '距高点',
        change20d: '阶段趋势',
        source: '数据源',
        ma5: 'MA5',
        ma10: 'MA10',
        ma20: 'MA20',
        chartLabel: '周K蜡烛图与均线',
      })
    : (reportLanguage === 'en'
    ? {
      eyebrow: 'TECHNICAL ANALYSIS',
      title: 'Daily K-Line',
      range: 'Range High/Low',
      latest: 'Latest Close',
      fromLow: 'From Low',
      fromHigh: 'From High',
      change20d: '20D Change',
      source: 'Source',
      ma5: 'MA5',
      ma10: 'MA10',
      ma20: 'MA20',
      chartLabel: 'Daily candlestick chart with moving averages',
    }
    : {
      eyebrow: '技术分析',
      title: '日K走势',
      range: '区间高/低',
      latest: '最新收盘',
      fromLow: '距低点',
      fromHigh: '距高点',
      change20d: '近20日涨跌',
      source: '数据源',
      ma5: 'MA5',
      ma10: 'MA10',
      ma20: 'MA20',
      chartLabel: '日K蜡烛图与均线',
    });

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-default-500" aria-hidden="true" />
          <div>
            {!compact ? (
              <div className="text-[11px] font-medium uppercase tracking-wider text-default-500">
                {copy.eyebrow}
              </div>
            ) : null}
            <h3 className="text-base font-semibold text-foreground">{copy.title}</h3>
          </div>
        </div>
        {klineSeries?.source ? (
          <span className="rounded-md bg-default-100 px-2 py-1 text-[11px] text-default-500">
            {copy.source}: {klineSeries.source}
          </span>
        ) : null}
      </div>

      {snapshot ? (
        <div className="flex flex-wrap gap-2 text-xs text-default-600">
          <span className="rounded-md bg-default-100 px-2 py-1">
            {copy.range}: {snapshot.periodHigh ?? snapshot.period_high ?? '--'} / {snapshot.periodLow ?? snapshot.period_low ?? '--'}
          </span>
          <span className="rounded-md bg-default-100 px-2 py-1">
            {copy.latest}: {snapshot.latestClose ?? snapshot.latest_close ?? '--'}
          </span>
          <span className="rounded-md bg-default-100 px-2 py-1">
            {copy.fromLow}: {formatGrowthPct(snapshot.distanceFromLowPct ?? snapshot.distance_from_low_pct)}
          </span>
          <span className="rounded-md bg-default-100 px-2 py-1">
            {copy.fromHigh}: {formatGrowthPct(snapshot.distanceFromHighPct ?? snapshot.distance_from_high_pct)}
          </span>
          <span className="rounded-md bg-default-100 px-2 py-1">
            {copy.change20d}: {formatGrowthPct(snapshot.change20dPct ?? snapshot.change_20d_pct)}
          </span>
        </div>
      ) : null}

      <div
        className="h-72 min-w-0 rounded-lg border border-subtle bg-background/35 px-2 py-3 print:break-inside-avoid"
        aria-label={copy.chartLabel}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
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
              width={56}
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
            <Customized component={CandlestickLayer} />
            <Line type="monotone" dataKey="ma5" stroke="#f59e0b" dot={false} strokeWidth={1.2} name={copy.ma5} />
            <Line type="monotone" dataKey="ma10" stroke="#8b5cf6" dot={false} strokeWidth={1.2} name={copy.ma10} />
            <Line type="monotone" dataKey="ma20" stroke="#38bdf8" dot={false} strokeWidth={1.2} name={copy.ma20} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );

  return (
    <Card className="text-left">
      <Card.Content className={compact ? 'space-y-3' : 'space-y-4'}>
        {content}
      </Card.Content>
    </Card>
  );
};
