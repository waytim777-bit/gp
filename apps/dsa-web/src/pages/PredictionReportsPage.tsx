import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@heroui/react/card';
import { ShoppingBag, Share2, ThumbsUp } from 'lucide-react';
import { predictionReportsApi } from '../api/predictionReports';
import { historyApi } from '../api/history';
import { getParsedApiError, type ParsedApiError } from '../api/error';
import { ApiErrorAlert, Button, EmptyState, InlineAlert } from '../components/common';
import { ReportSummary } from '../components/report';
import { useCreditStore } from '../stores/creditStore';
import type { AnalysisReport } from '../types/analysis';
import type { PredictionReportListingItem } from '../types/predictionReports';

const PredictionReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const { balance, refreshBalance } = useCreditStore();
  const [items, setItems] = useState<PredictionReportListingItem[]>([]);
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">预测报告</h1>
          <p className="mt-1 text-sm text-muted-text">
            展示所有已分享的报告。购买价格 {purchaseCredits} 积分/份。
          </p>
        </div>
        <div className="text-sm text-secondary-text">
          当前余额：<span className="font-semibold text-foreground">{balance.toLocaleString()}</span> 积分
        </div>
      </div>

      {error ? <ApiErrorAlert error={error} onDismiss={() => setError(null)} /> : null}
      {successMessage ? (
        <InlineAlert variant="success" message={successMessage} />
      ) : null}

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-text">加载中...</div>
      ) : items.length === 0 ? (
        <EmptyState
          title="暂无预测报告"
          description="在首页历史分析中选中报告并点击「分享」，即可上架到本页。"
          icon={<Share2 className="h-6 w-6" />}
          action={(
            <Button variant="secondary" onClick={() => navigate('/')}>
              前往首页分享
            </Button>
          )}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <Card key={item.id} className="border border-default-200 bg-surface/80 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-foreground">{item.name}</div>
                  <div className="mt-1 text-xs text-muted-text font-mono">{item.code}</div>
                </div>
                {item.isMine ? (
                  <span className="rounded-full bg-cyan/10 px-2 py-0.5 text-xs text-cyan">我的分享</span>
                ) : null}
              </div>

              <div className="mt-3 space-y-1 text-sm text-secondary-text">
                <div>分享者：{item.sellerUsername}</div>
                <div>周期锚点：{item.cycleAnchorDate || '—'}</div>
                {!item.canViewFull && item.preview.analysisSummary ? (
                  <p className="line-clamp-3 text-default-600">{item.preview.analysisSummary}</p>
                ) : null}
              </div>

              <div className="mt-4 flex items-end justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                {item.canViewFull ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    isLoading={loadingReport}
                    onClick={() => void openReport(item)}
                  >
                    查看完整报告
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    isLoading={purchasingId === item.id}
                    disabled={item.isMine}
                    onClick={() => void handlePurchase(item)}
                  >
                    <ShoppingBag className="mr-1 h-4 w-4" />
                    {item.isMine ? '自己的报告' : `购买（${item.purchaseCredits} 积分）`}
                  </Button>
                )}
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
