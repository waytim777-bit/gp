import type React from 'react';
import { ShoppingBag } from 'lucide-react';
import { Button } from '../common';
import type { PredictionReportListingItem } from '../../types/predictionReports';
import { backtestToneBorderClass, backtestToneTextClass } from '../../utils/backtestDisplay';
import { formatDateTime } from '../../utils/format';
import { formatCycleVersionLabel } from '../../utils/predictionReportListings';

type HomeMarketListingsPanelProps = {
  stockCode: string;
  stockName?: string;
  items: PredictionReportListingItem[];
  purchaseCredits: number;
  purchasingListingId: number | null;
  isLoadingReport: boolean;
  canRefreshIntel: boolean;
  isAnalyzing: boolean;
  onPurchase: (item: PredictionReportListingItem) => void;
  onView: (item: PredictionReportListingItem) => void;
  onRefreshIntel: () => void;
};

const formatCycleAnchorLabel = (item: PredictionReportListingItem): string => {
  if (item.analyzedAt) {
    return formatDateTime(item.analyzedAt);
  }
  return item.cycleAnchorDate || '—';
};

export const HomeMarketListingsPanel: React.FC<HomeMarketListingsPanelProps> = ({
  items,
  purchaseCredits,
  purchasingListingId,
  isLoadingReport,
  canRefreshIntel,
  isAnalyzing,
  onPurchase,
  onView,
  onRefreshIntel,
}) => {
  const renderAction = (item: PredictionReportListingItem) => {
    if (item.canViewFull) {
      return (
        <Button
          size="sm"
          variant="secondary"
          isLoading={isLoadingReport}
          onClick={() => onView(item)}
        >
          查看完整报告
        </Button>
      );
    }
    if (item.isMine) {
      return (
        <Button size="sm" variant="secondary" disabled>
          自己的推荐
        </Button>
      );
    }
    if (item.canPurchase) {
      return (
        <Button
          size="sm"
          variant="primary"
          isLoading={purchasingListingId === item.id}
          onClick={() => onPurchase(item)}
        >
          <ShoppingBag className="mr-1 h-4 w-4" />
          {`购买（${item.purchaseCredits} 积分）`}
        </Button>
      );
    }
    return (
      <Button size="sm" variant="secondary" disabled>
        不可购买
      </Button>
    );
  };

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-secondary-text">
            本周期共 {items.length} 份预测报告可购买，购买后查看完整内容（默认 {purchaseCredits} 积分/份）。
          </p>
        </div>
        {canRefreshIntel ? (
          <Button
            variant="home-action-ai"
            size="sm"
            disabled={isAnalyzing}
            onClick={onRefreshIntel}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            再次分析
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-default-200 bg-surface/80 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-foreground">{item.name}</div>
                <div className="mt-1 font-mono text-xs text-muted-text">{item.code}</div>
                <div className="mt-2 text-sm text-secondary-text">推荐者：{item.sellerUsername}</div>
                <div className="mt-1 text-xs text-muted-text">周期锚点：{formatCycleAnchorLabel(item)}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {`${formatCycleVersionLabel(item.cycleVersion)} · 本周期`}
                </span>
                {item.isMine ? (
                  <span className="rounded-full bg-cyan/10 px-2 py-0.5 text-xs text-cyan">我的推荐</span>
                ) : null}
                {item.hasPurchaseRecord ? (
                  <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">已购买</span>
                ) : null}
              </div>
            </div>

            {!item.canViewFull && item.preview.analysisSummary ? (
              <p className="mt-3 line-clamp-3 text-sm text-default-600">{item.preview.analysisSummary}</p>
            ) : null}

            <div
              className={`mt-3 rounded-md border px-2.5 py-1.5 text-xs ${backtestToneBorderClass(item.backtestPreview?.tone)}`}
            >
              <span className="text-default-500">回测：</span>
              <span className={`font-medium ${backtestToneTextClass(item.backtestPreview?.tone)}`}>
                {item.backtestPreview?.label || '未回测'}
              </span>
            </div>

            <div className="mt-4">{renderAction(item)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HomeMarketListingsPanel;
