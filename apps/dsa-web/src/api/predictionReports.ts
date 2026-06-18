import apiClient from './index';
import { toCamelCase } from './utils';
import type {
  LikePredictionReportResponse,
  PredictionReportListResponse,
  PredictionReportListingItem,
  PredictionReportPricing,
  PurchasePredictionReportResponse,
} from '../types/predictionReports';

export const predictionReportsApi = {
  list: async (): Promise<PredictionReportListResponse> => {
    const response = await apiClient.get<Record<string, unknown>>('/api/v1/prediction-reports');
    return toCamelCase<PredictionReportListResponse>(response.data);
  },

  getPricing: async (): Promise<PredictionReportPricing> => {
    const response = await apiClient.get<Record<string, unknown>>('/api/v1/prediction-reports/pricing');
    return toCamelCase<PredictionReportPricing>(response.data);
  },

  share: async (recordId: number): Promise<PredictionReportListingItem> => {
    const response = await apiClient.post<Record<string, unknown>>(
      '/api/v1/prediction-reports/share',
      { record_id: recordId },
    );
    return toCamelCase<PredictionReportListingItem>(response.data);
  },

  getDetail: async (listingId: number): Promise<PredictionReportListingItem> => {
    const response = await apiClient.get<Record<string, unknown>>(
      `/api/v1/prediction-reports/${listingId}`,
    );
    return toCamelCase<PredictionReportListingItem>(response.data);
  },

  purchase: async (listingId: number): Promise<PurchasePredictionReportResponse> => {
    const response = await apiClient.post<Record<string, unknown>>(
      `/api/v1/prediction-reports/${listingId}/purchase`,
    );
    return toCamelCase<PurchasePredictionReportResponse>(response.data);
  },

  like: async (listingId: number): Promise<LikePredictionReportResponse> => {
    const response = await apiClient.post<Record<string, unknown>>(
      `/api/v1/prediction-reports/${listingId}/like`,
    );
    return toCamelCase<LikePredictionReportResponse>(response.data);
  },
};
