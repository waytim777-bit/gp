import type React from 'react';
import type { PredictionCycleMeta, ReportLanguage } from '../../types/analysis';
import { Badge } from '../common';
import { getReportText, normalizeReportLanguage } from '../../utils/reportLanguage';

interface PredictionCycleBannerProps {
  cycle?: PredictionCycleMeta;
  language?: ReportLanguage;
}

const formatCycleDate = (value?: string): string => {
  if (!value) {
    return '—';
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return value;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
};

const hasCycleContent = (cycle?: PredictionCycleMeta): cycle is PredictionCycleMeta => {
  if (!cycle) {
    return false;
  }
  return Boolean(
    cycle.cycleAnchorDate || cycle.predictionTargetDate || cycle.dataAsOfDate,
  );
};

export const PredictionCycleBanner: React.FC<PredictionCycleBannerProps> = ({
  cycle,
  language,
}) => {
  if (!hasCycleContent(cycle)) {
    return null;
  }

  const reportLanguage = normalizeReportLanguage(language);
  const text = getReportText(reportLanguage);

  return (
    <div className="rounded-xl border border-default-200 bg-default-50/80 px-4 py-3 text-sm text-default-700">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{text.predictionCycleTitle}</span>
        {cycle.fromCache ? (
          <Badge variant="info">{text.predictionCycleCached}</Badge>
        ) : null}
        {typeof cycle.probeCreditsCharged === 'number' && cycle.probeCreditsCharged > 0 ? (
          <Badge variant="warning">
            {text.predictionCycleProbeCredits.replace(
              '{credits}',
              String(cycle.probeCreditsCharged),
            )}
          </Badge>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-default-600">
        <span>
          {text.predictionCycleAnchor}: {formatCycleDate(cycle.cycleAnchorDate)}
        </span>
        <span>
          {text.predictionCycleTarget}: {formatCycleDate(cycle.predictionTargetDate)}
        </span>
        {cycle.dataAsOfDate ? (
          <span>
            {text.predictionCycleDataAsOf}: {formatCycleDate(cycle.dataAsOfDate)}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-default-500">{text.predictionCycleHint}</p>
    </div>
  );
};
