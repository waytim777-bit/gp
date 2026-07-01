import type React from 'react';
import { Card } from '@heroui/react/card';
import type {
  BalanceSheetLatestRatios,
  BalanceSheetRow,
  FinancialReport,
  ReportLanguage,
  DimensionAnalysisReport,
} from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';
import { coerceFiniteNumber, formatAmountBillion, formatRatio } from './financialFormat';

interface FinancialBalanceSheetSectionProps {
  financialReport?: FinancialReport;
  financialFundamentalsAnalysis?: DimensionAnalysisReport;
  language?: ReportLanguage;
  compact?: boolean;
  variant?: 'default' | 'fullReport';
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
  language,
  compact = false,
  variant = 'default',
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const rows = getRows(financialReport);
  const report = financialReport?.balanceSheet ?? financialReport?.balance_sheet;
  const latestRatios = normalizeRatios(
    (report?.latestRatios ?? report?.latest_ratios) as LatestRatiosPayload | undefined,
  );

  if (rows.length === 0 && !latestRatios) {
    return null;
  }

  const copy = reportLanguage === 'en'
    ? {
      eyebrow: 'FINANCIAL DATA',
      title: 'Balance Sheet',
      period: 'Period',
      assetsAndLiab: 'Assets / Liabilities (100M)',
      debtRatio: 'Debt Ratio',
      cashAndInventory: 'Cash / Inventory (100M)',
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
      assetsAndLiab: '总资产/总负债（亿）',
      debtRatio: '负债率',
      cashAndInventory: '货币资金/存货（亿）',
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
      <div className="flex items-center justify-between gap-3">
        <h3 className="shrink-0 text-lg font-semibold leading-none text-foreground">{copy.title}</h3>
        {report?.source ? (
          <span className="shrink-0 truncate text-xs font-medium text-secondary-text">
            {copy.source}: {report.source}
          </span>
        ) : null}
      </div>

      {latestRatios ? (
        <div className="space-y-1 text-xs font-semibold leading-5">
          <p className="text-secondary-text">{copy.ratios}</p>
          <div className="grid gap-x-8 gap-y-0.5 text-foreground sm:grid-cols-3">
            {latestRatios.debtToAssets != null ? (
              <span>{copy.debtToAssets}:{formatRatio(latestRatios.debtToAssets, '%')}</span>
            ) : null}
            {latestRatios.currentRatio != null ? (
              <span>{copy.currentRatio}:{formatRatio(latestRatios.currentRatio)}</span>
            ) : null}
            {latestRatios.quickRatio != null ? (
              <span>{copy.quickRatio}:{formatRatio(latestRatios.quickRatio)}</span>
            ) : null}
            {latestRatios.invTurn != null ? (
              <span>{copy.invTurn}:{formatRatio(latestRatios.invTurn)}</span>
            ) : null}
            {latestRatios.arTurn != null ? (
              <span>{copy.arTurn}:{formatRatio(latestRatios.arTurn)}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {rows.length > 0 ? (
      <div className="overflow-x-auto pb-1">
        <table className="min-w-full table-fixed text-left">
          <thead>
            <tr className="text-[11px] font-medium text-secondary-text">
              <th className="w-[18%] pb-4">{copy.period}</th>
              <th className="w-[25%] pb-4 text-left">{copy.assetsAndLiab}</th>
              <th className="w-[16%] pb-4 text-center">{copy.debtRatio}</th>
              <th className="w-[25%] pb-4 text-left">{copy.cashAndInventory}</th>
              <th className="w-[16%] pb-4 text-right">{copy.interestDebt}</th>
            </tr>
          </thead>
          <tbody className="text-xs font-semibold text-foreground">
            {rows.slice(0, 7).map((row, index) => (
              <tr key={`${row.period}-${index}`}>
                <td className="py-2.5 pr-3 font-mono">{row.period}</td>
                <td className="py-2.5 pr-3 font-mono">
                  {formatAmountBillion(row.totalAssets)}/{formatAmountBillion(row.totalLiab)}
                </td>
                <td className="py-2.5 pr-3 text-center font-mono">
                  {formatRatio(row.debtRatio, '%')}
                </td>
                <td className="py-2.5 pr-3 font-mono">
                  {formatAmountBillion(row.moneyCap)}/{formatAmountBillion(row.inventories)}
                </td>
                <td className="py-2.5 text-right font-mono text-success">
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

  if (variant === 'fullReport') {
    return (
      <Card className="rounded-xl border border-subtle text-left shadow-none">
        <Card.Content className="space-y-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold leading-6 text-foreground">{copy.title}</h3>
            {report?.source ? (
              <span className="max-w-full truncate text-xs font-medium text-secondary-text">
                {copy.source}: {report.source}
              </span>
            ) : null}
          </div>

          {latestRatios ? (
            <div className="space-y-1 text-xs font-semibold leading-5">
              <p className="text-secondary-text">{copy.ratios}</p>
              <div className="flex flex-wrap gap-x-7 gap-y-0.5 text-foreground">
                {latestRatios.debtToAssets != null ? (
                  <span>{copy.debtToAssets}:{formatRatio(latestRatios.debtToAssets, '%')}</span>
                ) : null}
                {latestRatios.currentRatio != null ? (
                  <span>{copy.currentRatio}:{formatRatio(latestRatios.currentRatio)}</span>
                ) : null}
                {latestRatios.quickRatio != null ? (
                  <span>{copy.quickRatio}:{formatRatio(latestRatios.quickRatio)}</span>
                ) : null}
                {latestRatios.invTurn != null ? (
                  <span>{copy.invTurn}:{formatRatio(latestRatios.invTurn)}</span>
                ) : null}
                {latestRatios.arTurn != null ? (
                  <span>{copy.arTurn}:{formatRatio(latestRatios.arTurn)}</span>
                ) : null}
              </div>
            </div>
          ) : null}

          {rows.length > 0 ? (
            <div className="overflow-x-auto pb-0.5">
              <table className="min-w-[560px] w-full table-fixed text-left">
                <thead>
                  <tr className="text-[10px] font-medium leading-none text-secondary-text">
                    <th className="w-[18%] pb-3.5 pr-4">{copy.period}</th>
                    <th className="w-[26%] pb-3.5 pr-4">{copy.assetsAndLiab}</th>
                    <th className="w-[16%] pb-3.5 pr-4 text-center">{copy.debtRatio}</th>
                    <th className="w-[25%] pb-3.5 pr-4">{copy.cashAndInventory}</th>
                    <th className="w-[15%] pb-3.5 text-right">{copy.interestDebt}</th>
                  </tr>
                </thead>
                <tbody className="text-xs font-semibold leading-none text-foreground">
                  {rows.slice(0, 7).map((row, index) => (
                    <tr key={`${row.period}-${index}`}>
                      <td className="py-2.5 pr-4 font-mono">{row.period}</td>
                      <td className="py-2.5 pr-4 font-mono">
                        {formatAmountBillion(row.totalAssets)}/{formatAmountBillion(row.totalLiab)}
                      </td>
                      <td className="py-2.5 pr-4 text-center font-mono">
                        {formatRatio(row.debtRatio, '%')}
                      </td>
                      <td className="py-2.5 pr-4 font-mono">
                        {formatAmountBillion(row.moneyCap)}/{formatAmountBillion(row.inventories)}
                      </td>
                      <td className="py-2.5 text-right font-mono text-success">
                        {formatAmountBillion(row.interestBearingDebt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card className="h-full rounded-xl border-0 text-left shadow-none">
      <Card.Content className={`space-y-5 ${compact ? 'py-4' : 'py-5'}`}>
        {content}
      </Card.Content>
    </Card>
  );
};
