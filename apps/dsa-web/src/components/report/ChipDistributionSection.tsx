import type React from 'react';
import { Layers } from 'lucide-react';
import { Card } from '@heroui/react/card';
import type { ChipDistributionReport, ReportLanguage } from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';
import { coerceFiniteNumber, formatGrowthPct, formatRatio } from './financialFormat';

interface ChipDistributionSectionProps {
  chipDistribution?: ChipDistributionReport;
  language?: ReportLanguage;
  compact?: boolean;
}

const formatPct = (value?: number | null): string => {
  const parsed = coerceFiniteNumber(value);
  if (parsed == null) {
    return '--';
  }
  if (parsed <= 1) {
    return `${(parsed * 100).toFixed(2)}%`;
  }
  return `${parsed.toFixed(2)}%`;
};

export const ChipDistributionSection: React.FC<ChipDistributionSectionProps> = ({
  chipDistribution,
  language,
  compact = false,
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  if (!chipDistribution) {
    return null;
  }

  const profitRatio = chipDistribution.profitRatio ?? chipDistribution.profit_ratio;
  const avgCost = chipDistribution.avgCost ?? chipDistribution.avg_cost;
  const cost90Low = chipDistribution.cost90Low ?? chipDistribution.cost_90_low;
  const cost90High = chipDistribution.cost90High ?? chipDistribution.cost_90_high;
  const concentration90 = chipDistribution.concentration90 ?? chipDistribution.concentration_90;
  const chipStatus = chipDistribution.chipStatus ?? chipDistribution.chip_status;
  const chipHealth = chipDistribution.chipHealth ?? chipDistribution.chip_health;
  const priceVsAvgCost = chipDistribution.priceVsAvgCostPct ?? chipDistribution.price_vs_avg_cost_pct;

  const hasContent = [profitRatio, avgCost, cost90Low, cost90High, concentration90].some(
    (value) => coerceFiniteNumber(value) != null,
  );
  if (!hasContent) {
    return null;
  }

  const copy = reportLanguage === 'en'
    ? {
      eyebrow: 'MARKET SENTIMENT',
      title: 'Chip Distribution',
      profit: 'Profit Ratio',
      avgCost: 'Average Cost',
      zone90: '90% Cost Zone',
      concentration: '90% Concentration',
      status: 'Chip Status',
      health: 'Chip Health',
      priceVsCost: 'Price vs Avg Cost',
      source: 'Source',
    }
    : {
      eyebrow: '市场情绪',
      title: '筹码分布',
      profit: '获利比例',
      avgCost: '平均成本',
      zone90: '90%成本区间',
      concentration: '90%集中度',
      status: '筹码状态',
      health: '筹码健康度',
      priceVsCost: '现价较平均成本',
      source: '数据源',
    };

  const rows = [
    { label: copy.profit, value: formatPct(profitRatio) },
    { label: copy.avgCost, value: formatRatio(avgCost) },
    {
      label: copy.zone90,
      value: `${formatRatio(cost90Low)} ~ ${formatRatio(cost90High)}`,
    },
    { label: copy.concentration, value: formatPct(concentration90) },
    { label: copy.status, value: chipStatus || '--' },
    { label: copy.health, value: chipHealth || '--' },
    { label: copy.priceVsCost, value: formatGrowthPct(priceVsAvgCost) },
  ];

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-default-500" aria-hidden="true" />
          <div>
            {!compact ? (
              <div className="text-[11px] font-medium uppercase tracking-wider text-default-500">
                {copy.eyebrow}
              </div>
            ) : null}
            <h3 className="text-base font-semibold text-foreground">{copy.title}</h3>
          </div>
        </div>
        {chipDistribution.source ? (
          <span className="rounded-md bg-default-100 px-2 py-1 text-[11px] text-default-500">
            {copy.source}: {chipDistribution.source}
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed text-left text-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-subtle last:border-b-0">
                <td className="w-2/5 px-2 py-2 text-default-600">{row.label}</td>
                <td className="px-2 py-2 text-right font-mono text-foreground">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
