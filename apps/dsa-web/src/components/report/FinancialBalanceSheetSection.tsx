import type React from 'react';
import { Landmark } from 'lucide-react';
import { Card } from '@heroui/react/card';
import type {
  BalanceSheetLatestRatios,
  BalanceSheetRow,
  FinancialReport,
  ReportLanguage,
  DimensionAnalysisReport,
} from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';
import { DimensionAnalysisBlock } from './DimensionAnalysisBlock';
import { pickDimensionAnalysis } from '../../utils/dimensionAnalysis';
import { coerceFiniteNumber, formatAmountBillion, formatRatio } from './financialFormat';

interface FinancialBalanceSheetSectionProps {
  financialReport?: FinancialReport;
  financialFundamentalsAnalysis?: DimensionAnalysisReport;
  language?: ReportLanguage;
  compact?: boolean;
}

type BalanceSheetRowPayload = BalanceSheetRow & {
  total_assets?: number | null;
  total_liab?: number | null;
  debt_ratio?: number | null;
  money_cap?: number | null;
  interest_bearing_debt?: number | null;
};

type LatestRatiosPayload = BalanceSheetLatestRatios & {
  debt_to_assets?: number | null;
  current_ratio?: number | null;
  quick_ratio?: number | null;
  inv_turn?: number | null;
  ar_turn?: number | null;
};

const normalizeRow = (row: BalanceSheetRowPayload): BalanceSheetRow => ({
  period: row.period,
  reportDate: row.reportDate || row.report_date || null,
  totalAssets: coerceFiniteNumber(row.totalAssets ?? row.total_assets),
  totalLiab: coerceFiniteNumber(row.totalLiab ?? row.total_liab),
  debtRatio: coerceFiniteNumber(row.debtRatio ?? row.debt_ratio),
  moneyCap: coerceFiniteNumber(row.moneyCap ?? row.money_cap),
  inventories: coerceFiniteNumber(row.inventories),
  cip: coerceFiniteNumber(row.cip),
  interestBearingDebt: coerceFiniteNumber(row.interestBearingDebt ?? row.interest_bearing_debt),
});

const normalizeRatios = (ratios?: LatestRatiosPayload | null): BalanceSheetLatestRatios | null => {
  if (!ratios) {
    return null;
  }
  return {
    debtToAssets: coerceFiniteNumber(ratios.debtToAssets ?? ratios.debt_to_assets),
    currentRatio: coerceFiniteNumber(ratios.currentRatio ?? ratios.current_ratio),
    quickRatio: coerceFiniteNumber(ratios.quickRatio ?? ratios.quick_ratio),
    invTurn: coerceFiniteNumber(ratios.invTurn ?? ratios.inv_turn),
    arTurn: coerceFiniteNumber(ratios.arTurn ?? ratios.ar_turn),
  };
};

const getRows = (financialReport?: FinancialReport): BalanceSheetRow[] => {
  const report = financialReport?.balanceSheet ?? financialReport?.balance_sheet;
  const rows = report?.rows;
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .map((row) => normalizeRow(row as BalanceSheetRowPayload))
    .filter((row) => row.period && (row.totalAssets != null || row.totalLiab != null));
};

