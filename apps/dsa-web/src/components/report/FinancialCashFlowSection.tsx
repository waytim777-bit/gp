import type React from 'react';
import { Wallet } from 'lucide-react';
import { Card } from '@heroui/react/card';
import type { CashFlowRow, FinancialReport, ReportLanguage, DimensionAnalysisReport } from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';
import { DimensionAnalysisBlock } from './DimensionAnalysisBlock';
import { pickDimensionAnalysis } from '../../utils/dimensionAnalysis';
import {
  coerceFiniteNumber,
  formatAmountBillion,
  formatGrowthPct,
  getGrowthStyle,
} from './financialFormat';

interface FinancialCashFlowSectionProps {
  financialReport?: FinancialReport;
  financialFundamentalsAnalysis?: DimensionAnalysisReport;
  language?: ReportLanguage;
  compact?: boolean;
}

type CashFlowRowPayload = CashFlowRow & {
  operating_cash_flow?: number | null;
  investing_cash_flow?: number | null;
  financing_cash_flow?: number | null;
  operating_cash_flow_yoy?: number | null;
};

const normalizeRow = (row: CashFlowRowPayload): CashFlowRow => ({
  period: row.period,
  reportDate: row.reportDate || row.report_date || null,
  operatingCashFlow: coerceFiniteNumber(row.operatingCashFlow ?? row.operating_cash_flow),
  investingCashFlow: coerceFiniteNumber(row.investingCashFlow ?? row.investing_cash_flow),
  financingCashFlow: coerceFiniteNumber(row.financingCashFlow ?? row.financing_cash_flow),
  operatingCashFlowYoy: coerceFiniteNumber(row.operatingCashFlowYoy ?? row.operating_cash_flow_yoy),
});

const getRows = (financialReport?: FinancialReport): CashFlowRow[] => {
  const report = financialReport?.cashFlow ?? financialReport?.cash_flow;
  const rows = report?.rows;
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .map((row) => normalizeRow(row as CashFlowRowPayload))
    .filter((row) => row.period && (
      row.operatingCashFlow != null
      || row.investingCashFlow != null
      || row.financingCashFlow != null
    ));
};

export const FinancialCashFlowSection: React.FC<FinancialCashFlowSectionProps> = ({
  financialReport,
  financialFundamentalsAnalysis,
  language,
  compact = false,
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const rows = getRows(financialReport);
  const dimensionAnalysis = pickDimensionAnalysis(financialFundamentalsAnalysis, 'cash_flow');
  const report = financialReport?.cashFlow ?? financialReport?.cash_flow;

  if (rows.length === 0 && !dimensionAnalysis) {
    return null;
  }

  const copy = reportLanguage === 'en'
    ? {
      eyebrow: 'FINANCIAL DATA',
      title: 'Cash Flow',
      period: 'Period',
      operating: 'Operating (100M)',
      operatingYoy: 'Operating YoY',
      investing: 'Investing (100M)',
      financing: 'Financing (100M)',
      source: 'Source',
    }
    : {
      eyebrow: '财务数据分析',
      title: '现金流量',
      period: '报告期',
      operating: '经营现金流（亿）',
      operatingYoy: '经营同比',
      investing: '投资现金流（亿）',
      financing: '筹资现金流（亿）',
      source: '数据源',
    };

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-default-500" aria-hidden="true" />
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
        dimension="cash_flow"
        language={reportLanguage}
      />

      {rows.length > 0 ? (
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed text-left text-sm">
          <thead>
            <tr className="border-b border-subtle text-[11px] font-medium uppercase tracking-wide text-default-500">
              <th className="px-2 py-2">{copy.period}</th>
              <th className="px-2 py-2 text-right">{copy.operating}</th>
              <th className="px-2 py-2 text-right">{copy.operatingYoy}</th>
              <th className="px-2 py-2 text-right">{copy.investing}</th>
              <th className="px-2 py-2 text-right">{copy.financing}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.period} className="border-b border-subtle last:border-b-0">
                <td className="px-2 py-2 font-mono text-foreground">{row.period}</td>
                <td className="px-2 py-2 text-right font-mono text-foreground">
                  {formatAmountBillion(row.operatingCashFlow)}
                </td>
                <td
                  className="px-2 py-2 text-right font-mono font-semibold"
                  style={getGrowthStyle(row.operatingCashFlowYoy)}
                >
                  {formatGrowthPct(row.operatingCashFlowYoy)}
                </td>
                <td className="px-2 py-2 text-right font-mono text-foreground">
                  {formatAmountBillion(row.investingCashFlow)}
                </td>
                <td className="px-2 py-2 text-right font-mono text-foreground">
                  {formatAmountBillion(row.financingCashFlow)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ) : null}
    </>
  );

  if (compact) {
    return <div className="space-y-3">{content}</div>;
  }

  return (
    <Card className="border border-subtle bg-surface/50 p-4 shadow-none">
      <div className="space-y-4">{content}</div>
    </Card>
  );
};
