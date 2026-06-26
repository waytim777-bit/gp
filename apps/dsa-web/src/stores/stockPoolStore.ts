import { create } from 'zustand';
import { analysisApi, DuplicateTaskError } from '../api/analysis';
import { predictionReportsApi } from '../api/predictionReports';
import type { ParsedApiError } from '../api/error';
import { getParsedApiError } from '../api/error';
import { historyApi } from '../api/history';
import type { AnalysisReport, CycleReportLookup, HistoryItem, HistoryListResponse, TaskInfo } from '../types/analysis';
import type { PredictionReportListingItem, PredictionReportSearchResponse } from '../types/predictionReports';
import { useCreditStore } from './creditStore';
import { getRecentStartDate, getTodayInShanghai } from '../utils/format';
import { isObviouslyInvalidStockQuery, looksLikeStockCode, normalizeStockCodeForApi, validateStockCode } from '../utils/validation';

const PAGE_SIZE = 20;

type SelectionSource = 'manual' | 'autocomplete' | 'import' | 'image';

type FetchHistoryOptions = {
  autoSelectFirst?: boolean;
  reset?: boolean;
  silent?: boolean;
};

type SubmitAnalysisOptions = {
  stockCode?: string;
  stockName?: string;
  originalQuery?: string;
  selectionSource?: SelectionSource;
  notify?: boolean;
  analysisMode?: 'full' | 'refresh_intel';
};

let reportRequestSeq = 0;
let analyzeRequestSeq = 0;
let historyRequestSeq = 0;
const dismissedTaskIds = new Set<string>();

export interface StockPoolState {
  query: string;
  selectionSource: SelectionSource;
  notify: boolean;
  inputError?: string;
  duplicateError: string | null;
  error: ParsedApiError | null;
  isAnalyzing: boolean;
  historyItems: HistoryItem[];
  selectedHistoryIds: number[];
  isDeletingHistory: boolean;
  isLoadingHistory: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  currentPage: number;
  selectedReport: AnalysisReport | null;
  currentCycleReport: CycleReportLookup | null;
  canRefreshIntel: boolean;
  searchStockCode: string | null;
  searchStockName: string | null;
  marketListings: PredictionReportListingItem[];
  marketPurchaseCredits: number;
  purchasingListingId: number | null;
  isLoadingReport: boolean;
  activeTasks: TaskInfo[];
  markdownDrawerOpen: boolean;
  setQuery: (query: string) => void;
  clearError: () => void;
  clearInlineMessages: () => void;
  openMarkdownDrawer: () => void;
  closeMarkdownDrawer: () => void;
  loadInitialHistory: () => Promise<void>;
  refreshHistory: (silent?: boolean) => Promise<void>;
  loadMoreHistory: () => Promise<void>;
  selectHistoryItem: (recordId: number) => Promise<void>;
  selectLatestHistoryItem: () => Promise<void>;
  toggleHistorySelection: (recordId: number) => void;
  toggleSelectAllVisible: () => void;
  deleteSelectedHistory: () => Promise<void>;
  submitAnalysis: (options?: SubmitAnalysisOptions) => Promise<void>;
  refreshIntelAnalysis: (options?: Pick<SubmitAnalysisOptions, 'notify'>) => Promise<void>;
  refreshMarketListings: (stockCode?: string) => Promise<void>;
  handleAnalysisTaskCompleted: (task: TaskInfo) => Promise<void>;
  purchaseMarketListing: (item: PredictionReportListingItem) => Promise<void>;
  openMarketListingReport: (item: PredictionReportListingItem) => Promise<void>;
  clearMarketSearch: () => void;
  setNotify: (notify: boolean) => void;
  syncTaskCreated: (task: TaskInfo) => void;
  syncTaskUpdated: (task: TaskInfo) => void;
  syncTaskFailed: (task: TaskInfo) => void;
  removeTask: (taskId: string) => void;
  resetDashboardState: () => void;
}

