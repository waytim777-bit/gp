import type React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card } from '@heroui/react/card';
import type {
  ModelOpinionDivergence,
  ModelOpinionItem,
  ModelOpinionsPayload,
  ReportLanguage,
} from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';

interface ModelOpinionsPanelProps {
  modelOpinions?: ModelOpinionsPayload | Record<string, unknown> | null;
  language?: ReportLanguage;
  variant?: 'default' | 'fullReport';
}

const normalizeDivergence = (raw: unknown): ModelOpinionDivergence | undefined => {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const item = raw as Record<string, unknown>;
  return {
    scoreMin: typeof item.score_min === 'number' ? item.score_min : undefined,
    scoreMax: typeof item.score_max === 'number' ? item.score_max : undefined,
    scoreSpread: typeof item.score_spread === 'number' ? item.score_spread : undefined,
    scoreMedian: typeof item.score_median === 'number' ? item.score_median : undefined,
    primaryScore: typeof item.primary_score === 'number' ? item.primary_score : undefined,
    alignment: item.alignment as ModelOpinionDivergence['alignment'],
    alignmentLabelZh: String(item.alignment_label_zh ?? '') || undefined,
    alignmentLabelEn: String(item.alignment_label_en ?? '') || undefined,
    outlierModels: Array.isArray(item.outlier_models)
      ? item.outlier_models.map((m) => String(m))
      : undefined,
  };
};

const normalizeOpinion = (raw: unknown): ModelOpinionItem | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const item = raw as Record<string, unknown>;
  return {
    role: (item.role as ModelOpinionItem['role']) || 'consultation',
    model: String(item.model || ''),
    success: item.success !== false,
    sentimentScore: typeof item.sentiment_score === 'number'
      ? item.sentiment_score
      : typeof item.sentimentScore === 'number'
        ? item.sentimentScore
        : undefined,
    operationAdvice: String(item.operation_advice ?? item.operationAdvice ?? '') || undefined,
    trendPrediction: String(item.trend_prediction ?? item.trendPrediction ?? '') || undefined,
    confidence: String(item.confidence ?? '') || undefined,
    summary: String(item.summary ?? '') || undefined,
    reasoning: String(item.reasoning ?? '') || undefined,
    bullCase: String(item.bull_case ?? item.bullCase ?? '') || undefined,
    bearCase: String(item.bear_case ?? item.bearCase ?? '') || undefined,
    dissentNote: String(item.dissent_note ?? item.dissentNote ?? '') || undefined,
    error: String(item.error ?? '') || undefined,
  };
};

const normalizePayload = (raw: unknown): ModelOpinionsPayload | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const payload = raw as Record<string, unknown>;
  const opinionsRaw = payload.opinions;
  if (!Array.isArray(opinionsRaw) || opinionsRaw.length === 0) {
    return null;
  }
  const opinions = opinionsRaw
    .map(normalizeOpinion)
    .filter((item): item is ModelOpinionItem => item !== null);
  if (opinions.length === 0) {
    return null;
  }
  return {
    primaryModel: String(payload.primary_model ?? payload.primaryModel ?? ''),
    reportLanguage: (payload.report_language ?? payload.reportLanguage) as ReportLanguage | undefined,
    briefKind: String(payload.brief_kind ?? payload.briefKind ?? '') || undefined,
    divergence: normalizeDivergence(payload.divergence),
    opinions,
  };
};

const shortModelName = (model: string): string => {
  const trimmed = model.trim();
  if (!trimmed) {
    return '--';
  }
  const slash = trimmed.lastIndexOf('/');
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
};

const roleLabel = (role: ModelOpinionItem['role'], language: ReportLanguage): string => {
  if (role === 'primary') {
    return language === 'en' ? 'Primary' : '主模型';
  }
  return language === 'en' ? 'Consult' : '会诊';
};

const sortOpinionsForDisplay = (opinions: ModelOpinionItem[]): ModelOpinionItem[] => {
  const consult = opinions.filter((item) => item.role === 'consultation');
  const primary = opinions.filter((item) => item.role === 'primary');
  return [...consult, ...primary];
};

const isOutlier = (
  item: ModelOpinionItem,
  divergence?: ModelOpinionDivergence,
): boolean => {
  if (item.role !== 'consultation' || item.sentimentScore == null) {
    return false;
  }
  if (divergence?.outlierModels?.includes(item.model)) {
    return true;
  }
  if (divergence?.primaryScore != null) {
    return Math.abs(item.sentimentScore - divergence.primaryScore) >= 12;
  }
  return false;
};

const scoreText = (score?: number): string => (score == null ? '--' : String(score));

