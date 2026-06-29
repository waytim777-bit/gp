import type React from 'react';
import { Card } from '@heroui/react/card';
import type { FinancialReport, IncomePeriodRow, ReportLanguage, DimensionAnalysisReport } from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';
import {
  coerceFiniteNumber,
  formatAmountBillion,
  formatGrowthPct,
  getGrowthStyle,
} from './financialFormat';

interface FinancialIncomePeriodsSectionProps {
  financialReport?: FinancialReport;
  financialFundamentalsAnalysis?: DimensionAnalysisReport;
  language?: ReportLanguage;
  compact?: boolean;
}

type IncomePeriodRowPayload = IncomePeriodRow & {
  net_profit?: number | null;
  rd_exp?: number | null;
  revenue_yoy?: number | null;
};

const normalizeRow = (row: IncomePeriodRowPayload): IncomePeriodRow => ({
  period: row.period,
  reportDate: row.reportDate || row.report_date || null,
  revenue: coerceFiniteNumber(row.revenue),
  netProfit: coerceFiniteNumber(row.netProfit ?? row.net_profit),
  rdExp: coerceFiniteNumber(row.rdExp ?? row.rd_exp),
  revenueYoy: coerceFiniteNumber(row.revenueYoy ?? row.revenue_yoy),
});

const getRows = (financialReport?: FinancialReport): IncomePeriodRow[] => {
  const report = financialReport?.incomePeriods ?? financialReport?.income_periods;
  const rows = report?.rows;
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .map((row) => normalizeRow(row as IncomePeriodRowPayload))
    .filter((row) => row.period && row.revenue != null);
};

export const FinancialIncomePeriodsSection: React.FC<FinancialIncomePeriodsSectionProps> = ({
  financialReport,
  language,
  compact = false,
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const rows = getRows(financialReport);
  const report = financialReport?.incomePeriods ?? financialReport?.income_periods;

  if (rows.length === 0) {
    return null;
  }

  const copy = reportLanguage === 'en'
    ? {
      eyebrow: 'FINANCIAL DATA',
      title: 'Income by Period',
      period: 'Period',
      revenue: 'Revenue (100M)',
      revenueYoy: 'Revenue YoY',
      profitAndRd: 'Net Profit / R&D (100M)',
      source: 'Source',
    }
    : {
      eyebrow: '财务数据分析',
      title: '分期业绩（含季报）',
      period: '报告期',
      revenue: '营业收入（亿）',
      revenueYoy: '营收同比',
      profitAndRd: '归母净利润/研发费用（亿）',
      source: '数据源',
    };

  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <h3 className="shrink-0 text-lg font-semibold leading-none text-foreground">{copy.title}</h3>
        {report?.source ? (
          <span className="shrink-0 truncate text-xs font-medium text-secondary-text">
            {copy.source}: {report.source}
          </span>
        ) : null}
      </div>

      {rows.length > 0 ? (
      <div className="overflow-x-auto pb-1">
        <table className="min-w-full table-fixed text-left">
          <thead>
            <tr className="text-xs font-medium text-secondary-text">
              <th className="w-[22%] pb-4">{copy.period}</th>
              <th className="w-[24%] pb-4 text-left">{copy.revenue}</th>
              <th className="w-[34%] pb-4 text-left">{copy.profitAndRd}</th>
              <th className="w-[20%] pb-4 text-right">{copy.revenueYoy}</th>
            </tr>
          </thead>
          <tbody className="text-sm font-semibold text-foreground">
            {rows.slice(0, 8).map((row, index) => (
              <tr key={`${row.period}-${index}`}>
                <td className="py-2.5 pr-3 font-mono">{row.period}</td>
                <td className="py-2.5 pr-3 font-mono">
                  {formatAmountBillion(row.revenue)}
                </td>
                <td className="py-2.5 pr-3 font-mono">
                  {formatAmountBillion(row.netProfit)}/{formatAmountBillion(row.rdExp)}
                </td>
                <td
                  className="py-2.5 text-right font-mono"
                  style={getGrowthStyle(row.revenueYoy)}
                >
                  {formatGrowthPct(row.revenueYoy)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ) : null}
    </>
  );

  return (
    <Card className="h-full rounded-xl border-0 bg-surface text-left shadow-none">
      <Card.Content className={`space-y-5 ${compact ? 'py-4' : 'py-5'}`}>
        {content}
      </Card.Content>
    </Card>
  );
};
