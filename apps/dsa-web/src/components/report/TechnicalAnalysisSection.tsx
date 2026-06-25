import type React from 'react';
import { LineChart } from 'lucide-react';
import { Card } from '@heroui/react/card';
import type { DimensionAnalysisReport, ReportLanguage } from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';
import { DimensionAnalysisBlock } from './DimensionAnalysisBlock';

interface TechnicalAnalysisSectionProps {
  technicalAnalysisReport?: DimensionAnalysisReport;
  language?: ReportLanguage;
  compact?: boolean;
}

export const TechnicalAnalysisSection: React.FC<TechnicalAnalysisSectionProps> = ({
  technicalAnalysisReport,
  language,
  compact = false,
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const hasContent = Boolean(
    technicalAnalysisReport?.summary
    || (Array.isArray(technicalAnalysisReport?.items) && technicalAnalysisReport.items.length > 0),
  );
  if (!hasContent) {
    return null;
  }

  const copy = reportLanguage === 'en'
    ? { eyebrow: 'TECHNICAL ANALYSIS', title: 'Technical Conclusion' }
    : { eyebrow: '技术分析', title: '技术面结论' };

  const content = (
    <>
      <div className="flex items-center gap-2">
        <LineChart className="h-4 w-4 text-default-500" aria-hidden="true" />
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
        analysis={technicalAnalysisReport}
        language={reportLanguage}
        showOverallStance
      />
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
