import type React from 'react';
import { Card } from '@heroui/react/card';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  FinancialReport,
  ProfitabilityRow,
  ReportLanguage,
  DimensionAnalysisReport,
} from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';

interface FinancialProfitabilitySectionProps {
  financialReport?: FinancialReport;
  profitabilityAnalysis?: unknown;
  financialFundamentalsAnalysis?: DimensionAnalysisReport;
  language?: ReportLanguage;
  compact?: boolean;
  variant?: 'default' | 'fullReport';
}

type ProfitabilityRowPayload = ProfitabilityRow & {
  report_date?: string | null;
  gross_margin?: number | string | null;
  net_margin?: number | string | null;
};

type ProfitabilityChartPoint = {
  period: string;
  grossMargin: number;
  netMargin?: number | null;
  roe?: number | null;
};

const coerceFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(/%$/, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const hasFiniteMetric = (value?: number | null): boolean =>
  typeof value === 'number' && Number.isFinite(value);

const normalizeRow = (row: ProfitabilityRowPayload): ProfitabilityRow => ({
  period: row.period || row.reportDate || row.report_date || undefined,
  reportDate: row.reportDate || row.report_date || null,
  grossMargin: coerceFiniteNumber(row.grossMargin ?? row.gross_margin),
  netMargin: coerceFiniteNumber(row.netMargin ?? row.net_margin),
  roe: coerceFiniteNumber(row.roe),
});

const getProfitabilityRows = (financialReport?: FinancialReport): ProfitabilityRow[] => {
  const rows = financialReport?.profitability?.rows;
  const normalizedRows = Array.isArray(rows)
    ? rows.map((row) => normalizeRow(row as ProfitabilityRowPayload))
    : [];

  const validRows = normalizedRows.filter((row) => (
    Boolean(row.period || row.reportDate)
    && (
      hasFiniteMetric(row.grossMargin)
      || hasFiniteMetric(row.netMargin)
      || hasFiniteMetric(row.roe)
    )
  ));

  if (validRows.length > 0) {
    return validRows;
  }

  const fallbackRow: ProfitabilityRow = {
    period: financialReport?.reportDate || 'latest',
    reportDate: financialReport?.reportDate || null,
    grossMargin: coerceFiniteNumber(financialReport?.grossMargin),
    netMargin: coerceFiniteNumber(financialReport?.netMargin),
    roe: coerceFiniteNumber(financialReport?.roe),
  };

  return hasFiniteMetric(fallbackRow.grossMargin)
    || hasFiniteMetric(fallbackRow.netMargin)
    || hasFiniteMetric(fallbackRow.roe)
    ? [fallbackRow]
    : [];
};

const formatPercent = (value?: number | null): string => {
  if (!hasFiniteMetric(value)) {
    return '--';
  }
  return `${Number(value).toFixed(2)}%`;
};

const getPeriodLabel = (row: ProfitabilityRow): string =>
  String(row.period || row.reportDate || '--').replace(/ 00:00:00$/, '');

const toChartData = (rows: ProfitabilityRow[]): ProfitabilityChartPoint[] => rows
  .filter((row) => hasFiniteMetric(row.grossMargin))
  .slice()
  .sort((left, right) => getPeriodLabel(left).localeCompare(getPeriodLabel(right)))
  .map((row) => ({
    period: getPeriodLabel(row),
    grossMargin: Number(row.grossMargin),
    netMargin: row.netMargin,
    roe: row.roe,
  }));

const getLatestRow = (rows: ProfitabilityRow[]): ProfitabilityRow | undefined =>
  rows
    .slice()
    .sort((left, right) => getPeriodLabel(left).localeCompare(getPeriodLabel(right)))
    .at(-1);

const buildMetricSummary = (
  latest: ProfitabilityRow | undefined,
  reportLanguage: ReportLanguage,
): string => {
  if (!latest) return '';
  const metrics = [
    hasFiniteMetric(latest.grossMargin)
      ? `${reportLanguage === 'en' ? 'gross margin' : '毛利率'} ${formatPercent(latest.grossMargin)}`
      : '',
    hasFiniteMetric(latest.netMargin)
      ? `${reportLanguage === 'en' ? 'net margin' : '净利率'} ${formatPercent(latest.netMargin)}`
      : '',
    hasFiniteMetric(latest.roe)
      ? `ROE ${formatPercent(latest.roe)}`
      : '',
  ].filter(Boolean);

  if (metrics.length === 0) {
    return '';
  }

  return reportLanguage === 'en'
    ? `Profitability metrics: ${metrics.join(', ')}`
    : `盈利能力指标：${metrics.join('，')}`;
};

export const FinancialProfitabilitySection: React.FC<FinancialProfitabilitySectionProps> = ({
  financialReport,
  language,
  compact = false,
  variant = 'default',
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const rows = getProfitabilityRows(financialReport);
  const chartData = toChartData(rows);
  const latestRow = getLatestRow(rows);
  const latestPeriod = latestRow ? getPeriodLabel(latestRow) : '';
  const metricSummary = buildMetricSummary(latestRow, reportLanguage);

  if (chartData.length === 0) {
    return null;
  }

  const copy = reportLanguage === 'en'
    ? {
      eyebrow: 'FINANCIAL DATA',
      title: 'Profitability',
      grossMargin: 'Gross Margin',
      netMargin: 'Net Margin',
      roe: 'ROE',
      source: 'Source',
      chartLabel: 'Profitability trend gross margin chart',
      period: 'Period',
    }
    : {
      eyebrow: '财务数据分析',
      title: '盈利能力',
      grossMargin: '毛利率',
      netMargin: '净利率',
      roe: 'ROE',
      source: '数据源',
      chartLabel: '盈利能力趋势毛利率图表',
      period: '报告期',
    };

  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <h3 className="shrink-0 text-lg font-semibold leading-none text-foreground">{copy.title}</h3>
        {financialReport?.profitability?.source ? (
          <span className="shrink-0 truncate text-xs font-medium text-secondary-text">
            {copy.source}: {financialReport.profitability.source}
          </span>
        ) : null}
      </div>

      {(latestPeriod || metricSummary) ? (
        <div className="flex flex-col items-end gap-2 text-right">
          {latestPeriod ? (
            <p className="text-base font-semibold text-secondary-text">{latestPeriod}</p>
          ) : null}
          {metricSummary ? (
            <p className="text-xs font-semibold leading-5 text-foreground">{metricSummary}</p>
          ) : null}
        </div>
      ) : null}

      {chartData.length > 0 ? (
        <div
          className="h-[244px] min-w-0 print:break-inside-avoid"
          aria-label={copy.chartLabel}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="profitabilityGrossMargin" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00a1c2" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#00a1c2" stopOpacity={0.08} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="period"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                minTickGap={12}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                tickFormatter={(value) => formatPercent(Number(value))}
                width={56}
              />
              <RechartsTooltip
                cursor={{ stroke: '#00a1c2', strokeOpacity: 0.35 }}
                formatter={(value, name, item) => {
                  if (name === 'grossMargin') {
                    const payload = item.payload as ProfitabilityChartPoint;
                    return [
                      `${formatPercent(Number(value))} / ${copy.netMargin} ${formatPercent(payload.netMargin)} / ${copy.roe} ${formatPercent(payload.roe)}`,
                      copy.grossMargin,
                    ];
                  }
                  return [String(value), String(name)];
                }}
                labelFormatter={(label) => `${copy.period}: ${label}`}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  color: 'hsl(var(--foreground))',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Area
                type="monotone"
                dataKey="grossMargin"
                stroke="#00d9ff"
                strokeWidth={2}
                fill="url(#profitabilityGrossMargin)"
                name="grossMargin"
                dot={{ r: 3, strokeWidth: 2, fill: 'hsl(var(--card))', stroke: '#00d9ff' }}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </>
  );

  if (variant === 'fullReport') {
    return (
      <Card className="rounded-xl border border-subtle bg-surface/50 text-left shadow-none">
        <Card.Content className="space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold leading-6 text-foreground">{copy.title}</h3>
            {financialReport?.profitability?.source ? (
              <span className="text-xs font-medium text-secondary-text">
                {copy.source}: {financialReport.profitability.source}
              </span>
            ) : null}
          </div>

          {(latestPeriod || metricSummary) ? (
            <div className="flex flex-col items-end gap-1.5 text-right">
              {latestPeriod ? (
                <p className="text-base font-semibold text-secondary-text">{latestPeriod}</p>
              ) : null}
              {metricSummary ? (
                <p className="text-xs font-semibold leading-5 text-foreground">{metricSummary}</p>
              ) : null}
            </div>
          ) : null}

          <div
            className="h-[260px] min-w-0 print:break-inside-avoid"
            aria-label={copy.chartLabel}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="profitabilityGrossMarginFullReport" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00a1c2" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#00a1c2" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="period"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  minTickGap={12}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  tickFormatter={(value) => formatPercent(Number(value))}
                  width={56}
                />
                <RechartsTooltip
                  cursor={{ stroke: '#00a1c2', strokeOpacity: 0.35 }}
                  formatter={(value, name, item) => {
                    if (name === 'grossMargin') {
                      const payload = item.payload as ProfitabilityChartPoint;
                      return [
                        `${formatPercent(Number(value))} / ${copy.netMargin} ${formatPercent(payload.netMargin)} / ${copy.roe} ${formatPercent(payload.roe)}`,
                        copy.grossMargin,
                      ];
                    }
                    return [String(value), String(name)];
                  }}
                  labelFormatter={(label) => `${copy.period}: ${label}`}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    color: 'hsl(var(--foreground))',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Area
                  type="monotone"
                  dataKey="grossMargin"
                  stroke="#00d9ff"
                  strokeWidth={2}
                  fill="url(#profitabilityGrossMarginFullReport)"
                  name="grossMargin"
                  dot={{ r: 3, strokeWidth: 2, fill: 'hsl(var(--primary))', stroke: '#00d9ff' }}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card className="h-full rounded-xl border-0 bg-surface text-left shadow-none">
      <Card.Content className={`space-y-4 ${compact ? 'py-4' : 'py-5'}`}>
        {content}
      </Card.Content>
    </Card>
  );
};
