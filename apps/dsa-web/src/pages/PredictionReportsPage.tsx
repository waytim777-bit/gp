import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@heroui/react/card';
import { ShoppingBag, Share2, ThumbsUp } from 'lucide-react';
import { predictionReportsApi } from '../api/predictionReports';
import { historyApi } from '../api/history';
import { getParsedApiError, type ParsedApiError } from '../api/error';
import { ApiErrorAlert, Button, EmptyState, InlineAlert } from '../components/common';
import { ReportSummary } from '../components/report';
import { useCreditStore } from '../stores/creditStore';
import { backtestToneTextClass } from '../utils/backtestDisplay';
import { cn } from '../utils/cn';
import type { AnalysisReport } from '../types/analysis';
import type { PredictionReportListingItem } from '../types/predictionReports';

type PredictionReportTab = 'current' | 'expired' | 'purchased' | 'published';

const TAB_OPTIONS: Array<{ key: PredictionReportTab; label: string; description: string }> = [
  { key: 'current', label: '当前', description: '本周期可购买的预测报告' },
  { key: 'expired', label: '已过期', description: '历史周期报告（已结束，不可新购）' },
  { key: 'purchased', label: '我购买的', description: '您已购买的报告' },
  { key: 'published', label: '我推荐的', description: '您推荐到市场的报告' },
];

const filterItemsByTab = (
  items: PredictionReportListingItem[],
  tab: PredictionReportTab,
): PredictionReportListingItem[] => {
  switch (tab) {
    case 'current':
      return items.filter((item) => item.isCurrentCycle !== false);
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

const PredictionReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const { balance, refreshBalance } = useCreditStore();
  const [items, setItems] = useState<PredictionReportListingItem[]>([]);
  const [activeTab, setActiveTab] = useState<PredictionReportTab>('current');
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
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-cyan">
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
          <h1 className="text-2xl font-bold text-foreground">预测报告</h1>
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
                ? 'bg-[hsl(var(--primary))]/70 text-while'
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
              ? '在首页历史分析中选中报告并点击「推荐」，即可上架到本页。'
              : activeTab === 'purchased'
                ? '购买他人推荐的报告后，会出现在这里。'
                : activeTab === 'expired'
                  ? '历史周期报告会保留在此，供已购用户回看。'
                  : '本周期暂无推荐报告，请稍后再来或自行分析后推荐。'
          }
          icon={ <img src={new URL('../assets/report-empty.png',import.meta.url).href} className='w-35 h-[auto]' /> }
          action={activeTab === 'published' || activeTab === 'current' ? (
            <Button variant="secondary" onClick={() => navigate('/')}>
              前往首页
            </Button>
          ) : undefined}
        />
      ) : (
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 540px), 540px))' }}
        >
          {visibleItems.map((item) => {
            const actionButton = renderActionButton(item);
            const ownerLabel = item.isMine
              ? '我的推荐'
              : item.hasPurchaseRecord
                ? '已购买'
                : `分享者:${item.sellerUsername}`;
            const ownerLabelClass = item.isMine || item.hasPurchaseRecord
              ? 'text-success'
              : 'text-muted-text';

            return (
              <Card
                key={item.id}
                className={cn(
                  'w-full rounded-xl border-0 p-5 shadow-none',
                  actionButton ? 'h-[228px]' : 'h-[104px]',
                )}
              >
                <div className={cn('flex h-full flex-col', actionButton ? 'gap-[76px]' : 'gap-3')}>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-2">
                        <h2 className="truncate text-xl font-bold leading-none text-foreground">{item.name}</h2>
                        <span className="shrink-0 rounded bg-[#252936] px-2 py-1 text-xs font-medium leading-none text-white">
                          {item.code}
                        </span>
                      </div>
                      <span className={cn('shrink-0 text-sm font-bold leading-none', item.backtestPreview?.tone ? backtestToneTextClass(item.backtestPreview.tone) : 'text-[hsl(var(--primary))]')}>
                        {item.backtestPreview?.label || '未回测'}
                      </span>
                    </div>

                    <div className="grid items-center gap-x-4 gap-y-2 text-sm font-medium leading-none text-[#6f778e] sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <span className={cn('min-w-0 truncate', ownerLabelClass)}>{ownerLabel}</span>
                      <span className="min-w-0 truncate">
                        周期锚点:{item.cycleAnchorDate || '—'}
                        {item.isCurrentCycle === false ? '（已过期）' : ''}
                      </span>
                      <Button
                        size="xsm"
                        variant="ghost"
                        isLoading={likingId === item.id}
                        className={cn(
                          'h-6 shrink-0 rounded-none px-2 text-sm font-medium leading-none hover:bg-transparent',
                          item.liked ? 'text-[hsl(var(--primary))]' : 'text-[#6f778e]',
                        )}
                        onClick={() => void handleLike(item)}
                      >
                        <ThumbsUp className={cn('h-4 w-4', item.liked ? 'fill-current' : '')} />
                        {`点赞(${item.likeCount})`}
                      </Button>
                    </div>
                  </div>

                  {actionButton}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {selectedReport ? (
        <Card className="border border-default-200 bg-surface p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">完整报告</h2>
            <Button size="sm" variant="ghost" onClick={() => setSelectedReport(null)}>
              关闭
            </Button>
          </div>
          <ReportSummary data={selectedReport} isHistory />
        </Card>
      ) : null}
    </div>
  );
};

export default PredictionReportsPage;
