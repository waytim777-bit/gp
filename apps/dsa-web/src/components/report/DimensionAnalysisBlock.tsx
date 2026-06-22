import type React from 'react';
import type { DimensionAnalysisReport, ReportLanguage } from '../../types/analysis';
import {
  getDimensionAnalysisItems,
  getStanceClassName,
  getStanceLabel,
  normalizeStance,
} from '../../utils/dimensionAnalysis';

interface DimensionAnalysisBlockProps {
  analysis?: DimensionAnalysisReport;
  dimension?: string;
  language?: ReportLanguage;
  showOverallStance?: boolean;
}

const cleanText = (value?: string | null): string => (value || '').trim();

export const DimensionAnalysisBlock: React.FC<DimensionAnalysisBlockProps> = ({
  analysis,
  dimension,
  language = 'zh',
  showOverallStance = false,
}) => {
  const summary = cleanText(analysis?.summary);
  const items = getDimensionAnalysisItems(analysis, dimension);
  const overallStance = normalizeStance(
    analysis?.overallStance ?? analysis?.overall_stance,
  );

  if (!summary && items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 text-sm leading-7 text-foreground">
      {(summary || (showOverallStance && overallStance)) ? (
        <div className="flex flex-wrap items-start gap-2">
          {showOverallStance && overallStance ? (
            <span className={`rounded-md px-2 py-1 text-xs font-medium ${getStanceClassName(overallStance)}`}>
              {getStanceLabel(overallStance, language)}
            </span>
          ) : null}
          {summary ? <p className="min-w-0 flex-1 whitespace-pre-wrap">{summary}</p> : null}
        </div>
      ) : null}
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item, index) => {
            const itemStance = normalizeStance(item.stance);
            return (
              <li key={`${item.title}-${index}`} className="flex gap-2">
                <span className="mt-[0.72em] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-default-400" />
                <span className="min-w-0">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {item.title ? <strong>{item.title}</strong> : null}
                    {itemStance ? (
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${getStanceClassName(itemStance)}`}>
                        {getStanceLabel(itemStance, language)}
                      </span>
                    ) : null}
                  </span>
                  {item.content ? (
                    <span>
                      {item.title ? '：' : ''}
                      {item.content}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
};
