import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@heroui/react';
import { ApiErrorAlert, ConfirmDialog, Button, EmptyState, InlineAlert } from '../components/common';
import { DashboardStateBlock, HomeMarketListingsPanel } from '../components/dashboard';
import { StockAutocomplete } from '../components/StockAutocomplete';
import { HistoryList } from '../components/history';
import { ReportMarkdown, ReportSummary } from '../components/report';
import { TaskPanel } from '../components/tasks';
import { subscriptionsApi } from '../api/subscriptions';
import { useDashboardLifecycle, useHomeDashboardState } from '../hooks';
import { getReportText, normalizeReportLanguage } from '../utils/reportLanguage';
import { hasSubscriptionPushDestination } from '../utils/subscriptionPush';

/** 推送通知引导对话框是否已展示过的 localStorage 标记 */
const NOTIFY_GUIDE_DISMISSED_KEY = 'dsa_notify_guide_dismissed';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showNotifyGuide, setShowNotifyGuide] = useState(false);
  const [hasPushDestination, setHasPushDestination] = useState(false);

  const {
    query,
    inputError,
    duplicateError,
    error,
    isAnalyzing,
    historyItems,
    selectedHistoryIds,
    isDeletingHistory,
    isLoadingHistory,
    isLoadingMore,
    hasMore,
    selectedReport,
    isLoadingReport,
    activeTasks,
    markdownDrawerOpen,
    setQuery,
    clearError,
    loadInitialHistory,
    refreshHistory,
    loadMoreHistory,
    selectHistoryItem,
    handleAnalysisTaskCompleted,
    toggleHistorySelection,
    toggleSelectAllVisible,
    deleteSelectedHistory,
    submitAnalysis,
    refreshIntelAnalysis,
    purchaseMarketListing,
    openMarketListingReport,
    notify,
    setNotify,
    syncTaskCreated,
    syncTaskUpdated,
    syncTaskFailed,
    removeTask,
    openMarkdownDrawer,
    closeMarkdownDrawer,
    canRefreshIntel,
    searchStockCode,
    searchStockName,
    marketListings,
    marketPurchaseCredits,
    purchasingListingId,
  } = useHomeDashboardState();

  useEffect(() => {
    document.title = '每日选股分析 - DSA';
  }, []);

  useEffect(() => {
    let cancelled = false;
    void subscriptionsApi.getProfile()
      .then((profile) => {
        if (!cancelled) {
          setHasPushDestination(hasSubscriptionPushDestination(profile));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasPushDestination(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasPushDestination && notify) {
      setNotify(false);
    }
  }, [hasPushDestination, notify, setNotify]);
  const reportLanguage = normalizeReportLanguage(selectedReport?.meta.reportLanguage);
  const reportText = getReportText(reportLanguage);
  const selectedHistoryIdSet = useMemo(() => new Set(selectedHistoryIds), [selectedHistoryIds]);

  useDashboardLifecycle({
    loadInitialHistory,
    refreshHistory,
    handleAnalysisTaskCompleted,
    syncTaskCreated,
    syncTaskUpdated,
    syncTaskFailed,
    removeTask,
  });

  const handleHistoryItemClick = useCallback((recordId: number) => {
    void selectHistoryItem(recordId);
    setSidebarOpen(false);
  }, [selectHistoryItem]);

  const handleSubmitAnalysis = useCallback(
    (
      stockCode?: string,
      stockName?: string,
      selectionSource?: 'manual' | 'autocomplete' | 'import' | 'image',
    ) => {
      void submitAnalysis({
        stockCode,
        stockName,
        originalQuery: query,
        selectionSource: selectionSource ?? 'manual',
      });
    },
    [query, submitAnalysis],
  );

  const canShowRefreshIntel = canRefreshIntel && (
    marketListings.length === 0 || Boolean(searchStockCode)
  );

  const handleRefreshIntel = useCallback(() => {
    void refreshIntelAnalysis();
  }, [refreshIntelAnalysis]);

  const handlePurchaseListing = useCallback((item: Parameters<typeof purchaseMarketListing>[0]) => {
    void purchaseMarketListing(item);
  }, [purchaseMarketListing]);

  const handleViewListing = useCallback((item: Parameters<typeof openMarketListingReport>[0]) => {
    void openMarketListingReport(item);
  }, [openMarketListingReport]);

  const handleAskFollowUp = useCallback(() => {
    if (selectedReport?.meta.id === undefined) {
      return;
    }

    const code = selectedReport.meta.stockCode;
    const name = selectedReport.meta.stockName;
    const rid = selectedReport.meta.id;
    navigate(`/chat?stock=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}&recordId=${rid}`);
  }, [navigate, selectedReport]);

  const handleDeleteSelectedHistory = useCallback(() => {
    void deleteSelectedHistory();
    setShowDeleteConfirm(false);
  }, [deleteSelectedHistory]);

  const handleDismissNotifyGuide = useCallback(() => {
    localStorage.setItem(NOTIFY_GUIDE_DISMISSED_KEY, '1');
    setShowNotifyGuide(false);
  }, []);

  const handleGoToNotifySettings = useCallback(() => {
    localStorage.setItem(NOTIFY_GUIDE_DISMISSED_KEY, '1');
    setShowNotifyGuide(false);
    navigate('/subscriptions');
  }, [navigate]);

  const handleNotifyCheckboxChange = useCallback((checked: boolean) => {
    if (!hasPushDestination) {
      setShowNotifyGuide(true);
      return;
    }
    setNotify(checked);
  }, [hasPushDestination, setNotify]);

  const handleNotifyLabelClick = useCallback((event: React.MouseEvent<HTMLLabelElement>) => {
    if (hasPushDestination || isAnalyzing) {
      return;
    }
    event.preventDefault();
    setShowNotifyGuide(true);
  }, [hasPushDestination, isAnalyzing]);

  const sidebarContent = useMemo(
    () => (
      <div className="flex min-h-0 h-full flex-col gap-3 overflow-hidden">
        <TaskPanel tasks={activeTasks} />
        <HistoryList
          items={historyItems}
          isLoading={isLoadingHistory}
          isLoadingMore={isLoadingMore}
          hasMore={hasMore}
          selectedId={selectedReport?.meta.id}
          selectedIds={selectedHistoryIdSet}
          isDeleting={isDeletingHistory}
          onItemClick={handleHistoryItemClick}
          onLoadMore={() => void loadMoreHistory()}
          onToggleItemSelection={toggleHistorySelection}
          onToggleSelectAll={toggleSelectAllVisible}
          onDeleteSelected={() => setShowDeleteConfirm(true)}
          className="flex-1 overflow-hidden"
        />
      </div>
    ),
    [
      activeTasks,
      hasMore,
      historyItems,
      isDeletingHistory,
      isLoadingHistory,
      isLoadingMore,
      handleHistoryItemClick,
      loadMoreHistory,
      selectedHistoryIdSet,
      selectedReport?.meta.id,
      toggleHistorySelection,
      toggleSelectAllVisible,
    ],
  );

  return (
    <div
      data-testid="home-dashboard"
      className="flex h-[calc(100vh-5rem)] w-full flex-col overflow-hidden md:flex-row sm:h-[calc(100vh-5.5rem)] lg:h-[calc(100vh-2rem)] h-full!"
    >
      <div className="flex-1 flex flex-col min-h-0 min-w-0 max-w-full w-full overflow-hidden">
        <header className="flex min-w-0 flex-shrink-0 items-center overflow-hidden px-3 py-3 pt-0! md:px-[20px] md:py-[16px]">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5 md:flex-nowrap">
            <button
              onClick={() => setSidebarOpen(true)}
              className="order-1 md:hidden -ml-1 flex-shrink-0 rounded-lg p-1.5 text-secondary-text transition-colors hover:bg-hover hover:text-foreground"
              aria-label="历史记录"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="order-2 min-w-0 flex-1">
              <StockAutocomplete
                value={query}
                onChange={setQuery}
                onSubmit={(stockCode, stockName, selectionSource) => {
                  handleSubmitAnalysis(stockCode, stockName, selectionSource);
                }}
                placeholder="输入股票代码或名称，如600519、贵州茅台、AAPL"
                disabled={isAnalyzing}
                appearance="home"
                actionLabel="AI数据分析"
                submittingLabel="分析中"
                isSubmitting={isAnalyzing}
                metaLabel={`${marketPurchaseCredits} /份`}
              />
            </div>
            <label
              className={`order-3 flex h-10 flex-shrink-0 items-center gap-1.5 rounded-xl border border-subtle bg-surface/60 px-3 text-xs text-secondary-text select-none transition-colors ${
                hasPushDestination && !isAnalyzing
                  ? 'cursor-pointer hover:border-subtle-hover hover:text-foreground'
                  : 'cursor-not-allowed opacity-60'
              }`}
              onClick={handleNotifyLabelClick}
            >
              <input
                type="checkbox"
                checked={notify}
                disabled={!hasPushDestination || isAnalyzing}
                onChange={(e) => handleNotifyCheckboxChange(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-primary disabled:cursor-not-allowed"
              />
              推送通知
            </label>
          </div>
        </header>

        {inputError || duplicateError ? (
          <div className="px-3 pb-2 md:px-4">
            {inputError ? (
              <InlineAlert
                variant="danger"
                title="输入有误"
                message={inputError}
                className="rounded-xl px-3 py-2 text-xs shadow-none"
              />
            ) : null}
            {!inputError && duplicateError ? (
              <InlineAlert
                variant="warning"
                title="任务已存在"
                message={duplicateError}
                className="rounded-xl px-3 py-2 text-xs shadow-none"
              />
            ) : null}
          </div>
        ) : null}

        {searchStockCode && marketListings.length > 0 ? (
          <div className="px-3 pb-3 md:px-6">
            <HomeMarketListingsPanel
              stockCode={searchStockCode}
              stockName={searchStockName ?? undefined}
              items={marketListings}
              purchaseCredits={marketPurchaseCredits}
              purchasingListingId={purchasingListingId}
              isLoadingReport={isLoadingReport}
              canRefreshIntel={canShowRefreshIntel}
              isAnalyzing={isAnalyzing}
              onPurchase={handlePurchaseListing}
              onView={handleViewListing}
              onRefreshIntel={handleRefreshIntel}
            />
          </div>
        ) : null}

        <div className="flex-1 flex min-h-0 overflow-hidden">
          <div className="hidden min-h-0 w-64 shrink-0 flex-col overflow-hidden pl-4 pb-4 md:flex lg:w-72">
            {sidebarContent}
          </div>

          {sidebarOpen ? (
            <div className="fixed inset-0 z-40 md:hidden" onClick={() => setSidebarOpen(false)}>
              <div className="page-drawer-overlay absolute inset-0" />
              <div
                className="dashboard-card absolute bottom-0 left-0 top-0 flex w-72 flex-col overflow-hidden !rounded-none !rounded-r-xl p-3 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                {sidebarContent}
              </div>
            </div>
          ) : null}

          <section className="flex-1 min-w-0 min-h-0 overflow-x-auto overflow-y-auto px-3 pb-4 md:px-6 touch-pan-y">
            {error ? (
              <ApiErrorAlert
                error={error}
                className="mb-3"
                onDismiss={clearError}
              />
            ) : null}
            {isLoadingReport ? (
              <div className="flex h-full flex-col items-center justify-center">
                <DashboardStateBlock title="加载报告中..." loading />
              </div>
            ) : selectedReport ? (
              <div className={`space-y-4 pb-8${searchStockCode && marketListings.length > 0 ? ' mt-6' : ''}`}>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {canShowRefreshIntel && marketListings.length === 0 ? (
                    <Button
                      variant="home-action-ai"
                      size="sm"
                      disabled={isAnalyzing}
                      onClick={handleRefreshIntel}
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      再次分析
                    </Button>
                  ) : null}
                  <Button
                    variant="home-action-ai"
                    size="sm"
                    disabled={selectedReport.meta.id === undefined}
                    onClick={handleAskFollowUp}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    追问 AI
                  </Button>
                  <Button
                    variant="home-action-ai"
                    size="sm"
                    disabled={selectedReport.meta.id === undefined}
                    onClick={openMarkdownDrawer}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {reportText.fullReport}
                  </Button>
                </div>
                <ReportSummary data={selectedReport} isHistory />
              </div>
            ) : searchStockCode && marketListings.length > 0 ? null : (
              <div className="flex h-full items-center justify-center">
                <EmptyState
                  title="开始分析"
                  description="输入股票代码搜索本周期预测报告；首次分析将自动启动全量任务。"
                  className="max-w-xl border-dashed"
                  icon={(
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  )}
                />
              </div>
            )}
          </section>
        </div>
      </div>

      {markdownDrawerOpen && selectedReport?.meta.id ? (
        <ReportMarkdown
          recordId={selectedReport.meta.id}
          stockName={selectedReport.meta.stockName || ''}
          stockCode={selectedReport.meta.stockCode}
          reportLanguage={reportLanguage}
          details={selectedReport.details}
          onClose={closeMarkdownDrawer}
        />
      ) : null}

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="删除历史记录"
        message={
          selectedHistoryIds.length === 1
            ? '确认删除这条历史记录吗？删除后将不可恢复。'
            : `确认删除选中的 ${selectedHistoryIds.length} 条历史记录吗？删除后将不可恢复。`
        }
        confirmText={isDeletingHistory ? '删除中...' : '确认删除'}
        cancelText="取消"
        isDanger={true}
        onConfirm={handleDeleteSelectedHistory}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <Modal.Root isOpen={showNotifyGuide} onOpenChange={(open) => { if (!open) handleDismissNotifyGuide(); }}>
        <Modal.Backdrop variant="blur">
          <Modal.Container size="sm" placement="center">
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>开启推送通知</Modal.Heading>
                <Modal.CloseTrigger />
              </Modal.Header>
              <Modal.Body>
                <div className="space-y-3 text-sm leading-6 text-secondary-text">
                  <p>
                    推送通知需要先在「我的订阅」中配置接收邮箱或 Webhook，否则无法发送推送。
                  </p>
                  <p>
                    请前往{' '}
                    <span className="font-semibold text-primary">我的订阅 → 推送方式</span>
                    {' '}完成配置后再开启推送。
                  </p>
                </div>
              </Modal.Body>
              <Modal.Footer className="flex justify-end gap-2">
                <Button
                  variant="settings-secondary"
                  size="sm"
                  onClick={handleDismissNotifyGuide}
                >
                  知道了
                </Button>
                <Button
                  variant="settings-primary"
                  size="sm"
                  onClick={handleGoToNotifySettings}
                >
                  去我的订阅
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </div>
  );
};

export default HomePage;
