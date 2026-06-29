import type React from 'react';
import { Card } from '@heroui/react/card';
import type { DimensionAnalysisReport, KeyLevelsReport, ReportLanguage } from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';
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
  if (!hasStructured) {
    return null;
  }

  const copy = reportLanguage === 'en'
    ? {
      title: 'Key Support / Resistance',
      support: 'Support Levels',
      resistance: 'Resistance Levels',
      chipCost: 'Chip Avg Cost',
      chipZone: '90% Chip Zone',
      pattern: 'Pattern Hint',
      source: 'Source',
    }
    : {
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
        <h3 className="text-lg font-semibold leading-none text-foreground">{copy.title}</h3>
        {keyLevels?.source ? (
          <span className="shrink-0 truncate text-xs font-medium text-secondary-text">
            {copy.source}: {keyLevels.source}
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed text-left text-sm">
          <tbody>
            <tr className="rounded-md bg-default-100/70">
              <td className="w-2/5 px-3 py-2.5 text-muted-text">{copy.support}</td>
              <td className="px-3 py-2.5 text-right font-semibold text-foreground">{formatLevels(supportLevels)}</td>
            </tr>
            <tr>
              <td className="w-2/5 px-3 py-2.5 text-muted-text">{copy.resistance}</td>
              <td className="px-3 py-2.5 text-right font-semibold text-foreground">{formatLevels(resistanceLevels)}</td>
            </tr>
            {chip ? (
              <>
                <tr>
                  <td className="w-2/5 px-3 py-2.5 text-muted-text">{copy.chipCost}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                    {formatRatio(chip.avgCost ?? chip.avg_cost)}
                  </td>
                </tr>
                <tr>
                  <td className="w-2/5 px-3 py-2.5 text-muted-text">{copy.chipZone}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                    {formatRatio(chip.cost90Low ?? chip.cost_90_low)} ~ {formatRatio(chip.cost90High ?? chip.cost_90_high)}
                  </td>
                </tr>
              </>
            ) : null}
            {patternLabel ? (
              <tr>
                <td className="w-2/5 px-3 py-2.5 text-muted-text">{copy.pattern}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-foreground">{patternLabel}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );

  return (
    <Card className="rounded-xl border-0 bg-surface text-left shadow-none">
      <Card.Content className={compact ? 'space-y-4 py-4' : 'space-y-5 py-5'}>
        {content}
      </Card.Content>
    </Card>
  );
};
