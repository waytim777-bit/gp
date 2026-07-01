import type React from 'react';
import { ShoppingBag } from 'lucide-react';
import { Button } from '../common';
import type { PredictionReportListingItem } from '../../types/predictionReports';
import { backtestToneTextClass } from '../../utils/backtestDisplay';
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
          className="h-11 min-w-[160px] rounded-full border-0 bg-[#10C97B] px-6 text-sm font-bold text-white shadow-none hover:brightness-105"
          onClick={() => onView(item)}
        >
          查看完整报告
        </Button>
      );
    }
    if (item.isMine) {
      return (
        <Button
          size="sm"
          variant="secondary"
          disabled
          className="h-11 min-w-[148px] rounded-full border-0 px-6 text-sm font-bold shadow-none"
        >
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
          className="h-11 min-w-[148px] rounded-full border-0 bg-[hsl(var(--primary))] px-6 text-sm font-bold text-white shadow-none hover:brightness-105"
          onClick={() => onPurchase(item)}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-[hsl(var(--primary))]">
            <ShoppingBag className="h-4 w-4" />
          </span>
          {`购买（${item.purchaseCredits} 积分）`}
        </Button>
      );
    }
    return (
      <Button
        size="sm"
        variant="secondary"
        disabled
        className="h-11 min-w-[148px] rounded-full border-0 px-6 text-sm font-bold shadow-none"
      >
        不可购买
      </Button>
    );
  };

  return (
    <div className="w-full space-y-3">
      <p className="text-sm text-secondary-text">
        本周期共 {items.length} 份预测报告可购买，购买后查看完整内容
        {purchaseCredits > 0 ? `（默认 ${purchaseCredits} 积分/份）` : ''}
      </p>

      <div className="grid gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-col gap-4 rounded-xl border-0 bg-surface px-5 py-4 shadow-none md:flex-row md:items-center md:justify-between"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 text-xl font-bold leading-none text-foreground">
                  {item.name}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold leading-none text-primary">
                    {`${formatCycleVersionLabel(item.cycleVersion)} · 本周期`}
                  </span>
                  <span className={`rounded-full bg-primary/10 px-3 py-1 text-xs font-bold leading-none ${backtestToneTextClass(item.backtestPreview?.tone)}`}>
                    {item.backtestPreview?.label || '未回测'}
                  </span>
                  {item.isMine ? (
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold leading-none text-primary">我的推荐</span>
                  ) : null}
                  {item.hasPurchaseRecord ? (
                    <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-bold leading-none text-success">已购买</span>
                  ) : null}
                </div>
              </div>
              <div className="mt-1 font-mono text-sm font-medium leading-none text-muted-text">{item.code}</div>

              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm leading-none text-secondary-text">
                <span>周期锚点:{formatCycleAnchorLabel(item)}</span>
                <span>分享者:{item.sellerUsername}</span>
              </div>

              {!item.canViewFull && item.preview.analysisSummary ? (
                <p className="mt-3 line-clamp-2 max-w-3xl text-sm leading-6 text-secondary-text">
                  {item.preview.analysisSummary}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap justify-start gap-4 md:justify-end">
              {canRefreshIntel ? (
                <Button
                  variant="home-action-ai"
                  size="sm"
                  disabled={isAnalyzing}
                  className="h-11 min-w-[160px] rounded-full border-0 bg-[hsl(var(--primary))] px-6 text-sm font-bold text-white shadow-none hover:brightness-105"
                  onClick={onRefreshIntel}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  重新分析
                </Button>
              ) : null}
              {renderAction(item)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HomeMarketListingsPanel;
