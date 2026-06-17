export type NotificationProfile = {
  notificationEmail: string;
  webhookUrls: string;
  hasWebhookBearerToken: boolean;
};

export type SubscriptionItem = {
  id: number;
  code: string;
  name: string;
  market: string;
  intervalDays: 1 | 3 | 5;
  intervalLabel: string;
  status: 'active' | 'paused';
  anchorDate?: string | null;
  lastPushedOn?: string | null;
  nextPushOn?: string | null;
  creditsPerPush: number;
  estimatedMonthlyCredits: number;
  createdAt?: string | null;
};

export type SubscriptionListResponse = {
  items: SubscriptionItem[];
  total: number;
  activeCount: number;
};

export type SubscriptionPricing = {
  creditsPerPush: number;
  tradingDaysPerMonth: number;
  estimatedMonthlyByInterval: Record<string, number>;
};

export type SubscriptionPushLogItem = {
  id: number;
  subscriptionId: number;
  code: string;
  pushedOn?: string | null;
  channel: string;
  status: 'success' | 'failed' | 'skipped' | string;
  creditsCharged: number;
  errorMessage: string;
  createdAt?: string | null;
};

export type SubscriptionPushLogListResponse = {
  items: SubscriptionPushLogItem[];
};

export type IntervalOption = {
  days: 1 | 3 | 5;
  label: string;
};

export const INTERVAL_OPTIONS: IntervalOption[] = [
  { days: 1, label: '每天' },
  { days: 3, label: '每3天' },
  { days: 5, label: '每5天' },
];