export const FinancialBalanceSheetSection: React.FC<FinancialBalanceSheetSectionProps> = ({
  financialReport,
  financialFundamentalsAnalysis,
  language,
  compact = false,
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const rows = getRows(financialReport);
  const dimensionAnalysis = pickDimensionAnalysis(financialFundamentalsAnalysis, 'balance_sheet');
  const report = financialReport?.balanceSheet ?? financialReport?.balance_sheet;
  const latestRatios = normalizeRatios(
    (report?.latestRatios ?? report?.latest_ratios) as LatestRatiosPayload | undefined,
  );

  if (rows.length === 0 && !dimensionAnalysis) {
    return null;
  }

  const copy = reportLanguage === 'en'
    ? {
      eyebrow: 'FINANCIAL DATA',
      title: 'Balance Sheet',
      period: 'Period',
      totalAssets: 'Total Assets (100M)',
      totalLiab: 'Total Liabilities (100M)',
      debtRatio: 'Debt Ratio',
      moneyCap: 'Cash (100M)',
      inventories: 'Inventory (100M)',
      interestDebt: 'Interest-bearing Debt (100M)',
      source: 'Source',
      ratios: 'Latest ratios',
      debtToAssets: 'Debt/Assets',
      currentRatio: 'Current',
      quickRatio: 'Quick',
      invTurn: 'Inventory Turnover',
      arTurn: 'AR Turnover',
    }
    : {
      eyebrow: '财务数据分析',
      title: '资产负债',
      period: '报告期',
      totalAssets: '总资产（亿）',
      totalLiab: '总负债（亿）',
      debtRatio: '负债率',
      moneyCap: '货币资金（亿）',
      inventories: '存货（亿）',
      interestDebt: '有息负债（亿）',
      source: '数据源',
      ratios: '最新财务比率',
      debtToAssets: '资产负债率',
      currentRatio: '流动比率',
      quickRatio: '速动比率',
      invTurn: '存货周转率',
      arTurn: '应收周转率',
    };

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-default-500" aria-hidden="true" />
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

      {latestRatios ? (
        <div className="flex flex-wrap gap-2 text-xs text-default-600">
          <span className="rounded-md bg-default-100 px-2 py-1">{copy.ratios}</span>
          {latestRatios.debtToAssets != null ? (
            <span className="rounded-md bg-default-100 px-2 py-1">
              {copy.debtToAssets}: {formatRatio(latestRatios.debtToAssets, '%')}
            </span>
          ) : null}
          {latestRatios.currentRatio != null ? (
            <span className="rounded-md bg-default-100 px-2 py-1">
              {copy.currentRatio}: {formatRatio(latestRatios.currentRatio)}
            </span>
          ) : null}
          {latestRatios.quickRatio != null ? (
            <span className="rounded-md bg-default-100 px-2 py-1">
              {copy.quickRatio}: {formatRatio(latestRatios.quickRatio)}
            </span>
          ) : null}
          {latestRatios.invTurn != null ? (
            <span className="rounded-md bg-default-100 px-2 py-1">
              {copy.invTurn}: {formatRatio(latestRatios.invTurn)}
            </span>
          ) : null}
          {latestRatios.arTurn != null ? (
            <span className="rounded-md bg-default-100 px-2 py-1">
              {copy.arTurn}: {formatRatio(latestRatios.arTurn)}
            </span>
          ) : null}
        </div>
      ) : null}

      <DimensionAnalysisBlock
        analysis={dimensionAnalysis}
        dimension="balance_sheet"
        language={reportLanguage}
      />

      {rows.length > 0 ? (
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed text-left text-sm">
          <thead>
            <tr className="border-b border-subtle text-[11px] font-medium uppercase tracking-wide text-default-500">
              <th className="px-2 py-2">{copy.period}</th>
              <th className="px-2 py-2 text-right">{copy.totalAssets}</th>
              <th className="px-2 py-2 text-right">{copy.totalLiab}</th>
              <th className="px-2 py-2 text-right">{copy.debtRatio}</th>
              <th className="px-2 py-2 text-right">{copy.moneyCap}</th>
              <th className="px-2 py-2 text-right">{copy.inventories}</th>
              <th className="px-2 py-2 text-right">{copy.interestDebt}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.period} className="border-b border-subtle last:border-b-0">
                <td className="px-2 py-2 font-mono text-foreground">{row.period}</td>
                <td className="px-2 py-2 text-right font-mono text-foreground">
                  {formatAmountBillion(row.totalAssets)}
                </td>
                <td className="px-2 py-2 text-right font-mono text-foreground">
                  {formatAmountBillion(row.totalLiab)}
                </td>
                <td className="px-2 py-2 text-right font-mono text-foreground">
                  {formatRatio(row.debtRatio, '%')}
                </td>
                <td className="px-2 py-2 text-right font-mono text-foreground">
                  {formatAmountBillion(row.moneyCap)}
                </td>
                <td className="px-2 py-2 text-right font-mono text-foreground">
                  {formatAmountBillion(row.inventories)}
                </td>
                <td className="px-2 py-2 text-right font-mono text-foreground">
                  {formatAmountBillion(row.interestBearingDebt)}
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
