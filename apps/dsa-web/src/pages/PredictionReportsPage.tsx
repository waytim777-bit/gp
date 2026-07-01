import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Drawer } from '@heroui/react';
import { Card } from '@heroui/react/card';
import { ShoppingBag, ThumbsUp, X } from 'lucide-react';
import { predictionReportsApi } from '../api/predictionReports';
import { historyApi } from '../api/history';
import { getParsedApiError, type ParsedApiError } from '../api/error';
import { ApiErrorAlert, EmptyState, InlineAlert } from '../components/common';
import { ReportSummary } from '../components/report';
import { useCreditStore } from '../stores/creditStore';
import { formatDateTime } from '../utils/format';
import type { AnalysisReport } from '../types/analysis';
import type { PredictionReportListingItem } from '../types/predictionReports';
import reportEmpty from '../assets/report-empty.png';
import reportEmptyDark from '../assets/report-empty-dark.png';
import {
  filterItemsByTab,
  type PredictionReportTab,
} from '../utils/predictionReportListings';

const TAB_OPTIONS: Array<{ key: PredictionReportTab; label: string; description: string }> = [
  { key: 'purchasable', label: '可购买的', description: '本周期可购买的预测报告（同股仅展示最新一份）' },
  { key: 'expired', label: '已过期', description: '历史周期报告（已结束，不可新购）' },
  { key: 'purchased', label: '我购买的', description: '您已购买的报告' },
  { key: 'published', label: '我推荐的', description: '您推荐到市场的报告' },
];

const formatCycleAnchorLabel = (item: PredictionReportListingItem): string => {
  if (item.analyzedAt) {
    return formatDateTime(item.analyzedAt);
  }
  return item.cycleAnchorDate || '—';
};

