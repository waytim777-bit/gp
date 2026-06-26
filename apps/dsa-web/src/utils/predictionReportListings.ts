import type { PredictionReportListingItem } from '../types/predictionReports';

export type PredictionReportTab = 'purchasable' | 'expired' | 'purchased' | 'published';

const listingRecencyKey = (item: PredictionReportListingItem): number => {
  if (item.cycleVersion != null && item.cycleVersion > 0) {
    return item.cycleVersion;
  }
  const timestamp = item.analyzedAt || item.createdAt;
  if (timestamp) {
    return new Date(timestamp).getTime();
  }
  return item.id;
};

export const formatCycleVersionLabel = (version?: number | null): string => {
  const value = Number(version);
  if (!Number.isFinite(value) || value <= 0) {
    return 'V1';
  }
  return `V${Math.trunc(value)}`;
};

export const dedupeLatestPerStockCode = (
  items: PredictionReportListingItem[],
): PredictionReportListingItem[] => {
  const byCode = new Map<string, PredictionReportListingItem>();

  for (const item of items) {
    const existing = byCode.get(item.code);
    if (!existing) {
      byCode.set(item.code, item);
      continue;
    }

    const itemKey = listingRecencyKey(item);
    const existingKey = listingRecencyKey(existing);
    if (itemKey > existingKey || (itemKey === existingKey && item.id > existing.id)) {
      byCode.set(item.code, item);
    }
  }

  return Array.from(byCode.values()).sort((left, right) => {
    const diff = listingRecencyKey(right) - listingRecencyKey(left);
    return diff !== 0 ? diff : right.id - left.id;
  });
};

export const filterItemsByTab = (
  items: PredictionReportListingItem[],
  tab: PredictionReportTab,
): PredictionReportListingItem[] => {
  switch (tab) {
    case 'purchasable':
      return dedupeLatestPerStockCode(items.filter((item) => item.canPurchase));
    case 'expired':
      return items.filter((item) => item.isCurrentCycle === false);
    case 'purchased':
      return items.filter((item) => item.hasPurchaseRecord);
    case 'published':
      return items.filter((item) => item.isMine);
    default:
      return items;
  }
};
