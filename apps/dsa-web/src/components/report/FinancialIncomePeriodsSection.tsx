import type React from 'react';
import { LineChart } from 'lucide-react';
import { Card } from '@heroui/react/card';
import type { FinancialReport, IncomePeriodRow, ReportLanguage, DimensionAnalysisReport } from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';
import { DimensionAnalysisBlock } from './DimensionAnalysisBlock';
import { pickDimensionAnalysis } from '../../utils/dimensionAnalysis';
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
  financialFundamentalsAnalysis,
  language,
  compact = false,
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const rows = getRows(financialReport);
  const dimensionAnalysis = pickDimensionAnalysis(financialFundamentalsAnalysis, 'income_periods');
  const report = financialReport?.incomePeriods ?? financialReport?.income_periods;

  if (rows.length === 0 && !dimensionAnalysis) {
    return null;
  }

  const copy = reportLanguage === 'en'
    ? {
      eyebrow: 'FINANCIAL DATA',
      title: 'Income by Period',
      period: 'Period',
      revenue: 'Revenue (100M)',
      revenueYoy: 'Revenue YoY',
      netProfit: 'Net Profit (100M)',
      rdExp: 'R&D (100M)',
      source: 'Source',
    }
    : {
      eyebrow: '财务数据分析',
      title: '分期业绩（含季报）',
      period: '报告期',
      revenue: '营业收入（亿）',
      revenueYoy: '营收同比',
      netProfit: '归母净利润（亿）',
      rdExp: '研发费用（亿）',
      source: '数据源',
    };

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <LineChart className="h-4 w-4 text-default-500" aria-hidden="true" />
          <div>
            {!compact ? (
              <div className="text-[11px] font-medium uppercase tracking-wider text-default-500">
                {copy.eyebrow}
              </div>
            ) : null}
            <h3 className="text-base font-semibold text-foreground">{copy.title}</h3>
          </div>
        </div>
        {report?.source ? (
          <span className="rounded-md bg-default-100 px-2 py-1 text-[11px] text-default-500">
            {copy.source}: {report.source}
          </span>
        ) : null}
      </div>

      <DimensionAnalysisBlock
        analysis={dimensionAnalysis}
        dimension="income_periods"
        language={reportLanguage}
      />

      {rows.length > 0 ? (
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed text-left text-sm">
          <thead>
            <tr className="border-b border-subtle text-[11px] font-medium uppercase tracking-wide text-default-500">
              <th className="px-2 py-2">{copy.period}</th>
              <th className="px-2 py-2 text-right">{copy.revenue}</th>
              <th className="px-2 py-2 text-right">{copy.revenueYoy}</th>
              <th className="px-2 py-2 text-right">{copy.netProfit}</th>
              <th className="px-2 py-2 text-right">{copy.rdExp}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.period} className="border-b border-subtle last:border-b-0">
                <td className="px-2 py-2 font-mono text-foreground">{row.period}</td>
                <td className="px-2 py-2 text-right font-mono text-foreground">
                  {formatAmountBillion(row.revenue)}
                </td>
                <td
                  className="px-2 py-2 text-right font-mono font-semibold"
                  style={getGrowthStyle(row.revenueYoy)}
                >
                  {formatGrowthPct(row.revenueYoy)}
                </td>
                <td className="px-2 py-2 text-right font-mono text-foreground">
                  {formatAmountBillion(row.netProfit)}
                </td>
                <td className="px-2 py-2 text-right font-mono text-foreground">
                  {formatAmountBillion(row.rdExp)}
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
    <Card className="text-left">
      <Card.Content className={compact ? 'space-y-3' : 'space-y-4'}>
        {content}
      </Card.Content>
    </Card>
  );
};
