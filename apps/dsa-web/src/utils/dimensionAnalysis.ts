import type { DimensionAnalysisReport, DimensionAnalysisItem, ReportLanguage } from '../types/analysis';

export type AnalysisStance = 'bullish' | 'bearish' | 'neutral';

const cleanText = (value?: string | null): string => (value || '').trim();

export const normalizeStance = (value?: string | null): AnalysisStance | null => {
  const text = cleanText(value).toLowerCase();
  if (!text) {
    return null;
  }
  if (text === 'bullish' || text === '偏多' || text === '看多') {
    return 'bullish';
  }
  if (text === 'bearish' || text === '偏空' || text === '看空') {
    return 'bearish';
  }
  if (text === 'neutral' || text === '中性' || text === '震荡') {
    return 'neutral';
  }
  return null;
};

export const getStanceLabel = (stance: AnalysisStance | null, language: ReportLanguage): string => {
  if (!stance) {
    return '--';
  }
  if (language === 'en') {
    return stance === 'bullish' ? 'Bullish' : stance === 'bearish' ? 'Bearish' : 'Neutral';
  }
  return stance === 'bullish' ? '偏多' : stance === 'bearish' ? '偏空' : '中性';
};

export const getStanceClassName = (stance: AnalysisStance | null): string => {
  if (stance === 'bullish') {
    return 'text-[var(--home-price-up)] bg-[color-mix(in_srgb,var(--home-price-up)_12%,transparent)]';
  }
  if (stance === 'bearish') {
    return 'text-[var(--home-price-down)] bg-[color-mix(in_srgb,var(--home-price-down)_12%,transparent)]';
  }
  if (stance === 'neutral') {
    return 'text-default-600 bg-default-100';
  }
  return 'text-default-500 bg-default-100';
};

const normalizeItem = (item: DimensionAnalysisItem): DimensionAnalysisItem => ({
  dimension: cleanText(item.dimension) || undefined,
  title: cleanText(item.title) || undefined,
  stance: normalizeStance(item.stance) || undefined,
  content: cleanText(item.content) || undefined,
});

export const getDimensionAnalysisItems = (
  analysis?: DimensionAnalysisReport,
  dimension?: string,
): DimensionAnalysisItem[] => {
  const items = Array.isArray(analysis?.items) ? analysis.items : [];
  return items
    .map((item: DimensionAnalysisItem) => normalizeItem(item))
    .filter((item: DimensionAnalysisItem) => item.title || item.content)
    .filter((item: DimensionAnalysisItem) => !dimension || item.dimension === dimension);
};

export const pickDimensionAnalysis = (
  fundamentals?: DimensionAnalysisReport,
  dimension?: string,
  legacy?: DimensionAnalysisReport,
): DimensionAnalysisReport | undefined => {
  const dimensionItems = getDimensionAnalysisItems(fundamentals, dimension);
  if (dimensionItems.length > 0 || (dimension && cleanText(fundamentals?.summary))) {
    return {
      summary: fundamentals?.summary,
      overallStance: fundamentals?.overallStance ?? fundamentals?.overall_stance,
      items: dimensionItems,
      source: fundamentals?.source,
    };
  }
  if (legacy && (legacy.summary || (legacy.items && legacy.items.length > 0))) {
    return legacy;
  }
  return undefined;
};