const initialState = {
  query: '',
  selectionSource: 'manual' as SelectionSource,
  notify: false,
  inputError: undefined,
  duplicateError: null,
  error: null,
  isAnalyzing: false,
  historyItems: [] as HistoryItem[],
  selectedHistoryIds: [] as number[],
  isDeletingHistory: false,
  isLoadingHistory: false,
  isLoadingMore: false,
  hasMore: true,
  currentPage: 1,
  selectedReport: null as AnalysisReport | null,
  currentCycleReport: null as CycleReportLookup | null,
  canRefreshIntel: false,
  searchStockCode: null as string | null,
  searchStockName: null as string | null,
  marketListings: [] as PredictionReportListingItem[],
  marketPurchaseCredits: 100,
  purchasingListingId: null as number | null,
  isLoadingReport: false,
  activeTasks: [] as TaskInfo[],
  markdownDrawerOpen: false,
};

function buildHistoryParams(page: number) {
  return {
    startDate: getRecentStartDate(30),
    endDate: getTodayInShanghai(),
    page,
    limit: PAGE_SIZE,
  };
}

function buildMarketSearchState(
  searchResult: PredictionReportSearchResponse,
  fallbackStockName?: string | null,
): Pick<
  StockPoolState,
  'searchStockCode' | 'searchStockName' | 'marketListings' | 'marketPurchaseCredits' | 'currentCycleReport' | 'canRefreshIntel'
> {
  const cycleLookup: CycleReportLookup = {
    exists: searchResult.cycleReport.exists,
    stockCode: searchResult.stockCode,
    stockName: searchResult.stockName || fallbackStockName || undefined,
    reportType: 'detailed',
    historyId: searchResult.cycleReport.historyId,
    sharedRunId: searchResult.cycleReport.sharedRunId,
    version: searchResult.cycleReport.version,
    lastAnalyzedAt: searchResult.cycleReport.lastAnalyzedAt,
    predictionCycle: searchResult.predictionCycle,
  };

  return {
    searchStockCode: searchResult.stockCode,
    searchStockName: searchResult.stockName || fallbackStockName || searchResult.stockCode,
    marketListings: searchResult.items,
    marketPurchaseCredits: searchResult.pricing.purchaseCredits,
    currentCycleReport: cycleLookup,
    canRefreshIntel: searchResult.canRefreshIntel,
  };
}

async function fetchHistory(
  get: () => StockPoolState,
  set: (partial: Partial<StockPoolState>) => void,
  options: FetchHistoryOptions = {},
): Promise<HistoryListResponse | null> {
  const { autoSelectFirst = false, reset = true, silent = false } = options;
  const currentState = get();
  const page = reset ? 1 : currentState.currentPage + 1;
  const requestId = ++historyRequestSeq;

  if (!silent) {
    set(
      reset
        ? { isLoadingHistory: true, isLoadingMore: false, currentPage: 1 }
        : { isLoadingMore: true },
    );
  }

  try {
    const response = await historyApi.getList(buildHistoryParams(page));
    if (requestId !== historyRequestSeq) {
      return null;
    }

    if (silent && reset) {
      const existingIds = new Set(get().historyItems.map((item) => item.id));
      const newItems = response.items.filter((item) => !existingIds.has(item.id));
      if (newItems.length > 0) {
        set({ historyItems: [...newItems, ...get().historyItems] });
      }
    } else if (reset) {
      set({
        historyItems: response.items,
        currentPage: 1,
      });
    } else {
      set({
        historyItems: [...get().historyItems, ...response.items],
        currentPage: page,
      });
    }

    if (!silent) {
      const totalLoaded = reset ? response.items.length : get().historyItems.length;
      set({ hasMore: totalLoaded < response.total });
    }

    const visibleIds = new Set(get().historyItems.map((item) => item.id));
    set({
      selectedHistoryIds: get().selectedHistoryIds.filter((id) => visibleIds.has(id)),
    });

    if (autoSelectFirst && response.items.length > 0 && !get().selectedReport) {
      await get().selectHistoryItem(response.items[0].id);
    }

    return response;
  } catch (error) {
    if (requestId !== historyRequestSeq) {
      return null;
    }
    set({ error: getParsedApiError(error) });
    return null;
  } finally {
    if (requestId === historyRequestSeq) {
      set({
        isLoadingHistory: false,
        isLoadingMore: false,
      });
    }
  }
}

