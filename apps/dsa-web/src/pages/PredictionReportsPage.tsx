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
import { backtestToneBorderClass, backtestToneTextClass } from '../utils/backtestDisplay';
import { formatDateTime } from '../utils/format';
import type { AnalysisReport } from '../types/analysis';
import type { PredictionReportListingItem } from '../types/predictionReports';
import {
  filterItemsByTab,
  formatCycleVersionLabel,
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
  const navigate = useNavigate();
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
    if (item.canViewFull) {
      return (
        <Button
          size="sm"
          variant="secondary"
          isLoading={loadingReport}
          onClick={() => void openReport(item)}
        >
          查看完整报告
        </Button>
      );
    }
    if (item.isMine) {
      return (
        <Button size="sm" variant="secondary" disabled>
          自己的报告
        </Button>
      );
    }
    if (item.canPurchase) {
      return (
        <Button
          size="sm"
          variant="primary"
          isLoading={purchasingId === item.id}
          onClick={() => void handlePurchase(item)}
        >
          <ShoppingBag className="mr-1 h-4 w-4" />
          {`购买（${item.purchaseCredits} 积分）`}
        </Button>
      );
    }
    return (
      <Button size="sm" variant="secondary" disabled>
        周期已结束
      </Button>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6">
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
            className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
              activeTab === tab.key
                ? 'bg-cyan/15 text-cyan ring-1 ring-cyan/30'
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
          icon={<Share2 className="h-6 w-6" />}
          action={activeTab === 'published' || activeTab === 'purchasable' ? (
            <Button variant="secondary" onClick={() => navigate('/')}>
              前往首页
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visibleItems.map((item) => (
            <Card key={item.id} className="border border-default-200 bg-surface/80 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-foreground">{item.name}</div>
                  <div className="mt-1 text-xs text-muted-text font-mono">{item.code}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {formatCycleVersionLabel(item.cycleVersion)}
                  </span>
                  {item.isMine ? (
                    <span className="rounded-full bg-cyan/10 px-2 py-0.5 text-xs text-cyan">我的推荐</span>
                  ) : null}
                  {item.hasPurchaseRecord ? (
                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">已购买</span>
                  ) : null}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      item.isCurrentCycle !== false
                        ? 'bg-primary/10 text-primary'
                        : 'bg-default-100 text-default-500'
                    }`}
                  >
                    {item.isCurrentCycle !== false ? '本周期' : '已过期'}
                  </span>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-sm text-secondary-text">
                <div>推荐者：{item.sellerUsername}</div>
                <div>周期锚点：{formatCycleAnchorLabel(item)}</div>
                <div>购买次数：{item.purchaseCount ?? 0}</div>
                {!item.canViewFull && item.preview.analysisSummary ? (
                  <p className="line-clamp-3 text-default-600">{item.preview.analysisSummary}</p>
                ) : null}
              </div>

              <div
                className={`mt-3 rounded-md border px-2.5 py-1.5 text-xs ${backtestToneBorderClass(item.backtestPreview?.tone)}`}
              >
                <span className="text-default-500">回测：</span>
                <span className={`font-medium ${backtestToneTextClass(item.backtestPreview?.tone)}`}>
                  {item.backtestPreview?.label || '未回测'}
                </span>
              </div>

              <div className="mt-4 flex items-end justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {renderActionButton(item)}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  isLoading={likingId === item.id}
                  className={item.liked ? 'text-danger' : 'text-muted-text'}
                  onClick={() => void handleLike(item)}
                >
                  <ThumbsUp className={`mr-1 h-4 w-4 ${item.liked ? 'fill-current' : ''}`} />
                  点赞{item.likeCount > 0 ? ` ${item.likeCount}` : ''}
                </Button>
              </div>
            </Card>
          ))}
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
