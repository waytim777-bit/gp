import { Fragment } from 'react';
import type React from 'react';
import { Card } from '@heroui/react/card';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FinancialReport, ReportLanguage, RevenueGrowthRow, DimensionAnalysisReport } from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';

interface FinancialRevenueGrowthSectionProps {
  financialReport?: FinancialReport;
  financialFundamentalsAnalysis?: DimensionAnalysisReport;
  language?: ReportLanguage;
  compact?: boolean;
  variant?: 'default' | 'fullReport';
}

type RevenueChartPoint = {
  fiscalYear: string;
  revenueBillion: number;
  revenueYoy?: number | null;
};

const getRevenueRows = (financialReport?: FinancialReport): RevenueGrowthRow[] => {
  const rows = financialReport?.revenueGrowth?.rows;
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.filter((row) => row?.fiscalYear != null && row?.revenue != null);
};

const formatRevenueBillion = (value?: number | null): string => {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '--';
  }
  return (value / 100000000).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatGrowthPct = (value?: number | null): string => {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '--';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const toChartData = (rows: RevenueGrowthRow[]): RevenueChartPoint[] => rows
  .slice()
  .sort((left, right) => Number(right.fiscalYear) - Number(left.fiscalYear))
  .map((row) => ({
    fiscalYear: String(row.fiscalYear),
    revenueBillion: Number(row.revenue) / 100000000,
    revenueYoy: row.revenueYoy,
  }))
  .filter((row) => Number.isFinite(row.revenueBillion));

export const FinancialRevenueGrowthSection: React.FC<FinancialRevenueGrowthSectionProps> = ({
  financialReport,
  language,
  compact = false,
  variant = 'default',
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const rows = getRevenueRows(financialReport);
  const chartData = toChartData(rows);
  if (chartData.length === 0) {
    return null;
  }
  const copy = reportLanguage === 'en'
    ? {
      eyebrow: 'FINANCIAL DATA',
      title: 'Revenue Growth',
      year: 'Year',
      revenue: 'Revenue (100M CNY)',
      yoy: 'YoY Growth',
      source: 'Source',
      chartLabel: 'Revenue growth data chart',
    }
    : {
      eyebrow: '财务数据分析',
      title: '营收增长',
      year: '年度',
      revenue: '营业收入（亿）',
      yoy: '同比增长率',
      source: '数据源',
      chartLabel: '营收增长数据图表',
    };

  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h3 className="shrink-0 text-lg font-semibold leading-none text-foreground">{copy.title}</h3>
        </div>
        {financialReport?.revenueGrowth?.source ? (
          <span className="shrink-0 truncate text-xs font-medium text-secondary-text">
            {copy.source}: {financialReport.revenueGrowth.source}
          </span>
        ) : null}
      </div>

      {chartData.length > 0 ? (
        <div
          className="h-[300px] min-w-0 print:break-inside-avoid"
          aria-label={copy.chartLabel}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 8, right: 24, left: 0, bottom: 0 }}
              barCategoryGap="34%"
            >
              <CartesianGrid
                stroke="hsl(var(--border))"
                strokeDasharray="3 3"
                horizontal={false}
                vertical
              />
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                tickFormatter={(value) => Number(value).toFixed(2)}
              />
              <YAxis
                type="category"
                dataKey="fiscalYear"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                width={42}
              />
              <RechartsTooltip
                cursor={{ fill: 'hsl(var(--hover))' }}
                formatter={(value, name, item) => {
                  if (name === 'revenueBillion') {
                    const payload = item.payload as RevenueChartPoint;
                    return [
                      `${formatRevenueBillion(Number(value) * 100000000)} / ${formatGrowthPct(payload.revenueYoy)}`,
                      copy.revenue,
                    ];
                  }
                  return [String(value), String(name)];
                }}
                labelFormatter={(label) => `${copy.year}: ${label}`}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  color: 'hsl(var(--foreground))',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Bar
                dataKey="revenueBillion"
                fill="#00a1c2"
                name="revenueBillion"
                radius={[0, 0, 0, 0]}
                label={{
                  position: 'right',
                  fill: 'hsl(var(--foreground))',
                  fontSize: 14,
                  fontWeight: 600,
                  formatter: (value: unknown) => (
                    typeof value === 'number' && Number.isFinite(value)
                      ? value.toFixed(2)
                      : String(value ?? '--')
                  ),
                }}
              />
            </BarChart>
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
            {financialReport?.revenueGrowth?.source ? (
              <span className="text-xs font-medium text-secondary-text">
                {copy.source}: {financialReport.revenueGrowth.source}
              </span>
            ) : null}
          </div>

          <div
            className="h-[260px] min-w-0 print:break-inside-avoid"
            aria-label={copy.chartLabel}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 8, right: 48, left: 0, bottom: 0 }}
                barCategoryGap="42%"
              >
                <CartesianGrid
                  stroke="hsl(var(--border))"
                  strokeDasharray="3 3"
                  horizontal={false}
                  vertical
                />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  tickFormatter={(value) => Number(value).toFixed(2)}
                />
                <YAxis
                  type="category"
                  dataKey="fiscalYear"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  width={42}
                />
                <RechartsTooltip
                  cursor={{ fill: 'hsl(var(--hover))' }}
                  formatter={(value, name, item) => {
                    if (name === 'revenueBillion') {
                      const payload = item.payload as RevenueChartPoint;
                      return [
                        `${formatRevenueBillion(Number(value) * 100000000)} / ${formatGrowthPct(payload.revenueYoy)}`,
                        copy.revenue,
                      ];
                    }
                    return [String(value), String(name)];
                  }}
                  labelFormatter={(label) => `${copy.year}: ${label}`}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    color: 'hsl(var(--foreground))',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Bar
                  dataKey="revenueBillion"
                  fill="#00a1c2"
                  name="revenueBillion"
                  radius={[0, 0, 0, 0]}
                  label={{
                    position: 'right',
                    fill: 'hsl(var(--foreground))',
                    fontSize: 13,
                    fontWeight: 600,
                    formatter: (value: unknown) => (
                      typeof value === 'number' && Number.isFinite(value)
                        ? value.toFixed(2)
                        : String(value ?? '--')
                    ),
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-x-4 gap-y-4 text-sm">
            <div className="text-secondary-text">{copy.year}</div>
            <div className="text-secondary-text">{copy.revenue}</div>
            <div className="text-right text-secondary-text">{copy.yoy}</div>
            {chartData.map((row) => (
              <Fragment key={row.fiscalYear}>
                <div className="font-semibold text-foreground">{row.fiscalYear}</div>
                <div className="font-semibold text-foreground">{row.revenueBillion.toFixed(2)}</div>
                <div
                  className={`text-right font-semibold ${
                    row.revenueYoy == null
                      ? 'text-secondary-text'
                      : row.revenueYoy < 0
                        ? 'text-danger'
                        : 'text-success'
                  }`}
                >
                  {formatGrowthPct(row.revenueYoy)}
                </div>
              </Fragment>
            ))}
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
