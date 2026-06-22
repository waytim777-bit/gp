import type { BacktestResultItem } from '../types/backtest';

export type BacktestTone = 'success' | 'danger' | 'neutral';

export type PredictionReportBacktestPreview = {
  available?: boolean;
  tone?: BacktestTone | string;
  label?: string;
  outcome?: string;
  directionCorrect?: boolean;
  stockReturnPct?: number;
  evalWindowDays?: number;
  evalStatus?: string;
};

export const backtestToneTextClass = (tone?: string): string => {
  switch (tone) {
    case 'success':
      return 'text-success';
    case 'danger':
      return 'text-danger';
    default:
      return 'text-default-500';
  }
};

export const backtestToneBorderClass = (tone?: string): string => {
  switch (tone) {
    case 'success':
      return 'border-success/30 bg-success/5';
    case 'danger':
      return 'border-danger/30 bg-danger/5';
    default:
      return 'border-default-200 bg-default-50/40';
  }
};

export const formatBacktestPct = (value?: number | null): string => {
  if (value == null || Number.isNaN(value)) {
    return '--';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

export const outcomeLabel = (outcome?: string | null, language: 'zh' | 'en' = 'zh'): string => {
  if (!outcome) {
    return '--';
  }
  if (language === 'en') {
    switch (outcome) {
      case 'win':
        return 'Win';
      case 'loss':
        return 'Loss';
      case 'neutral':
        return 'Neutral';
      default:
        return outcome;
    }
  }
  switch (outcome) {
    case 'win':
      return '验证通过';
    case 'loss':
      return '验证未通过';
    case 'neutral':
      return '中性';
    default:
      return outcome;
  }
};

export const actualMovementLabel = (movement?: string | null, language: 'zh' | 'en' = 'zh'): string => {
  if (!movement) {
    return '--';
  }
  if (language === 'en') {
    switch (movement) {
      case 'up':
        return 'Up';
      case 'down':
        return 'Down';
      case 'flat':
        return 'Flat';
      default:
        return movement;
    }
  }
  switch (movement) {
    case 'up':
      return '上涨';
    case 'down':
      return '下跌';
    case 'flat':
      return '横盘';
    default:
      return movement;
  }
};

export const firstHitLabel = (value?: string | null, language: 'zh' | 'en' = 'zh'): string => {
  if (!value) {
    return '--';
  }
  const mapZh: Record<string, string> = {
    take_profit: '止盈',
    stop_loss: '止损',
    ambiguous: '同日触发',
    neither: '均未触发',
    not_applicable: '不适用',
  };
  const mapEn: Record<string, string> = {
    take_profit: 'Take profit',
    stop_loss: 'Stop loss',
    ambiguous: 'Same day',
    neither: 'Neither',
    not_applicable: 'N/A',
  };
  const table = language === 'en' ? mapEn : mapZh;
  return table[value] || value;
};

export const normalizeBacktestResult = (
  raw?: BacktestResultItem | Record<string, unknown> | null,
): BacktestResultItem | undefined => {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  return raw as BacktestResultItem;
};

export const backtestPreviewFromResult = (
  result?: BacktestResultItem,
): PredictionReportBacktestPreview | undefined => {
  if (!result || result.evalStatus !== 'completed') {
    return undefined;
  }
  let tone: BacktestTone = 'neutral';
  if (result.outcome === 'win' || result.directionCorrect === true) {
    tone = 'success';
  } else if (result.outcome === 'loss' || result.directionCorrect === false) {
    tone = 'danger';
  }
  const parts: string[] = [];
  if (result.directionCorrect === true) {
    parts.push('方向正确');
  } else if (result.directionCorrect === false) {
    parts.push('方向错误');
  }
  const pct = result.stockReturnPct ?? result.actualReturnPct;
  if (pct != null) {
    parts.push(formatBacktestPct(pct));
  }
  const label = parts.length > 0
    ? `${parts.join(' · ')}${result.evalWindowDays ? `（${result.evalWindowDays}日）` : ''}`
    : outcomeLabel(result.outcome);
  return {
    available: true,
    tone,
    label,
    outcome: result.outcome,
    directionCorrect: result.directionCorrect,
    stockReturnPct: pct,
    evalWindowDays: result.evalWindowDays,
    evalStatus: result.evalStatus,
  };
};
