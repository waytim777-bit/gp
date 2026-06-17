import apiClient from './index';
import { toCamelCase } from './utils';
import type {
  NotificationProfile,
  SubscriptionItem,
  SubscriptionListResponse,
  SubscriptionPricing,
  SubscriptionPushLogListResponse,
} from '../types/subscriptions';

export const subscriptionsApi = {
  async getProfile(): Promise<NotificationProfile> {
    const response = await apiClient.get<Record<string, unknown>>('/api/v1/subscriptions/profile');
    return toCamelCase(response.data) as NotificationProfile;
  },

  async saveProfile(payload: {
    notificationEmail: string;
    webhookUrls: string;
    webhookBearerToken?: string;
    clearWebhookBearerToken?: boolean;
  }): Promise<NotificationProfile> {
    const response = await apiClient.put<Record<string, unknown>>('/api/v1/subscriptions/profile', {
      notification_email: payload.notificationEmail,
      webhook_urls: payload.webhookUrls,
      webhook_bearer_token: payload.webhookBearerToken,
      clear_webhook_bearer_token: payload.clearWebhookBearerToken ?? false,
    });
    return toCamelCase(response.data) as NotificationProfile;
  },

  async getPricing(): Promise<SubscriptionPricing> {
    const response = await apiClient.get<Record<string, unknown>>('/api/v1/subscriptions/pricing');
    return toCamelCase(response.data) as SubscriptionPricing;
  },

  async list(): Promise<SubscriptionListResponse> {
    const response = await apiClient.get<Record<string, unknown>>('/api/v1/subscriptions');
    return toCamelCase(response.data) as SubscriptionListResponse;
  },

  async create(payload: {
    code: string;
    name?: string;
    intervalDays: number;
  }): Promise<SubscriptionItem> {
    const response = await apiClient.post<Record<string, unknown>>('/api/v1/subscriptions', {
      code: payload.code,
      name: payload.name,
      interval_days: payload.intervalDays,
    });
    return toCamelCase(response.data) as SubscriptionItem;
  },

  async update(
    subscriptionId: number,
    payload: { intervalDays?: number; status?: 'active' | 'paused' },
  ): Promise<SubscriptionItem> {
    const response = await apiClient.patch<Record<string, unknown>>(
      `/api/v1/subscriptions/${subscriptionId}`,
      {
        interval_days: payload.intervalDays,
        status: payload.status,
      },
    );
    return toCamelCase(response.data) as SubscriptionItem;
  },

  async remove(subscriptionId: number): Promise<void> {
    await apiClient.delete(`/api/v1/subscriptions/${subscriptionId}`);
  },

  async listPushLogs(limit = 20): Promise<SubscriptionPushLogListResponse> {
    const response = await apiClient.get<Record<string, unknown>>(
      '/api/v1/subscriptions/push-logs',
      { params: { limit } },
    );
    return toCamelCase(response.data) as SubscriptionPushLogListResponse;
  },
};
