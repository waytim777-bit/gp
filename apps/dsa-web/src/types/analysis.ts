/**
 * Analysis-related type definitions.
 * Aligned with the API schema.
 */

import type { BacktestResultItem } from './backtest';

// ============ Request Types ============

export interface AnalysisRequest {
  stockCode?: string;
  stockCodes?: string[];
  reportType?: 'simple' | 'detailed' | 'full' | 'brief';
  forceRefresh?: boolean;
  asyncMode?: boolean;
  stockName?: string;
  originalQuery?: string;
  selectionSource?: 'manual' | 'autocomplete' | 'import' | 'image';
  notify?: boolean;
}

// ============ Report Types ============

export type ReportLanguage = 'zh' | 'en';

/** Report metadata */
export interface PredictionCycleMeta {
  cycleAnchorDate?: string;
  predictionTargetDate?: string;
  dataAsOfDate?: string;
  fromCache?: boolean;
  probeCreditsCharged?: number;
}

export interface ReportMeta {
  id?: number;  // Analysis history record ID, present for persisted reports
  queryId: string;
  stockCode: string;
  stockName: string;
  reportType: 'simple' | 'detailed' | 'full' | 'brief';
  reportLanguage?: ReportLanguage;
  createdAt: string;
  currentPrice?: number;
  changePct?: number;
  modelUsed?: string;  // LLM model used for analysis
  predictionCycle?: PredictionCycleMeta;
}

/** Sentiment label */
export type SentimentLabel =
  | '极度悲观'
  | '悲观'
  | '中性'
  | '乐观'
  | '极度乐观'
  | 'Very Bearish'
  | 'Bearish'
  | 'Neutral'
  | 'Bullish'
  | 'Very Bullish';

/** Report summary section */
export interface ReportSummary {
  analysisSummary: string;
  operationAdvice: string;
  trendPrediction: string;
  sentimentScore: number;
  sentimentLabel?: SentimentLabel;
}

/** Strategy section */
export interface ReportStrategy {
  idealBuy?: string;
  secondaryBuy?: string;
  stopLoss?: string;
  takeProfit?: string;
}

export interface RelatedBoard {
  name: string;
  code?: string;
  type?: string;
}

export interface SectorRankingItem {
  name: string;
  changePct?: number;
}

export interface SectorRankings {
  top?: SectorRankingItem[];
  bottom?: SectorRankingItem[];
}

export interface CompanyProfile {
  fullName?: string;
  industry?: string;
  legalRepresentative?: string;
  chairman?: string;
  manager?: string;
  boardSecretary?: string;
  listingDate?: string;
  totalShareCapital?: number;
  floatShareCapital?: number;
  employeeCount?: number;
  website?: string;
  mainBusiness?: string;
  businessScope?: string;
  companyIntro?: string;
  actualController?: string;
  actualControllerHoldRatio?: number;
  directController?: string;
  controlType?: string;
}

export interface RevenueGrowthRow {
  fiscalYear?: number;
  fiscal_year?: number;
  reportDate?: string;
  report_date?: string | null;
  revenue?: number | null;
  revenueYoy?: number | null;
  revenue_yoy?: number | null;
  netProfit?: number | null;
  net_profit?: number | null;
  announcementDate?: string | null;
  announcement_date?: string | null;
}

export interface RevenueGrowthReport {
  rows?: RevenueGrowthRow[];
  unit?: string;
  frequency?: string;
  source?: string;
}

export interface ProfitabilityRow {
  period?: string;
  reportDate?: string | null;
  report_date?: string | null;
  grossMargin?: number | null;
  gross_margin?: number | string | null;
  netMargin?: number | null;
  net_margin?: number | string | null;
  roe?: number | null;
}

export interface ProfitabilityReport {
  rows?: ProfitabilityRow[];
  unit?: string;
  frequency?: string;
  source?: string;
}

export interface IncomePeriodRow {
  period?: string;
  reportDate?: string | null;
  report_date?: string | null;
  revenue?: number | null;
  netProfit?: number | null;
  net_profit?: number | null;
  rdExp?: number | null;
  rd_exp?: number | null;
  revenueYoy?: number | null;
  revenue_yoy?: number | null;
}

export interface IncomePeriodsReport {
  rows?: IncomePeriodRow[];
  unit?: string;
  frequency?: string;
  source?: string;
}

