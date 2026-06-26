import type React from 'react';
import { Badge } from '../common';
import { Checkbox } from '@heroui/react/checkbox';
import type { HistoryItem } from '../../types/analysis';
import { getSentimentColor } from '../../types/analysis';
import { formatDateTime } from '../../utils/format';
import { formatCycleVersionLabel } from '../../utils/predictionReportListings';
import { truncateStockName, isStockNameTruncated } from '../../utils/stockName';

interface HistoryListItemProps {
  item: HistoryItem;
  isViewing: boolean; // Indicates if this report is currently being viewed in the right panel
  isChecked: boolean; // Indicates if the checkbox is checked for bulk operations
  isDeleting: boolean;
  onToggleChecked: (recordId: number) => void;
  onClick: (recordId: number) => void;
}

const getOperationBadgeLabel = (advice?: string) => {
  const normalized = advice?.trim();
  if (!normalized) {
    return '情绪';
  }
  if (normalized.includes('减仓')) {
    return '减仓';
  }
  if (normalized.includes('卖')) {
    return '卖出';
  }
  if (normalized.includes('观望') || normalized.includes('等待')) {
    return '观望';
  }
  if (normalized.includes('买') || normalized.includes('布局')) {
    return '买入';
  }
  return normalized.split(/[，。；、\s]/)[0] || '建议';
};

export const HistoryListItem: React.FC<HistoryListItemProps> = ({
  item,
  isViewing,
  isChecked,
  isDeleting,
  onToggleChecked,
  onClick,
}) => {
  const sentimentColor = item.sentimentScore !== undefined ? getSentimentColor(item.sentimentScore) : null;
  const stockName = item.stockName || item.stockCode;
  const isTruncated = isStockNameTruncated(stockName);

  return (
    <div className="flex items-start gap-2 group">
      <div className="pt-4">
        <Checkbox
          isSelected={isChecked}
          onChange={() => onToggleChecked(item.id)}
          isDisabled={isDeleting}
          aria-label={`选择 ${item.stockCode} 的记录`}
          className="[&_[data-slot='checkbox-default-indicator--checkmark']]:size-4"
        >
          <Checkbox.Control className="size-5 rounded-md before:rounded-md">
            <Checkbox.Indicator />
          </Checkbox.Control>
        </Checkbox>
      </div>
      <button
        type="button"
        onClick={() => onClick(item.id)}
        className={`home-history-item min-w-0 flex-1 text-left p-2.5 group/item ${
          isViewing ? 'home-history-item-selected' : ''
        }`}
      >
        <div className={`relative z-10 flex min-w-0 flex-col gap-1${isTruncated ? ' group-hover/item:z-20' : ''}`}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="truncate text-base font-bold leading-7 text-foreground tracking-normal">
                  <span className="group-hover/item:hidden">
                    {truncateStockName(stockName)}
                  </span>
                  <span className="hidden group-hover/item:inline">
                    {stockName}
                  </span>
                </span>
              </div>
              {sentimentColor && (
                <Badge
                  variant="default"
                  size="sm"
                  className={`home-history-sentiment-badge shrink-0 shadow-none text-xs font-semibold leading-none transition-opacity duration-200${isTruncated ? ' group-hover/item:opacity-80' : ''}`}
                  style={{
                    color: sentimentColor,
                    borderColor: `${sentimentColor}30`,
                    backgroundColor: `${sentimentColor}10`,
                  }}
                >
                  {getOperationBadgeLabel(item.operationAdvice)} {item.sentimentScore}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] font-medium text-primary">
                {formatCycleVersionLabel(item.cycleVersion)}
              </span>
              <span className="w-1 h-1 rounded-full bg-subtle-hover" />
              <span className="text-[11px] text-secondary-text font-mono">
                {item.stockCode}
              </span>
              <span className="shrink-0 text-sm font-medium leading-5 text-secondary-text">
                {formatDateTime(item.createdAt)}
              </span>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
};
