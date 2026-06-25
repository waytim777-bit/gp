import type React from 'react';
import { Target } from 'lucide-react';
import { Card } from '@heroui/react/card';
import type { DimensionAnalysisReport, KeyLevelsReport, ReportLanguage } from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';
import { DimensionAnalysisBlock } from './DimensionAnalysisBlock';
import { coerceFiniteNumber, formatRatio } from './financialFormat';

interface KeyLevelsSectionProps {
  keyLevels?: KeyLevelsReport;
  keyLevelsAnalysis?: DimensionAnalysisReport;
  language?: ReportLanguage;
  compact?: boolean;
}

const formatLevels = (values?: number[] | null): string => {
  if (!Array.isArray(values) || values.length === 0) {
    return '--';
  }
  return values
    .filter((value) => Number.isFinite(value))
    .map((value) => value.toFixed(2))
    .join(' / ');
};

export const KeyLevelsSection: React.FC<KeyLevelsSectionProps> = ({
  keyLevels,
  keyLevelsAnalysis,
  language,
  compact = false,
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const technical = keyLevels?.technical;
  const chip = keyLevels?.chip;
  const patterns = keyLevels?.patterns;
  const supportLevels = technical?.supportLevels ?? technical?.support_levels;
  const resistanceLevels = technical?.resistanceLevels ?? technical?.resistance_levels;
  const patternLabel = patterns?.patternLabel ?? patterns?.pattern_label;

  const hasStructured = Boolean(
    (supportLevels && supportLevels.length > 0)
    || (resistanceLevels && resistanceLevels.length > 0)
    || coerceFiniteNumber(chip?.avgCost ?? chip?.avg_cost) != null
    || patternLabel,
  );
  const hasAnalysis = Boolean(
    keyLevelsAnalysis?.summary
    || (Array.isArray(keyLevelsAnalysis?.items) && keyLevelsAnalysis.items.length > 0),
  );
  if (!hasStructured && !hasAnalysis) {
    return null;
  }

  const copy = reportLanguage === 'en'
    ? {
      eyebrow: 'TECHNICAL ANALYSIS',
      title: 'Key Support / Resistance',
      support: 'Support Levels',
      resistance: 'Resistance Levels',
      chipCost: 'Chip Avg Cost',
      chipZone: '90% Chip Zone',
      pattern: 'Pattern Hint',
      source: 'Source',
    }
    : {
      eyebrow: '技术分析',
      title: '关键支撑/阻力',
      support: '技术支撑位',
      resistance: '技术阻力位',
      chipCost: '筹码平均成本',
      chipZone: '90%筹码成本区',
      pattern: '形态提示',
      source: '数据源',
    };

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-default-500" aria-hidden="true" />
          <div>
            {!compact ? (
              <div className="text-[11px] font-medium uppercase tracking-wider text-default-500">
                {copy.eyebrow}
              </div>
            ) : null}
            <h3 className="text-base font-semibold text-foreground">{copy.title}</h3>
          </div>
        </div>
        {keyLevels?.source ? (
          <span className="rounded-md bg-default-100 px-2 py-1 text-[11px] text-default-500">
            {copy.source}: {keyLevels.source}
          </span>
        ) : null}
      </div>

      {hasAnalysis ? (
        <DimensionAnalysisBlock
          analysis={keyLevelsAnalysis}
          language={reportLanguage}
          showOverallStance
        />
      ) : null}

      {hasStructured ? (
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed text-left text-sm">
            <tbody>
              <tr className="border-b border-subtle">
                <td className="w-2/5 px-2 py-2 text-default-600">{copy.support}</td>
                <td className="px-2 py-2 text-right font-mono text-foreground">{formatLevels(supportLevels)}</td>
              </tr>
              <tr className="border-b border-subtle">
                <td className="w-2/5 px-2 py-2 text-default-600">{copy.resistance}</td>
                <td className="px-2 py-2 text-right font-mono text-foreground">{formatLevels(resistanceLevels)}</td>
              </tr>
              {chip ? (
                <>
                  <tr className="border-b border-subtle">
                    <td className="w-2/5 px-2 py-2 text-default-600">{copy.chipCost}</td>
                    <td className="px-2 py-2 text-right font-mono text-foreground">
                      {formatRatio(chip.avgCost ?? chip.avg_cost)}
                    </td>
                  </tr>
                  <tr className="border-b border-subtle">
                    <td className="w-2/5 px-2 py-2 text-default-600">{copy.chipZone}</td>
                    <td className="px-2 py-2 text-right font-mono text-foreground">
                      {formatRatio(chip.cost90Low ?? chip.cost_90_low)} ~ {formatRatio(chip.cost90High ?? chip.cost_90_high)}
                    </td>
                  </tr>
                </>
              ) : null}
              {patternLabel ? (
                <tr>
                  <td className="w-2/5 px-2 py-2 text-default-600">{copy.pattern}</td>
                  <td className="px-2 py-2 text-right text-foreground">{patternLabel}</td>
                </tr>
              ) : null}
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