export interface BalanceSheetRow {
  period?: string;
  reportDate?: string | null;
  report_date?: string | null;
  totalAssets?: number | null;
  total_assets?: number | null;
  totalLiab?: number | null;
  total_liab?: number | null;
  debtRatio?: number | null;
  debt_ratio?: number | null;
  totalCurAssets?: number | null;
  total_cur_assets?: number | null;
  totalCurLiab?: number | null;
  total_cur_liab?: number | null;
  currentRatio?: number | null;
  current_ratio?: number | null;
  moneyCap?: number | null;
  money_cap?: number | null;
  inventories?: number | null;
  cip?: number | null;
  prepayment?: number | null;
  interestBearingDebt?: number | null;
  interest_bearing_debt?: number | null;
}

export interface BalanceSheetLatestRatios {
  reportDate?: string | null;
  report_date?: string | null;
  debtToAssets?: number | null;
  debt_to_assets?: number | null;
  currentRatio?: number | null;
  current_ratio?: number | null;
  quickRatio?: number | null;
  quick_ratio?: number | null;
  invTurn?: number | null;
  inv_turn?: number | null;
  arTurn?: number | null;
  ar_turn?: number | null;
}

export interface BalanceSheetReport {
  rows?: BalanceSheetRow[];
  latestRatios?: BalanceSheetLatestRatios;
  latest_ratios?: BalanceSheetLatestRatios;
  unit?: string;
  frequency?: string;
  source?: string;
}

export interface CashFlowRow {
  period?: string;
  reportDate?: string | null;
  report_date?: string | null;
  operatingCashFlow?: number | null;
  operating_cash_flow?: number | null;
  investingCashFlow?: number | null;
  investing_cash_flow?: number | null;
  financingCashFlow?: number | null;
  financing_cash_flow?: number | null;
  operatingCashFlowYoy?: number | null;
  operating_cash_flow_yoy?: number | null;
}

export interface CashFlowReport {
  rows?: CashFlowRow[];
  unit?: string;
  frequency?: string;
  source?: string;
}

export interface ExpressReportRow {
  period?: string;
  reportDate?: string | null;
  report_date?: string | null;
  announcementDate?: string | null;
  announcement_date?: string | null;
  revenue?: number | null;
  netProfit?: number | null;
  net_profit?: number | null;
  netProfitYoy?: number | null;
  net_profit_yoy?: number | null;
  dilutedRoe?: number | null;
  diluted_roe?: number | null;
  dilutedEps?: number | null;
  diluted_eps?: number | null;
}

export interface ExpressReport {
  rows?: ExpressReportRow[];
  unit?: string;
  frequency?: string;
  source?: string;
}

export interface ProfitabilityAnalysisItem {
  title?: string;
  content?: string;
}

export interface ProfitabilityAnalysisReport {
  summary?: string;
  items?: ProfitabilityAnalysisItem[];
  source?: string;
  overallStance?: string;
  overall_stance?: string;
}

export interface DimensionAnalysisItem {
  dimension?: string;
  title?: string;
  stance?: string;
  content?: string;
}

export interface DimensionAnalysisReport {
  summary?: string;
  overallStance?: string;
  overall_stance?: string;
  items?: DimensionAnalysisItem[];
  source?: string;
}

export interface TechnicalMovingAverages {
  ma5?: number | null;
  ma10?: number | null;
  ma20?: number | null;
  ma60?: number | null;
  biasMa5?: number | null;
  bias_ma5?: number | null;
  biasMa10?: number | null;
  bias_ma10?: number | null;
  biasMa20?: number | null;
  bias_ma20?: number | null;
}

export interface TechnicalMacd {
  dif?: number | null;
  dea?: number | null;
  bar?: number | null;
  status?: string | null;
  signal?: string | null;
}

export interface TechnicalRsi {
  rsi6?: number | null;
  rsi_6?: number | null;
  rsi12?: number | null;
  rsi_12?: number | null;
  rsi24?: number | null;
  rsi_24?: number | null;
  status?: string | null;
  signal?: string | null;
}

export interface TechnicalLevels {
  supportLevels?: number[];
  support_levels?: number[];
  resistanceLevels?: number[];
  resistance_levels?: number[];
  supportMa5?: boolean;
  support_ma5?: boolean;
  supportMa10?: boolean;
  support_ma10?: boolean;
}

