import type React from 'react';
import { Card } from '@heroui/react/card';
import type { CashFlowRow, FinancialReport, ReportLanguage, DimensionAnalysisReport } from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';
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
  language,
  compact = false,
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const rows = getRows(financialReport);
  const report = financialReport?.cashFlow ?? financialReport?.cash_flow;

  if (rows.length === 0) {
    return null;
  }

  const copy = reportLanguage === 'en'
    ? {
      title: 'Cash Flow',
      period: 'Period',
      operating: 'Operating (100M)',
      investingAndFinancing: 'Investing / Financing (100M)',
      operatingYoy: 'Operating YoY',
      source: 'Source',
    }
    : {
      title: '现金流量',
      period: '报告期',
      operating: '经营现金流（亿）',
      investingAndFinancing: '投资现金流/筹资现金流（亿）',
      operatingYoy: '经营同比',
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
              <th className="w-[20%] pb-4">{copy.period}</th>
              <th className="w-[24%] pb-4 text-left">{copy.operating}</th>
              <th className="w-[36%] pb-4 text-left">{copy.investingAndFinancing}</th>
              <th className="w-[20%] pb-4 text-right">{copy.operatingYoy}</th>
            </tr>
          </thead>
          <tbody className="text-sm font-semibold text-foreground">
            {rows.slice(0, 5).map((row, index) => (
              <tr key={`${row.period}-${index}`}>
                <td className="py-2.5 pr-3 font-mono">{row.period}</td>
                <td className="py-2.5 pr-3 font-mono">
                  {formatAmountBillion(row.operatingCashFlow)}
                </td>
                <td className="py-2.5 pr-3 font-mono">
                  {formatAmountBillion(row.investingCashFlow)}/{formatAmountBillion(row.financingCashFlow)}
                </td>
                <td
                  className="py-2.5 text-right font-mono"
                  style={getGrowthStyle(row.operatingCashFlowYoy)}
                >
                  {formatGrowthPct(row.operatingCashFlowYoy)}
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
