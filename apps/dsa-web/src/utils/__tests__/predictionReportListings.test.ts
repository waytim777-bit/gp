import { describe, expect, it } from 'vitest';
import { dedupeLatestPerStockCode, formatCycleVersionLabel } from '../predictionReportListings';
import type { PredictionReportListingItem } from '../../types/predictionReports';

const baseItem = (overrides: Partial<PredictionReportListingItem>): PredictionReportListingItem => ({
  id: 1,
  sellerUserId: 2,
  sellerUsername: 'seller',
  code: '600519',
  name: '贵州茅台',
  market: 'cn',
  reportType: 'detailed',
  purchaseCredits: 100,
  sellerRewardCredits: 90,
  isMine: false,
  purchased: false,
  canViewFull: false,
  canPurchase: true,
  preview: {},
  likeCount: 0,
  liked: false,
  ...overrides,
});

describe('predictionReportListings', () => {
  it('dedupes purchasable listings to the highest cycle version per stock code', () => {
    const items = [
      baseItem({ id: 1, cycleVersion: 1, analyzedAt: '2026-06-23T08:00:00Z' }),
      baseItem({ id: 2, cycleVersion: 3, analyzedAt: '2026-06-23T09:00:00Z' }),
      baseItem({ id: 3, code: '000001', name: '平安银行', cycleVersion: 2 }),
    ];

    const result = dedupeLatestPerStockCode(items);
    expect(result).toHaveLength(2);
    expect(result.find((item) => item.code === '600519')?.id).toBe(2);
    expect(result.find((item) => item.code === '000001')?.id).toBe(3);
  });

  it('formats cycle version labels', () => {
    expect(formatCycleVersionLabel(1)).toBe('V1');
    expect(formatCycleVersionLabel(3)).toBe('V3');
    expect(formatCycleVersionLabel(undefined)).toBe('V1');
  });
});
