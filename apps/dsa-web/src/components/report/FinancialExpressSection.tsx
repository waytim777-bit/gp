import type React from 'react';
import { Zap } from 'lucide-react';
import { Card } from '@heroui/react/card';
import type { ExpressReportRow, FinancialReport, ReportLanguage, DimensionAnalysisReport } from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';
import { DimensionAnalysisBlock } from './DimensionAnalysisBlock';
import { pickDimensionAnalysis } from '../../utils/dimensionAnalysis';
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
  financialFundamentalsAnalysis,
  language,
  compact = false,
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const rows = getRows(financialReport);
  const dimensionAnalysis = pickDimensionAnalysis(financialFundamentalsAnalysis, 'express_report');
  const report = financialReport?.expressReport ?? financialReport?.express_report;

  if (rows.length === 0 && !dimensionAnalysis) {
    return null;
  }

  const copy = reportLanguage === 'en'
    ? {
      eyebrow: 'FINANCIAL DATA',
      title: 'Earnings Express',
      period: 'Period',
      announced: 'Announced',
      revenue: 'Revenue (100M)',
      netProfit: 'Net Profit (100M)',
      netProfitYoy: 'Net Profit YoY',
      dilutedRoe: 'Diluted ROE',
      dilutedEps: 'Diluted EPS',
      source: 'Source',
    }
    : {
      eyebrow: '财务数据分析',
      title: '业绩快报',
      period: '报告期',
      announced: '公告日',
      revenue: '营业收入（亿）',
      netProfit: '净利润（亿）',
      netProfitYoy: '净利同比',
      dilutedRoe: '摊薄ROE',
      dilutedEps: '摊薄EPS',
      source: '数据源',
    };

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-default-500" aria-hidden="true" />
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
        dimension="express_report"
        language={reportLanguage}
      />

      {rows.length > 0 ? (
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed text-left text-sm">
          <thead>
            <tr className="border-b border-subtle text-[11px] font-medium uppercase tracking-wide text-default-500">
              <th className="px-2 py-2">{copy.period}</th>
              <th className="px-2 py-2">{copy.announced}</th>
              <th className="px-2 py-2 text-right">{copy.revenue}</th>
              <th className="px-2 py-2 text-right">{copy.netProfit}</th>
              <th className="px-2 py-2 text-right">{copy.netProfitYoy}</th>
              <th className="px-2 py-2 text-right">{copy.dilutedRoe}</th>
              <th className="px-2 py-2 text-right">{copy.dilutedEps}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.period}-${row.announcementDate ?? ''}`} className="border-b border-subtle last:border-b-0">
                <td className="px-2 py-2 font-mono text-foreground">{row.period}</td>
                <td className="px-2 py-2 font-mono text-default-600">{row.announcementDate ?? '--'}</td>
                <td className="px-2 py-2 text-right font-mono text-foreground">
                  {formatAmountBillion(row.revenue)}
                </td>
                <td className="px-2 py-2 text-right font-mono text-foreground">
                  {formatAmountBillion(row.netProfit)}
                </td>
                <td
                  className="px-2 py-2 text-right font-mono font-semibold"
                  style={getGrowthStyle(row.netProfitYoy)}
                >
                  {formatGrowthPct(row.netProfitYoy)}
                </td>
                <td className="px-2 py-2 text-right font-mono text-foreground">
                  {formatRatio(row.dilutedRoe, '%')}
                </td>
                <td className="px-2 py-2 text-right font-mono text-foreground">
                  {formatRatio(row.dilutedEps)}
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