const PredictionReportsPage: React.FC = () => {
  const { balance, refreshBalance } = useCreditStore();
  const [items, setItems] = useState<PredictionReportListingItem[]>([]);
  const [activeTab, setActiveTab] = useState<PredictionReportTab>('purchasable');
  const [purchaseCredits, setPurchaseCredits] = useState(100);
  const [loading, setLoading] = useState(true);
  const [purchasingId, setPurchasingId] = useState<number | null>(null);
  const [likingId, setLikingId] = useState<number | null>(null);
  const [error, setError] = useState<ParsedApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedReport, setSelectedReport] = useState<AnalysisReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await predictionReportsApi.list();
      setItems(response.items);
      setPurchaseCredits(response.pricing.purchaseCredits);
    } catch (err) {
      setError(getParsedApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = '预测报告 - DSA';
    void loadList();
    void refreshBalance();
  }, [loadList, refreshBalance]);

  const visibleItems = useMemo(
    () => filterItemsByTab(items, activeTab),
    [items, activeTab],
  );

  const activeTabMeta = TAB_OPTIONS.find((tab) => tab.key === activeTab) ?? TAB_OPTIONS[0];

  const closeReportDrawer = useCallback(() => {
    setSelectedReport(null);
  }, []);

  const openReport = useCallback(async (item: PredictionReportListingItem) => {
    if (!item.canViewFull || !item.buyerHistoryId) {
      return;
    }
    setLoadingReport(true);
    setError(null);
    try {
      const report = await historyApi.getDetail(item.buyerHistoryId);
      setSelectedReport(report);
    } catch (err) {
      setError(getParsedApiError(err));
    } finally {
      setLoadingReport(false);
    }
  }, []);

  const handlePurchase = useCallback(async (item: PredictionReportListingItem) => {
    setPurchasingId(item.id);
    setError(null);
    setSuccessMessage('');
    try {
      const result = await predictionReportsApi.purchase(item.id);
      setSuccessMessage(
        result.alreadyPurchased
          ? '您已购买过该报告'
          : `购买成功，已扣除 ${result.creditsPaid} 积分`,
      );
      await Promise.all([loadList(), refreshBalance()]);
      if (result.buyerHistoryId) {
        const updated = await predictionReportsApi.getDetail(item.id);
        await openReport({ ...updated, buyerHistoryId: result.buyerHistoryId });
      }
    } catch (err) {
      setError(getParsedApiError(err));
    } finally {
      setPurchasingId(null);
    }
  }, [loadList, openReport, refreshBalance]);

  const handleLike = useCallback(async (item: PredictionReportListingItem) => {
    setLikingId(item.id);
    setError(null);
    try {
      const result = await predictionReportsApi.like(item.id);
      setItems((prev) => prev.map((row) => (
        row.id === item.id
          ? { ...row, liked: result.liked, likeCount: result.likeCount }
          : row
      )));
    } catch (err) {
      setError(getParsedApiError(err));
    } finally {
      setLikingId(null);
    }
  }, []);

  const renderActionButton = (item: PredictionReportListingItem) => {
    if (item.canViewFull && item.buyerHistoryId) {
      return (
        <button
          type="button"
          aria-busy={loadingReport || undefined}
          disabled={loadingReport}
          className="flex h-12 w-full cursor-pointer items-center justify-center rounded-full border-0 bg-[#10c97b] px-5 text-base font-bold leading-none text-white transition hover:brightness-105 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void openReport(item)}
        >
          查看完整报告
        </button>
      );
    }
    if (item.canPurchase) {
      return (
        <button
          type="button"
          aria-busy={purchasingId === item.id || undefined}
          disabled={purchasingId === item.id}
          className="flex h-12 w-full cursor-pointer items-center justify-center gap-2.5 rounded-full border-0 bg-[hsl(var(--primary))] px-5 text-base font-bold leading-none text-white transition hover:brightness-105 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void handlePurchase(item)}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-cyan">
            <ShoppingBag className="h-4 w-4" />
          </span>
          {`购买（${item.purchaseCredits}积分）`}
        </button>
      );
    }
    return null;
  };

  return (
    <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {/* <h1 className="text-2xl font-bold text-foreground">预测报告</h1> */}
          <p className="mt-1 text-sm text-muted-text">
            {activeTabMeta.description}。购买价格 {purchaseCredits} 积分/份。
          </p>
        </div>
        <div className="text-sm text-secondary-text">
          当前余额：<span className="font-semibold text-foreground">{balance.toLocaleString()}</span> 积分
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TAB_OPTIONS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              activeTab === tab.key
                ? 'bg-[hsl(var(--primary))] text-white'
                : 'bg-default-100 text-secondary-text hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? <ApiErrorAlert error={error} onDismiss={() => setError(null)} /> : null}
      {successMessage ? (
        <InlineAlert variant="success" message={successMessage} />
      ) : null}

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-text">加载中...</div>
      ) : visibleItems.length === 0 ? (
        <EmptyState
          title={`暂无${activeTabMeta.label}报告`}
          description={
            activeTab === 'published'
              ? '在首页完成分析后会自动上架，您可在此查看自己上架的报告。'
              : activeTab === 'purchased'
                ? '购买他人推荐的报告后，会出现在这里。'
                : activeTab === 'expired'
                  ? '历史周期报告会保留在此，供已购用户回看。'
                  : '本周期暂无可购买的推荐报告，请稍后再来或自行分析生成新版本。'
          }
          icon={(
            <>
              <img src={reportEmpty} className="h-auto w-35 dark:hidden" alt="" />
              <img src={reportEmptyDark} className="hidden h-auto w-35 dark:block" alt="" />
            </>
          )}
          // action={activeTab === 'published' || activeTab === 'purchasable' ? (
          //   <Button variant="secondary" onClick={() => navigate('/')}>
          //     前往首页
          //   </Button>
          // ) : undefined}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,460px),1fr))] gap-5">
          {visibleItems.map((item) => {
            const actionButton = renderActionButton(item);

            return (
              <Card
                key={item.id}
                className={`flex flex-col rounded-xl border-0 bg-surface p-5 shadow-none ${
                  actionButton ? 'min-h-[228px] md:min-h-[104px]' : 'min-h-[104px]'
                } ${actionButton ? 'group' : ''}`}
              >
                <div className={`flex flex-1 flex-col ${actionButton ? 'gap-6 transition-[gap] duration-200 md:gap-0 md:group-hover:gap-6 md:group-focus-within:gap-6' : 'gap-3'}`}>
                  <div className="flex flex-col gap-3">
                    <div className="flex min-w-0 items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-2">
                        <h3 className="truncate text-xl font-bold leading-none text-foreground">{item.name}</h3>
                        <span className="rounded bg-default-100 px-2 py-1 text-xs font-medium leading-none text-foreground">
                          {item.code}
                        </span>
                      </div>
                      <span className="shrink-0 text-sm font-bold leading-none text-[hsl(var(--primary))]">
                        {item.backtestPreview?.label || '未回测'}
                      </span>
                    </div>

                    <div className="grid items-center gap-3 text-sm leading-none text-muted-text sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <div className="min-w-0 truncate">分享者:{item.sellerUsername}</div>
                      <div className="min-w-0 truncate">周期锚点:{formatCycleAnchorLabel(item)}</div>
                      <button
                        type="button"
                        aria-busy={likingId === item.id || undefined}
                        disabled={likingId === item.id}
                        className={`flex shrink-0 items-center justify-end gap-1 px-2 py-0 text-sm leading-none transition disabled:pointer-events-none disabled:opacity-60 ${
                          item.liked ? 'text-[hsl(var(--primary))]' : 'text-muted-text'
                        }`}
                        onClick={() => void handleLike(item)}
                      >
                        <ThumbsUp className={`h-5 w-5 ${item.liked ? 'fill-current' : ''}`} />
                        {`点赞(${item.likeCount})`}
                      </button>
                    </div>
                  </div>
                  {actionButton ? (
                    <div className="grid w-full transition-[grid-template-rows,opacity,transform] duration-200 md:pointer-events-none md:grid-rows-[0fr] md:translate-y-1 md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:grid-rows-[1fr] md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:grid-rows-[1fr] md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100">
                      <div className="min-h-0 overflow-hidden">
                        {actionButton}
                      </div>
                    </div>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Drawer.Root
        isOpen={Boolean(selectedReport)}
        onOpenChange={(open) => {
          if (!open) {
            closeReportDrawer();
          }
        }}
      >
        <Drawer.Backdrop variant="blur" className="z-[100]">
          <Drawer.Content placement="right">
            <Drawer.Dialog className="ml-auto flex h-full w-full max-w-5xl flex-col bg-card text-left shadow-2xl outline-none">
              <Drawer.Body className="flex-1 overflow-y-auto p-6">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-bold leading-none text-foreground">完整报告</h2>
                    {selectedReport ? (
                      <p className="mt-2 truncate text-sm text-secondary-text">
                        {selectedReport.meta.stockName || selectedReport.meta.stockCode}
                        {selectedReport.meta.stockName ? `（${selectedReport.meta.stockCode}）` : ''}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label="关闭完整报告"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card/80 text-secondary-text transition-colors hover:bg-hover hover:text-foreground"
                    onClick={closeReportDrawer}
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>

                {selectedReport ? (
                  <ReportSummary data={selectedReport} isHistory />
                ) : null}
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer.Root>
    </div>
  );
};

export default PredictionReportsPage;
