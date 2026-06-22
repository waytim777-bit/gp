import type React from 'react';

export const formatAmountBillion = (value?: number | null): string => {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '--';
  }
  return (value / 100000000).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatGrowthPct = (value?: number | null): string => {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '--';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

export const formatRatio = (value?: number | null, suffix = ''): string => {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '--';
  }
  return `${value.toFixed(2)}${suffix}`;
};

export const getGrowthStyle = (value?: number | null): React.CSSProperties | undefined => {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return undefined;
  }
  if (value > 0) {
    return { color: 'var(--home-price-up)' };
  }
  if (value < 0) {
    return { color: 'var(--home-price-down)' };
  }
  return undefined;
};

export const coerceFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(/%$/, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