export interface TechnicalIndicatorsReport {
  source?: string;
  asOfPrice?: number | null;
  as_of_price?: number | null;
  trend?: {
    status?: string | null;
    maAlignment?: string | null;
    ma_alignment?: string | null;
    strength?: number | null;
  };
  movingAverages?: TechnicalMovingAverages;
  moving_averages?: TechnicalMovingAverages;
  macd?: TechnicalMacd;
  rsi?: TechnicalRsi;
  kdj?: {
    k?: number | null;
    d?: number | null;
    j?: number | null;
    status?: string | null;
    signal?: string | null;
  };
  boll?: {
    upper?: number | null;
    middle?: number | null;
    lower?: number | null;
    pctB?: number | null;
    pct_b?: number | null;
    bandwidthPct?: number | null;
    bandwidth_pct?: number | null;
    status?: string | null;
    signal?: string | null;
  };
  volume?: {
    status?: string | null;
    ratio5d?: number | null;
    ratio_5d?: number | null;
    trend?: string | null;
  };
  levels?: TechnicalLevels;
  signal?: {
    buySignal?: string | null;
    buy_signal?: string | null;
    score?: number | null;
    reasons?: string[];
    riskFactors?: string[];
    risk_factors?: string[];
  };
}

export interface KlineRow {
  date?: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
  ma5?: number | null;
  ma10?: number | null;
  ma20?: number | null;
  pctChg?: number | null;
  pct_chg?: number | null;
}

export interface KlineSnapshot {
  latestClose?: number | null;
  latest_close?: number | null;
  periodHigh?: number | null;
  period_high?: number | null;
  periodLow?: number | null;
  period_low?: number | null;
  periodHighDate?: string | null;
  period_high_date?: string | null;
  periodLowDate?: string | null;
  period_low_date?: string | null;
  distanceFromLowPct?: number | null;
  distance_from_low_pct?: number | null;
  distanceFromHighPct?: number | null;
  distance_from_high_pct?: number | null;
  change20dPct?: number | null;
  change_20d_pct?: number | null;
  change60dPct?: number | null;
  change_60d_pct?: number | null;
}

export interface KlineSeriesReport {
  source?: string;
  totalRecords?: number;
  total_records?: number;
  rows?: KlineRow[];
  snapshot?: KlineSnapshot;
}

export interface ChipDistributionReport {
  source?: string;
  profitRatio?: number | null;
  profit_ratio?: number | null;
  avgCost?: number | null;
  avg_cost?: number | null;
  cost90Low?: number | null;
  cost_90_low?: number | null;
  cost90High?: number | null;
  cost_90_high?: number | null;
  concentration90?: number | null;
  concentration_90?: number | null;
  cost70Low?: number | null;
  cost_70_low?: number | null;
  cost70High?: number | null;
  cost_70_high?: number | null;
  concentration70?: number | null;
  concentration_70?: number | null;
  chipStatus?: string | null;
  chip_status?: string | null;
  chipHealth?: string | null;
  chip_health?: string | null;
  priceVsAvgCostPct?: number | null;
  price_vs_avg_cost_pct?: number | null;
}

export interface KeyLevelsReport {
  source?: string;
  currentPrice?: number | null;
  current_price?: number | null;
  technical?: {
    supportLevels?: number[];
    support_levels?: number[];
    resistanceLevels?: number[];
    resistance_levels?: number[];
  };
  chip?: {
    avgCost?: number | null;
    avg_cost?: number | null;
    cost90Low?: number | null;
    cost_90_low?: number | null;
    cost90High?: number | null;
    cost_90_high?: number | null;
    profitRatio?: number | null;
    profit_ratio?: number | null;
    concentration90?: number | null;
    concentration_90?: number | null;
  };
  patterns?: {
    patternLabel?: string | null;
    pattern_label?: string | null;
    swingHighs?: Array<{ date?: string; price?: number | null }>;
    swing_highs?: Array<{ date?: string; price?: number | null }>;
    swingLows?: Array<{ date?: string; price?: number | null }>;
    swing_lows?: Array<{ date?: string; price?: number | null }>;
  };
}

export interface CapitalFlowSectorRow {
  name?: string;
  netInflow?: number | null;
  net_inflow?: number | null;
}

