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
  selectionMode: boolean;
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
  selectionMode,
  onToggleChecked,
  onClick,
}) => {
  const sentimentColor = item.sentimentScore !== undefined ? getSentimentColor(item.sentimentScore) : null;
  const stockName = item.stockName || item.stockCode;
  const isTruncated = isStockNameTruncated(stockName);
  const showViewingMarker = isViewing && !selectionMode;
  const handleItemClick = () => {
    if (selectionMode) {
      onToggleChecked(item.id);
      return;
    }

    onClick(item.id);
  };

  return (
    <div className={`home-history-row flex items-stretch gap-2 group ${showViewingMarker ? 'home-history-row-selected' : ''}`}>
      {selectionMode && (
        <div className="flex shrink-0 items-center" onClick={(event) => event.stopPropagation()}>
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
      )}
      <button
        type="button"
        onClick={handleItemClick}
        disabled={isDeleting}
        className={`home-history-item min-w-0 flex-1 text-left px-3.5 py-3 group/item disabled:pointer-events-none disabled:opacity-70 ${
          isViewing ? 'home-history-item-selected' : ''
        }`}
      >
        <div className={`relative z-10 flex min-w-0 flex-col gap-1.5${isTruncated ? ' group-hover/item:z-20' : ''}`}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <span className="truncate text-[15px] font-bold leading-6 text-foreground tracking-normal">
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
                  className={`home-history-sentiment-badge shrink-0 shadow-none text-[11px] font-semibold leading-none transition-opacity duration-200${isTruncated ? ' group-hover/item:opacity-80' : ''}`}
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
            <div className="mt-1 flex items-center justify-between gap-2 text-[12px] leading-5 text-secondary-text">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 font-medium text-primary">
                  {formatCycleVersionLabel(item.cycleVersion)}
                </span>
                <span className="h-1 w-1 shrink-0 rounded-full bg-subtle-hover" />
                <span className="min-w-0 truncate font-mono">
                  {item.stockCode}
                </span>
              </div>
              <span className="shrink-0 font-medium tabular-nums">
                {formatDateTime(item.createdAt)}
              </span>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
};
