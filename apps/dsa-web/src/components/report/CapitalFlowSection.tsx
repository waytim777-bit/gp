import type React from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { Card } from '@heroui/react/card';
import type { CapitalFlowReport, DimensionAnalysisReport, ReportLanguage } from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';
import { DimensionAnalysisBlock } from './DimensionAnalysisBlock';
import { coerceFiniteNumber } from './financialFormat';

interface CapitalFlowSectionProps {
  capitalFlow?: CapitalFlowReport;
  capitalFlowAnalysis?: DimensionAnalysisReport;
  language?: ReportLanguage;
  compact?: boolean;
}

const formatFlow = (value?: number | null): string => {
  const parsed = coerceFiniteNumber(value);
  if (parsed == null) {
    return '--';
  }
  const abs = Math.abs(parsed);
  if (abs >= 100_000_000) {
    return `${(parsed / 100_000_000).toFixed(2)}亿`;
  }
  if (abs >= 10_000) {
    return `${(parsed / 10_000).toFixed(2)}万`;
  }
  return parsed.toFixed(2);
};

export const CapitalFlowSection: React.FC<CapitalFlowSectionProps> = ({
  capitalFlow,
  capitalFlowAnalysis,
  language,
  compact = false,
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const stockFlow = capitalFlow?.stockFlow ?? capitalFlow?.stock_flow;
  const sectorRankings = capitalFlow?.sectorRankings ?? capitalFlow?.sector_rankings;
  const hasStructured = Boolean(
    coerceFiniteNumber(stockFlow?.mainNetInflow ?? stockFlow?.main_net_inflow) != null
    || coerceFiniteNumber(stockFlow?.inflow5d ?? stockFlow?.inflow_5d) != null
    || (sectorRankings?.top && sectorRankings.top.length > 0),
  );
  const hasAnalysis = Boolean(
    capitalFlowAnalysis?.summary
    || (Array.isArray(capitalFlowAnalysis?.items) && capitalFlowAnalysis.items.length > 0),
  );
  if (!hasStructured && !hasAnalysis) {
    return null;
  }

  const copy = reportLanguage === 'en'
    ? {
      eyebrow: 'MARKET SENTIMENT',
      title: 'Main Capital Flow',
      main: 'Main Net Inflow',
      d5: '5D Cumulative',
      d10: '10D Cumulative',
      topSectors: 'Top Inflow Sectors',
      bottomSectors: 'Top Outflow Sectors',
      status: 'Status',
      source: 'Source',
    }
    : {
      eyebrow: '市场情绪',
      title: '主力资金流',
      main: '主力净流入',
      d5: '5日累计',
      d10: '10日累计',
      topSectors: '板块净流入前三',
      bottomSectors: '板块净流出前三',
      status: '数据状态',
      source: '数据源',
    };

  const formatSectorList = (rows?: Array<{ name?: string; netInflow?: number | null; net_inflow?: number | null }>) => {
    if (!rows || rows.length === 0) {
      return '--';
    }
    return rows
      .map((row) => `${row.name ?? '--'}(${formatFlow(row.netInflow ?? row.net_inflow)})`)
      .join(' / ');
  };

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-default-500" aria-hidden="true" />
          <div>
            {!compact ? (
              <div className="text-[11px] font-medium uppercase tracking-wider text-default-500">
                {copy.eyebrow}
              </div>
            ) : null}
            <h3 className="text-base font-semibold text-foreground">{copy.title}</h3>
          </div>
        </div>
        {capitalFlow?.source ? (
          <span className="rounded-md bg-default-100 px-2 py-1 text-[11px] text-default-500">
            {copy.source}: {capitalFlow.source}
          </span>
        ) : null}
      </div>

      {hasAnalysis ? (
        <DimensionAnalysisBlock
          analysis={capitalFlowAnalysis}
          language={reportLanguage}
          showOverallStance
        />
      ) : null}

      {hasStructured ? (
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed text-left text-sm">
            <tbody>
              {capitalFlow?.status ? (
                <tr className="border-b border-subtle">
                  <td className="w-2/5 px-2 py-2 text-default-600">{copy.status}</td>
                  <td className="px-2 py-2 text-right text-foreground">{capitalFlow.status}</td>
                </tr>
              ) : null}
              <tr className="border-b border-subtle">
                <td className="w-2/5 px-2 py-2 text-default-600">{copy.main}</td>
                <td className="px-2 py-2 text-right font-mono text-foreground">
                  {formatFlow(stockFlow?.mainNetInflow ?? stockFlow?.main_net_inflow)}
                </td>
              </tr>
              <tr className="border-b border-subtle">
                <td className="w-2/5 px-2 py-2 text-default-600">{copy.d5}</td>
                <td className="px-2 py-2 text-right font-mono text-foreground">
                  {formatFlow(stockFlow?.inflow5d ?? stockFlow?.inflow_5d)}
                </td>
              </tr>
              <tr className="border-b border-subtle">
                <td className="w-2/5 px-2 py-2 text-default-600">{copy.d10}</td>
                <td className="px-2 py-2 text-right font-mono text-foreground">
                  {formatFlow(stockFlow?.inflow10d ?? stockFlow?.inflow_10d)}
                </td>
              </tr>
              <tr className="border-b border-subtle">
                <td className="w-2/5 px-2 py-2 text-default-600">{copy.topSectors}</td>
                <td className="px-2 py-2 text-right text-foreground">{formatSectorList(sectorRankings?.top)}</td>
              </tr>
              <tr>
                <td className="w-2/5 px-2 py-2 text-default-600">{copy.bottomSectors}</td>
                <td className="px-2 py-2 text-right text-foreground">{formatSectorList(sectorRankings?.bottom)}</td>
              </tr>
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
    <Card className="border border-subtle p-4 shadow-none">
      <div className="space-y-4">{content}</div>
    </Card>
  );
};