export interface CapitalFlowReport {
  source?: string;
  status?: string;
  stockCode?: string;
  stock_code?: string;
  stockFlow?: {
    mainNetInflow?: number | null;
    main_net_inflow?: number | null;
    inflow5d?: number | null;
    inflow_5d?: number | null;
    inflow10d?: number | null;
    inflow_10d?: number | null;
  };
  stock_flow?: {
    mainNetInflow?: number | null;
    main_net_inflow?: number | null;
    inflow5d?: number | null;
    inflow_5d?: number | null;
    inflow10d?: number | null;
    inflow_10d?: number | null;
  };
  sectorRankings?: {
    top?: CapitalFlowSectorRow[];
    bottom?: CapitalFlowSectorRow[];
  };
  sector_rankings?: {
    top?: CapitalFlowSectorRow[];
    bottom?: CapitalFlowSectorRow[];
  };
}

export interface BusinessModelItem {
  title?: string;
  content?: string;
}

export interface BusinessModelReport {
  summary?: string;
  items?: BusinessModelItem[];
  source?: string;
}

export interface FinancialReport {
  reportDate?: string | null;
  revenue?: number | null;
  revenueYoy?: number | null;
  netProfitParent?: number | null;
  operatingCashFlow?: number | null;
  grossMargin?: number | null;
  netMargin?: number | null;
  roe?: number | null;
  revenueGrowth?: RevenueGrowthReport;
  profitability?: ProfitabilityReport;
  incomePeriods?: IncomePeriodsReport;
  income_periods?: IncomePeriodsReport;
  balanceSheet?: BalanceSheetReport;
  balance_sheet?: BalanceSheetReport;
  cashFlow?: CashFlowReport;
  cash_flow?: CashFlowReport;
  expressReport?: ExpressReport;
  express_report?: ExpressReport;
}

/** Details section */
export interface ReportDetails {
  newsContent?: string;
  rawResult?: Record<string, unknown>;
  contextSnapshot?: Record<string, unknown>;
  financialReport?: FinancialReport;
  dividendMetrics?: Record<string, unknown>;
  companyProfile?: CompanyProfile;
  businessModel?: BusinessModelReport;
  profitabilityAnalysis?: ProfitabilityAnalysisReport;
  financialFundamentalsAnalysis?: DimensionAnalysisReport;
  financial_fundamentals_analysis?: DimensionAnalysisReport;
  technicalIndicators?: TechnicalIndicatorsReport;
  technical_indicators?: TechnicalIndicatorsReport;
  technicalAnalysisReport?: DimensionAnalysisReport;
  technical_analysis_report?: DimensionAnalysisReport;
  klineSeries?: KlineSeriesReport;
  kline_series?: KlineSeriesReport;
  priceTrendAnalysis?: DimensionAnalysisReport;
  price_trend_analysis?: DimensionAnalysisReport;
  chipDistribution?: ChipDistributionReport;
  chip_distribution?: ChipDistributionReport;
  keyLevels?: KeyLevelsReport;
  key_levels?: KeyLevelsReport;
  keyLevelsAnalysis?: DimensionAnalysisReport;
  key_levels_analysis?: DimensionAnalysisReport;
  weeklyKlineSeries?: KlineSeriesReport;
  weekly_kline_series?: KlineSeriesReport;
  weeklyTrendAnalysis?: DimensionAnalysisReport;
  weekly_trend_analysis?: DimensionAnalysisReport;
  capitalFlow?: CapitalFlowReport;
  capital_flow?: CapitalFlowReport;
  capitalFlowAnalysis?: DimensionAnalysisReport;
  capital_flow_analysis?: DimensionAnalysisReport;
  backtestResult?: BacktestResultItem;
  backtest_result?: BacktestResultItem;
  modelOpinions?: ModelOpinionsPayload;
  model_opinions?: ModelOpinionsPayload;
  belongBoards?: RelatedBoard[];
  sectorRankings?: SectorRankings;
}

/** Divergence summary across primary + consultation opinions */
export interface ModelOpinionDivergence {
  scoreMin?: number;
  scoreMax?: number;
  scoreSpread?: number;
  scoreMedian?: number;
  primaryScore?: number;
  alignment?: 'high' | 'moderate' | 'low' | 'insufficient';
  alignmentLabelZh?: string;
  alignmentLabelEn?: string;
  outlierModels?: string[];
}

