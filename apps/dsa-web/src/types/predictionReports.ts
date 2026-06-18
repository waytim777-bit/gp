export type PredictionReportPreview = {
  sentimentScore?: number;
  operationAdvice?: string;
  trendPrediction?: string;
  analysisSummary?: string;
};

export type PredictionReportListingItem = {
  id: number;
  sellerUserId: number;
  sellerUsername: string;
  code: string;
  name: string;
  market: string;
  cycleAnchorDate?: string | null;
  reportType: string;
  purchaseCredits: number;
  sellerRewardCredits: number;
  isMine: boolean;
  purchased: boolean;
  canViewFull: boolean;
  buyerHistoryId?: number | null;
  preview: PredictionReportPreview;
  likeCount: number;
  liked: boolean;
  createdAt?: string | null;
};

export type PredictionReportPricing = {
  purchaseCredits: number;
  sellerRewardCredits: number;
  platformCredits: number;
};

export type PredictionReportListResponse = {
  items: PredictionReportListingItem[];
  total: number;
  pricing: PredictionReportPricing;
};

export type PurchasePredictionReportResponse = {
  listingId: number;
  purchaseId?: number | null;
  buyerHistoryId?: number | null;
  alreadyPurchased: boolean;
  creditsPaid: number;
  sellerCredits?: number | null;
};

export type LikePredictionReportResponse = {
  listingId: number;
  liked: boolean;
  likeCount: number;
};