const DivergenceBanner: React.FC<{
  divergence: ModelOpinionDivergence;
  language: ReportLanguage;
  variant?: 'default' | 'fullReport';
}> = ({ divergence, language, variant = 'default' }) => {
  const isEn = language === 'en';
  const spread = divergence.scoreSpread ?? 0;
  const label = isEn
    ? divergence.alignmentLabelEn
    : divergence.alignmentLabelZh;

  const toneClass = divergence.alignment === 'low'
    ? 'border-warning/45 bg-warning/10 text-foreground'
    : divergence.alignment === 'moderate'
      ? 'border-[#00a1c2]/35 bg-[#00a1c2]/5 text-foreground'
      : 'border-subtle text-foreground';

  if (spread === 0 && divergence.alignment === 'insufficient') {
    return null;
  }

  if (variant === 'fullReport') {
    return (
      <div className={`rounded-xl border px-4 py-3 text-sm ${toneClass}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-semibold text-foreground">
            {isEn ? 'Score spread' : '评分跨度'}: {divergence.scoreMin ?? '--'}-{divergence.scoreMax ?? '--'}
            {spread > 0 && ` (Δ${spread})`}
          </span>
          {label && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-secondary-text">
              {divergence.alignment === 'low' && <AlertTriangle className="h-3.5 w-3.5" />}
              {label}
            </span>
          )}
          {divergence.primaryScore != null && (
            <span className="text-xs text-secondary-text">
              {isEn ? 'Primary' : '主模型'}: {divergence.primaryScore}
              {divergence.scoreMedian != null && (
                <> · {isEn ? 'Median' : '中位'}: {divergence.scoreMedian}</>
              )}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border px-3 py-2.5 text-sm ${toneClass}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">
          {isEn ? 'Score spread' : '评分跨度'}: {divergence.scoreMin ?? '--'}-{divergence.scoreMax ?? '--'}
          {spread > 0 && ` (Δ${spread})`}
        </span>
        {label && (
          <span className="flex items-center gap-1 text-secondary-text">
            {divergence.alignment === 'low' && <AlertTriangle className="h-4 w-4" />}
            {label}
          </span>
        )}
        {divergence.primaryScore != null && (
          <span className="text-secondary-text">
            {isEn ? 'Primary' : '主模型'}: {divergence.primaryScore}
            {divergence.scoreMedian != null && (
              <> · {isEn ? 'Median' : '中位'}: {divergence.scoreMedian}</>
            )}
          </span>
        )}
      </div>
    </div>
  );
};

const OpinionCard: React.FC<{
  item: ModelOpinionItem;
  language: ReportLanguage;
  highlight?: boolean;
  variant?: 'default' | 'fullReport';
}> = ({ item, language, highlight = false, variant = 'default' }) => {
  const isEn = language === 'en';
  const borderClass = item.role === 'primary'
    ? 'border-transparent bg-[#00a1c2]/10'
    : highlight
      ? 'border-warning/50 bg-warning/5 ring-1 ring-warning/25'
      : 'border-subtle';
  const fullReportBorderClass = item.role === 'primary'
    ? 'border-transparent bg-[#00a1c2]/10'
    : highlight
      ? 'border-warning/45 bg-warning/5 ring-1 ring-warning/20'
      : 'border-subtle';

  if (variant === 'fullReport') {
    return (
      <Card className={`rounded-xl border p-4 shadow-none ${fullReportBorderClass}`}>
        <div className="mb-3 space-y-2">
          <p className="text-xs font-semibold text-secondary-text">
            {roleLabel(item.role, language)}
          </p>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              {shortModelName(item.model)}
            </p>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-secondary-text">
              {scoreText(item.sentimentScore)}
            </span>
          </div>
          {highlight && (
            <span className="inline-flex rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
              {isEn ? 'Diverges from primary' : '与主模型偏离'}
            </span>
          )}
        </div>

        {!item.success ? (
          <p className="text-sm text-danger">{item.error || (isEn ? 'Consultation failed' : '会诊失败')}</p>
        ) : (
          <div className="space-y-2.5 text-sm leading-6">
            {item.operationAdvice && (
              <p className="text-foreground">
                <span className="font-semibold">{isEn ? 'Advice: ' : '建议：'}</span>
                <span className="text-foreground">{item.operationAdvice}</span>
              </p>
            )}
            {item.trendPrediction && (
              <p className="text-foreground">
                <span className="font-semibold">{isEn ? 'Trend: ' : '趋势：'}</span>
                <span className="text-foreground">{item.trendPrediction}</span>
              </p>
            )}
            {item.confidence && (
              <p className="text-foreground">
                <span className="font-semibold">{isEn ? 'Confidence: ' : '置信：'}</span>
                <span className="text-foreground">{item.confidence}</span>
              </p>
            )}
            {item.bullCase && (
              <p className="rounded-lg bg-success/5 px-2.5 py-1.5 leading-6 text-foreground">
                <span className="font-medium text-success">{isEn ? 'Bull: ' : '看多：'}</span>
                {item.bullCase}
              </p>
            )}
            {item.bearCase && (
              <p className="rounded-lg bg-danger/5 px-2.5 py-1.5 leading-6 text-foreground">
                <span className="font-medium text-danger">{isEn ? 'Bear: ' : '看空/风险：'}</span>
                {item.bearCase}
              </p>
            )}
            {item.summary && (
              <p className="leading-relaxed text-foreground">{item.summary}</p>
            )}
            {item.dissentNote && (
              <p className="italic text-secondary-text">
                <span className="not-italic font-medium">{isEn ? 'Dissent: ' : '分歧视角：'}</span>
                {item.dissentNote}
              </p>
            )}
            {item.reasoning && item.reasoning !== item.summary && (
              <p className="text-secondary-text">{item.reasoning}</p>
            )}
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card className={`rounded-xl border p-3 shadow-none ${borderClass}`}>
      <div className="mb-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-secondary-text">
            {roleLabel(item.role, language)}
          </p>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-secondary-text">
            {scoreText(item.sentimentScore)}
          </span>
        </div>
        <div className="flex min-w-0 items-center">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {shortModelName(item.model)}
          </p>
        </div>
        {highlight && (
          <span className="inline-flex rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
            {isEn ? 'Diverges from primary' : '与主模型偏离'}
          </span>
        )}
      </div>

      {!item.success ? (
        <p className="text-sm text-danger">{item.error || (isEn ? 'Consultation failed' : '会诊失败')}</p>
      ) : (
        <div className="space-y-2 text-sm leading-6">
          {item.operationAdvice && (
            <p className="text-foreground">
              <span className="font-semibold">{isEn ? 'Advice: ' : '建议：'}</span>
              <span className="font-medium text-foreground">{item.operationAdvice}</span>
            </p>
          )}
          {item.trendPrediction && (
            <p className="text-foreground">
              <span className="font-semibold">{isEn ? 'Trend: ' : '趋势：'}</span>
              <span className="text-foreground">{item.trendPrediction}</span>
            </p>
          )}
          {item.confidence && (
            <p className="text-foreground">
              <span className="font-semibold">{isEn ? 'Confidence: ' : '置信：'}</span>
              <span className="text-foreground">{item.confidence}</span>
            </p>
          )}
          {item.bullCase && (
            <p className="rounded-lg bg-success/5 px-2.5 py-1.5 leading-6 text-foreground">
              <span className="font-medium text-success">{isEn ? 'Bull: ' : '看多：'}</span>
              {item.bullCase}
            </p>
          )}
          {item.bearCase && (
            <p className="rounded-lg bg-danger/5 px-2.5 py-1.5 leading-6 text-foreground">
              <span className="font-medium text-danger">{isEn ? 'Bear: ' : '看空/风险：'}</span>
              {item.bearCase}
            </p>
          )}
          {item.summary && (
            <p className="leading-relaxed text-foreground">{item.summary}</p>
          )}
          {item.dissentNote && (
            <p className="italic text-secondary-text">
              <span className="not-italic font-medium">{isEn ? 'Dissent: ' : '分歧视角：'}</span>
              {item.dissentNote}
            </p>
          )}
          {item.reasoning && item.reasoning !== item.summary && (
            <p className="text-secondary-text">{item.reasoning}</p>
          )}
        </div>
      )}
    </Card>
  );
};

export const ModelOpinionsPanel: React.FC<ModelOpinionsPanelProps> = ({
  modelOpinions,
  language,
  variant = 'default',
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const payload = normalizePayload(modelOpinions);
  if (!payload) {
    return null;
  }

  const isEn = reportLanguage === 'en';
  const consultCount = payload.opinions.filter((item) => item.role === 'consultation').length;
  const displayOpinions = sortOpinionsForDisplay(payload.opinions);
  const isFullReport = variant === 'fullReport';

  return (
    <section className={`home-divider rounded-xl bg-card shadow-none ${isFullReport ? 'p-5' : 'p-4'}`}>
      <div className={`${isFullReport ? 'mb-5' : 'mb-4'} flex flex-wrap items-center justify-between gap-2`}>
        <h3 className={`${isFullReport ? 'text-lg' : 'text-base md:text-lg'} font-semibold text-foreground`}>
          {isEn ? 'Multi-Model Consultation' : '多模型会诊'}
        </h3>
        {consultCount > 0 && (
          <span className="text-xs text-secondary-text">
            {isEn
              ? `Independent read on shared facts · ${consultCount} model(s) · consult first`
              : `独立会诊 · 共享事实 · ${consultCount} 个模型 · 先阅会诊后看主模型`}
          </span>
        )}
      </div>

      <div className={isFullReport ? 'space-y-5' : 'space-y-4'}>
        {payload.divergence && (
          <DivergenceBanner
            divergence={payload.divergence}
            language={reportLanguage}
            variant={variant}
          />
        )}

        <div className={isFullReport ? 'space-y-4' : 'grid gap-3 md:grid-cols-2 xl:grid-cols-3'}>
          {displayOpinions.map((item) => (
            <OpinionCard
              key={`${item.role}-${item.model}`}
              item={item}
              language={reportLanguage}
              highlight={isOutlier(item, payload.divergence)}
              variant={variant}
            />
          ))}
        </div>
      </div>
    </section>
  );
};