/** Single model opinion in multi-model consultation panel */
export interface ModelOpinionItem {
  role: 'primary' | 'consultation';
  model: string;
  success?: boolean;
  sentimentScore?: number;
  operationAdvice?: string;
  trendPrediction?: string;
  confidence?: string;
  summary?: string;
  reasoning?: string;
  bullCase?: string;
  bearCase?: string;
  dissentNote?: string;
  error?: string;
}

export interface ModelOpinionsPayload {
  primaryModel?: string;
  reportLanguage?: ReportLanguage;
  briefKind?: string;
  divergence?: ModelOpinionDivergence;
  opinions: ModelOpinionItem[];
}

/** Full analysis report */
export interface AnalysisReport {
  meta: ReportMeta;
  summary: ReportSummary;
  strategy?: ReportStrategy;
  details?: ReportDetails;
}

// ============ Analysis Result Types ============

/** Sync analysis response */
export interface AnalysisResult {
  queryId: string;
  stockCode: string;
  stockName: string;
  report: AnalysisReport;
  createdAt: string;
}

/** Async task accepted response */
export interface TaskAccepted {
  taskId: string;
  status: 'pending' | 'processing';
  message?: string;
}

export interface BatchTaskAcceptedItem {
  taskId: string;
  stockCode: string;
  status: 'pending' | 'processing';
  message?: string;
}

export interface BatchDuplicateTaskItem {
  stockCode: string;
  existingTaskId: string;
  message: string;
}

export interface BatchTaskAcceptedResponse {
  accepted: BatchTaskAcceptedItem[];
  duplicates: BatchDuplicateTaskItem[];
  message: string;
}

export type AnalyzeAsyncResponse = TaskAccepted | BatchTaskAcceptedResponse;

export type AnalyzeResponse = AnalysisResult | AnalyzeAsyncResponse;

/** Task status */
export interface TaskStatus {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  result?: AnalysisResult;
  error?: string;
  stockName?: string;
  originalQuery?: string;
  selectionSource?: string;
}

/** Task details used by task list and SSE events */
export interface TaskInfo {
  taskId: string;
  stockCode: string;
  stockName?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  message?: string;
  reportType: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  originalQuery?: string;
  selectionSource?: string;
}

/** Task list response */
export interface TaskListResponse {
  total: number;
  pending: number;
  processing: number;
  tasks: TaskInfo[];
}

/** Duplicate task error response */
export interface DuplicateTaskError {
  error: 'duplicate_task';
  message: string;
  stockCode: string;
  existingTaskId: string;
}

// ============ History Types ============

/** History item summary */
export interface HistoryItem {
  id: number;  // Record primary key ID, always present for persisted history items
  queryId: string;  // Linked analysis query ID
  stockCode: string;
  stockName?: string;
  reportType?: string;
  sentimentScore?: number;
  operationAdvice?: string;
  createdAt: string;
}

/** History list response */
export interface HistoryListResponse {
  total: number;
  page: number;
  limit: number;
  items: HistoryItem[];
}

/** News item */
export interface NewsIntelItem {
  title: string;
  snippet: string;
  url: string;
}

/** News response */
export interface NewsIntelResponse {
  total: number;
  items: NewsIntelItem[];
}

/** History filter parameters */
export interface HistoryFilters {
  stockCode?: string;
  startDate?: string;
  endDate?: string;
}

/** History pagination parameters */
export interface HistoryPagination {
  page: number;
  limit: number;
}

// ============ Error Types ============

export interface ApiError {
  error: string;
  message: string;
  detail?: Record<string, unknown>;
}

// ============ Helper Functions ============

/** Get sentiment label by score */
export const getSentimentLabel = (score: number, language: ReportLanguage = 'zh'): SentimentLabel => {
  if (language === 'en') {
    if (score <= 20) return 'Very Bearish';
    if (score <= 40) return 'Bearish';
    if (score <= 60) return 'Neutral';
    if (score <= 80) return 'Bullish';
    return 'Very Bullish';
  }
  if (score <= 20) return '极度悲观';
  if (score <= 40) return '悲观';
  if (score <= 60) return '中性';
  if (score <= 80) return '乐观';
  return '极度乐观';
};

/** Get sentiment color by score */
export const getSentimentColor = (score: number): string => {
  if (score <= 20) return '#ef4444'; // red-500
  if (score <= 40) return '#f97316'; // orange-500
  if (score <= 60) return '#eab308'; // yellow-500
  if (score <= 80) return '#22c55e'; // green-500
  return '#10b981'; // emerald-500
};