export const useStockPoolStore = create<StockPoolState>((set, get) => ({
  ...initialState,

  setQuery: (query) => {
    set({
      query,
      selectionSource: 'manual',
      inputError: undefined,
      duplicateError: null,
    });
  },

  clearError: () => set({ error: null }),

  clearInlineMessages: () => set({ inputError: undefined, duplicateError: null }),

  setNotify: (notify) => set({ notify }),

  openMarkdownDrawer: () => set({ markdownDrawerOpen: true }),

  closeMarkdownDrawer: () => set({ markdownDrawerOpen: false }),

  loadInitialHistory: async () => {
    await fetchHistory(get, set, { autoSelectFirst: true, reset: true });
  },

  refreshHistory: async (silent = false) => {
    await fetchHistory(get, set, { reset: true, silent });
  },

  loadMoreHistory: async () => {
    const state = get();
    if (state.isLoadingMore || !state.hasMore) {
      return;
    }
    await fetchHistory(get, set, { reset: false });
  },

  selectHistoryItem: async (recordId) => {
    const requestId = ++reportRequestSeq;
    const shouldShowInitialLoading = !get().selectedReport;

    if (shouldShowInitialLoading) {
      set({ isLoadingReport: true });
    }

    try {
      const report = await historyApi.getDetail(recordId);
      if (requestId !== reportRequestSeq) {
        return;
      }

      set({
        selectedReport: report,
        error: null,
        isLoadingReport: false,
      });

      try {
        const cycleLookup = await analysisApi.lookupCycleReport({
          stockCode: report.meta.stockCode,
          reportType: report.meta.reportType,
        });
        if (requestId !== reportRequestSeq) {
          return;
        }
        set({ currentCycleReport: cycleLookup });
      } catch {
        if (requestId !== reportRequestSeq) {
          return;
        }
        set({ currentCycleReport: null });
      }
    } catch (error) {
      if (requestId !== reportRequestSeq) {
        return;
      }

      set({
        error: getParsedApiError(error),
        isLoadingReport: false,
      });
    }
  },

  selectLatestHistoryItem: async () => {
    const latestItem = get().historyItems[0];
    if (!latestItem) {
      return;
    }
    await get().selectHistoryItem(latestItem.id);
  },

  toggleHistorySelection: (recordId) => {
    const selected = new Set(get().selectedHistoryIds);
    if (selected.has(recordId)) {
      selected.delete(recordId);
    } else {
      selected.add(recordId);
    }

    set({ selectedHistoryIds: Array.from(selected) });
  },

  toggleSelectAllVisible: () => {
    const visibleIds = get().historyItems.map((item) => item.id);
    const selectedIds = get().selectedHistoryIds;
    const visibleSet = new Set(visibleIds);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

    set({
      selectedHistoryIds: allSelected
        ? selectedIds.filter((id) => !visibleSet.has(id))
        : Array.from(new Set([...selectedIds, ...visibleIds])),
    });
  },

  deleteSelectedHistory: async () => {
    const state = get();
    const selectedReportId = state.selectedReport?.meta.id;
    const recordIds = Array.from(new Set(
      state.selectedHistoryIds.length > 0
        ? state.selectedHistoryIds
        : selectedReportId !== undefined
          ? [selectedReportId]
          : [],
    ));
    if (recordIds.length === 0 || state.isDeletingHistory) {
      return;
    }

    set({ isDeletingHistory: true });
    try {
      await historyApi.deleteRecords(recordIds);

      const deletedIds = new Set(recordIds);
      const selectedWasDeleted = state.selectedReport?.meta.id !== undefined
        && deletedIds.has(state.selectedReport.meta.id);

      set({ selectedHistoryIds: [] });

      const freshPage = await fetchHistory(get, set, { reset: true });

      if (selectedWasDeleted) {
        const nextItem = freshPage?.items?.[0];
        if (nextItem) {
          await get().selectHistoryItem(nextItem.id);
        } else {
          set({ selectedReport: null });
        }
      }
    } catch (error) {
      set({ error: getParsedApiError(error) });
    } finally {
      set({ isDeletingHistory: false });
    }
  },

  submitAnalysis: async (options) => {
    const state = get();
    const rawStockCode = options?.stockCode ?? state.query;
    const stockCodeInput = rawStockCode.trim();
    const stockName = options?.stockName;
    const selectionSource = options?.selectionSource ?? state.selectionSource;
    const originalQuery = (options?.originalQuery ?? state.query).trim();
    const notify = options?.notify ?? state.notify;
    const analysisMode = options?.analysisMode ?? 'full';

    if (!stockCodeInput) {
      set({ inputError: '请输入股票代码', duplicateError: null });
      return;
    }

    if (selectionSource !== 'autocomplete' && isObviouslyInvalidStockQuery(stockCodeInput)) {
      set({ inputError: '请输入有效的股票代码或股票名称', duplicateError: null });
      return;
    }

    let normalizedStockCode = stockCodeInput;
    if (selectionSource === 'autocomplete' || looksLikeStockCode(stockCodeInput)) {
      const { valid, message, normalized } = validateStockCode(stockCodeInput);
      if (!valid) {
        set({ inputError: message, duplicateError: null });
        return;
      }
      normalizedStockCode = normalized;
    } else {
      normalizedStockCode = normalizeStockCodeForApi(stockCodeInput);
    }

    set({
      inputError: undefined,
      duplicateError: null,
      error: null,
      isAnalyzing: true,
    });

    const requestId = ++analyzeRequestSeq;
    try {
      if (analysisMode === 'full') {
        const searchResult = await predictionReportsApi.searchByCode({
          stockCode: normalizedStockCode,
          reportType: 'detailed',
        });

        if (requestId !== analyzeRequestSeq) {
          return;
        }

        set({
          ...buildMarketSearchState(searchResult, stockName || normalizedStockCode),
          selectedReport: null,
          query: '',
          selectionSource: 'manual',
        });

        if (searchResult.items.length > 0) {
          return;
        }

        const cycleReport = get().currentCycleReport;
        if (cycleReport?.exists && cycleReport.historyId != null) {
          await get().selectHistoryItem(cycleReport.historyId);
          return;
        }
      }

      await analysisApi.analyzeAsync({
        stockCode: normalizedStockCode,
        reportType: 'detailed',
        stockName,
        originalQuery: originalQuery || stockCodeInput,
        selectionSource,
        notify,
        analysisMode,
      });

      if (requestId !== analyzeRequestSeq) {
        return;
      }

      set({
        query: '',
        selectionSource: 'manual',
      });
    } catch (error) {
      if (requestId !== analyzeRequestSeq) {
        return;
      }

      if (error instanceof DuplicateTaskError) {
        set({
          duplicateError: `股票 ${error.stockCode} 正在分析中，请等待完成`,
        });
        return;
      }

      set({ error: getParsedApiError(error) });
    } finally {
      if (requestId === analyzeRequestSeq) {
        set({ isAnalyzing: false });
      }
    }
  },

  refreshIntelAnalysis: async (options) => {
    const state = get();
    const stockCode = state.selectedReport?.meta.stockCode ?? state.searchStockCode;
    if (!stockCode || state.isAnalyzing || !state.canRefreshIntel) {
      return;
    }

    set({
      duplicateError: null,
      error: null,
      isAnalyzing: true,
    });

    const requestId = ++analyzeRequestSeq;
    try {
      await analysisApi.analyzeAsync({
        stockCode,
        reportType: state.selectedReport?.meta.reportType || 'detailed',
        stockName: state.selectedReport?.meta.stockName ?? state.searchStockName ?? undefined,
        analysisMode: 'refresh_intel',
        notify: options?.notify ?? state.notify,
        selectionSource: 'manual',
      });
    } catch (error) {
      if (requestId !== analyzeRequestSeq) {
        return;
      }

      if (error instanceof DuplicateTaskError) {
        set({
          duplicateError: `股票 ${error.stockCode} 正在分析中，请等待完成`,
        });
        return;
      }

      set({ error: getParsedApiError(error) });
    } finally {
      if (requestId === analyzeRequestSeq) {
        set({ isAnalyzing: false });
      }
    }
  },

  refreshMarketListings: async (stockCode) => {
    const code = stockCode ?? get().searchStockCode;
    if (!code) {
      return;
    }

    try {
      const searchResult = await predictionReportsApi.searchByCode({
        stockCode: code,
        reportType: 'detailed',
      });
      set(buildMarketSearchState(searchResult, get().searchStockName));
    } catch (error) {
      set({ error: getParsedApiError(error) });
    }
  },

  handleAnalysisTaskCompleted: async (task) => {
    await get().refreshHistory(true);

    const matchingItem = get().historyItems.find((item) => item.stockCode === task.stockCode);
    if (matchingItem) {
      await get().selectHistoryItem(matchingItem.id);
    } else {
      await get().selectLatestHistoryItem();
    }

    // Auto-recommend latest analysis result to marketplace (idempotent on backend).
    const recordId = get().selectedReport?.meta.id;
    if (recordId != null) {
      try {
        await predictionReportsApi.recommend(recordId);
      } catch {
        // Best effort: non-canonical/purchased reports are rejected; ignore.
      }
    }

    const activeSearchCode = get().searchStockCode;
    if (!activeSearchCode || activeSearchCode === task.stockCode) {
      await get().refreshMarketListings(task.stockCode);
    }
  },

  purchaseMarketListing: async (item) => {
    set({ purchasingListingId: item.id, error: null });
    try {
      const result = await predictionReportsApi.purchase(item.id);
      const searchResult = await predictionReportsApi.searchByCode({
        stockCode: item.code,
        reportType: item.reportType,
      });
      set(buildMarketSearchState(searchResult, get().searchStockName));
      await useCreditStore.getState().refreshBalance();
      const buyerHistoryId = result.buyerHistoryId ?? item.buyerHistoryId;
      if (buyerHistoryId != null) {
        await get().selectHistoryItem(buyerHistoryId);
      }
    } catch (error) {
      set({ error: getParsedApiError(error) });
    } finally {
      set({ purchasingListingId: null });
    }
  },

  openMarketListingReport: async (item) => {
    if (!item.canViewFull || item.buyerHistoryId == null) {
      return;
    }
    await get().selectHistoryItem(item.buyerHistoryId);
  },

  clearMarketSearch: () => {
    set({
      searchStockCode: null,
      searchStockName: null,
      marketListings: [],
      canRefreshIntel: false,
      purchasingListingId: null,
    });
  },

  syncTaskCreated: (task) => {
    if (dismissedTaskIds.has(task.taskId)) {
      return;
    }
    if (get().activeTasks.some((item) => item.taskId === task.taskId)) {
      return;
    }
    set({ activeTasks: [...get().activeTasks, task] });
  },

  syncTaskUpdated: (task) => {
    if (dismissedTaskIds.has(task.taskId)) {
      return;
    }
    const nextTasks = [...get().activeTasks];
    const index = nextTasks.findIndex((item) => item.taskId === task.taskId);
    if (index >= 0) {
      nextTasks[index] = task;
      set({ activeTasks: nextTasks });
    }
  },

  syncTaskFailed: (task) => {
    get().syncTaskUpdated(task);
    set({ error: getParsedApiError(task.error || '分析失败') });
  },

  removeTask: (taskId) => {
    dismissedTaskIds.add(taskId);
    set({ activeTasks: get().activeTasks.filter((task) => task.taskId !== taskId) });
  },

  resetDashboardState: () => {
    historyRequestSeq += 1;
    reportRequestSeq = 0;
    analyzeRequestSeq = 0;
    dismissedTaskIds.clear();
    set({ ...initialState });
  },
}));
