import type React from 'react';
import { Card } from '@heroui/react/card';
import type { ExpressReportRow, FinancialReport, ReportLanguage, DimensionAnalysisReport } from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';
import {
  coerceFiniteNumber,
  formatAmountBillion,
  formatGrowthPct,
  formatRatio,
  getGrowthStyle,
} from './financialFormat';

interface FinancialExpressSectionProps {
  financialReport?: FinancialReport;
  financialFundamentalsAnalysis?: DimensionAnalysisReport;
  language?: ReportLanguage;
  compact?: boolean;
}

type ExpressRowPayload = ExpressReportRow & {
  announcement_date?: string | null;
  net_profit?: number | null;
  net_profit_yoy?: number | null;
  diluted_roe?: number | null;
  diluted_eps?: number | null;
};

const normalizeRow = (row: ExpressRowPayload): ExpressReportRow => ({
  period: row.period,
  reportDate: row.reportDate || row.report_date || null,
  announcementDate: row.announcementDate || row.announcement_date || null,
  revenue: coerceFiniteNumber(row.revenue),
  netProfit: coerceFiniteNumber(row.netProfit ?? row.net_profit),
  netProfitYoy: coerceFiniteNumber(row.netProfitYoy ?? row.net_profit_yoy),
  dilutedRoe: coerceFiniteNumber(row.dilutedRoe ?? row.diluted_roe),
  dilutedEps: coerceFiniteNumber(row.dilutedEps ?? row.diluted_eps),
});

const getRows = (financialReport?: FinancialReport): ExpressReportRow[] => {
  const report = financialReport?.expressReport ?? financialReport?.express_report;
  const rows = report?.rows;
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .map((row) => normalizeRow(row as ExpressRowPayload))
    .filter((row) => row.period && (row.revenue != null || row.netProfit != null));
};

export const FinancialExpressSection: React.FC<FinancialExpressSectionProps> = ({
  financialReport,
  language,
  compact = false,
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const rows = getRows(financialReport);
  const report = financialReport?.expressReport ?? financialReport?.express_report;

  if (rows.length === 0) {
    return null;
  }

  const copy = reportLanguage === 'en'
    ? {
      title: 'Earnings Express',
      periodAndAnnounced: 'Period / Announced',
      revenueAndNetProfit: 'Revenue / Net Profit (100M)',
      roeAndEps: 'Diluted ROE / EPS',
      netProfitYoy: 'Net Profit YoY',
      source: 'Source',
    }
    : {
      title: '业绩快报',
      periodAndAnnounced: '报告期/公告日',
      revenueAndNetProfit: '营业收入/净利润（亿）',
      roeAndEps: '摊薄ROE/摊薄EPS',
      netProfitYoy: '净利同比',
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
            <tr className="text-[11px] font-medium text-secondary-text">
              <th className="w-[24%] pb-4">{copy.periodAndAnnounced}</th>
              <th className="w-[30%] pb-4 text-left">{copy.revenueAndNetProfit}</th>
              <th className="w-[26%] pb-4 text-left">{copy.roeAndEps}</th>
              <th className="w-[20%] pb-4 text-right">{copy.netProfitYoy}</th>
            </tr>
          </thead>
          <tbody className="text-xs font-semibold text-foreground">
            {rows.slice(0, 3).map((row, index) => (
              <tr key={`${row.period}-${row.announcementDate ?? index}`}>
                <td className="py-3 pr-3 font-mono leading-5">
                  <span className="block">{row.period}</span>
                  <span className="block">{row.announcementDate ?? '--'}</span>
                </td>
                <td className="py-3 pr-3 font-mono">
                  {formatAmountBillion(row.revenue)}/{formatAmountBillion(row.netProfit)}
                </td>
                <td className="py-3 pr-3 font-mono">
                  {formatRatio(row.dilutedRoe, '%')}/{formatRatio(row.dilutedEps)}
                </td>
                <td
                  className="py-3 text-right font-mono"
                  style={getGrowthStyle(row.netProfitYoy)}
                >
                  {formatGrowthPct(row.netProfitYoy)}
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
      <Card.Content className={`space-y-5 ${compact ? 'p-4' : 'p-5'}`}>
        {content}
      </Card.Content>
    </Card>
  );
};
