import type React from 'react';
import { CalendarRange } from 'lucide-react';
import { Card } from '@heroui/react/card';
import type { DimensionAnalysisReport, ReportLanguage } from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';
import { DimensionAnalysisBlock } from './DimensionAnalysisBlock';

interface WeeklyTrendAnalysisSectionProps {
  weeklyTrendAnalysis?: DimensionAnalysisReport;
  language?: ReportLanguage;
  compact?: boolean;
}

export const WeeklyTrendAnalysisSection: React.FC<WeeklyTrendAnalysisSectionProps> = ({
  weeklyTrendAnalysis,
  language,
  compact = false,
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const hasContent = Boolean(
    weeklyTrendAnalysis?.summary
    || (Array.isArray(weeklyTrendAnalysis?.items) && weeklyTrendAnalysis.items.length > 0),
  );
  if (!hasContent) {
    return null;
  }

  const copy = reportLanguage === 'en'
    ? { eyebrow: 'TECHNICAL ANALYSIS', title: 'Weekly Trend Interpretation' }
    : { eyebrow: '技术分析', title: '周线走势解读' };

  const content = (
    <>
      <div className="flex items-center gap-2">
        <CalendarRange className="h-4 w-4 text-default-500" aria-hidden="true" />
        <div>
          {!compact ? (
            <div className="text-[11px] font-medium uppercase tracking-wider text-default-500">
              {copy.eyebrow}
            </div>
          ) : null}
          <h3 className="text-base font-semibold text-foreground">{copy.title}</h3>
        </div>
      </div>
      <DimensionAnalysisBlock
        analysis={weeklyTrendAnalysis}
        language={reportLanguage}
        showOverallStance
      />
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
