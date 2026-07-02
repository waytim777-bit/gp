import type React from 'react';
import { useRef, useCallback, useEffect, useState } from 'react';
import { ScrollShadow } from '@heroui/react';
import { Checkbox } from '@heroui/react/checkbox';
import { History, Trash2, X } from 'lucide-react';
import type { HistoryItem } from '../../types/analysis';
import { Button } from '../common';
import { DashboardStateBlock } from '../dashboard';
import { HistoryListItem } from './HistoryListItem';

interface HistoryListProps {
  items: HistoryItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  selectedId?: number;  // 当前选中的历史记录 ID
  selectedIds: Set<number>;
  isDeleting?: boolean;
  onItemClick: (recordId: number) => void;  // 点击记录的回调
  onLoadMore: () => void;
  onToggleItemSelection: (recordId: number) => void;
  onToggleSelectAll: () => void;
  onDeleteSelected: () => void;
  className?: string;
}

/**
 * 历史记录列表组件 (升级版)
 * 使用新设计系统组件实现，支持批量选择和滚动加载
 */
export const HistoryList: React.FC<HistoryListProps> = ({
  items,
  isLoading,
  isLoadingMore,
  hasMore,
  selectedId,
  selectedIds,
  isDeleting = false,
  onItemClick,
  onLoadMore,
  onToggleItemSelection,
  onToggleSelectAll,
  onDeleteSelected,
  className = '',
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const [hasOpenedSelectionMode, setHasOpenedSelectionMode] = useState(false);

  const selectedCount = items.filter((item) => selectedIds.has(item.id)).length;
  const allVisibleSelected = items.length > 0 && selectedCount === items.length;
  const someVisibleSelected = selectedCount > 0 && !allVisibleSelected;
  const isSelectionMode = items.length > 0 && hasOpenedSelectionMode;

  // 使用 IntersectionObserver 检测滚动到底部
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const target = entries[0];
      if (target.isIntersecting && hasMore && !isLoading && !isLoadingMore) {
        const container = scrollContainerRef.current;
        if (container && container.scrollHeight > container.clientHeight) {
          onLoadMore();
        }
      }
    },
    [hasMore, isLoading, isLoadingMore, onLoadMore]
  );

  useEffect(() => {
    const trigger = loadMoreTriggerRef.current;
    const container = scrollContainerRef.current;
    if (!trigger || !container) return;

    const observer = new IntersectionObserver(handleObserver, {
      root: container,
      rootMargin: '20px',
      threshold: 0.1,
    });

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [handleObserver]);

  const handleEnterSelectionMode = useCallback(() => {
    if (items.length > 0 && !isDeleting) {
      setHasOpenedSelectionMode(true);
    }
  }, [isDeleting, items.length]);

  const handleCancelSelectionMode = useCallback(() => {
    items.forEach((item) => {
      if (selectedIds.has(item.id)) {
        onToggleItemSelection(item.id);
      }
    });
    setHasOpenedSelectionMode(false);
  }, [items, onToggleItemSelection, selectedIds]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedCount > 0 && !isDeleting) {
      onDeleteSelected();
    }
  }, [isDeleting, onDeleteSelected, selectedCount]);

  return (
    <aside className={`home-history-panel overflow-hidden flex flex-col ${className}`}>
      <ScrollShadow
        ref={scrollContainerRef}
        data-testid="home-history-list-scroll"
        hideScrollBar={true}
        className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-0 pr-0.5"
      >
        <div className="mb-3 space-y-3">
          <div className="flex min-h-6 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-1.5">
              <History className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.9} />
              <h2 className="truncate text-base font-bold leading-6 text-foreground">历史分析</h2>
            </div>

            {items.length > 0 && (
              isSelectionMode ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  {/* <span className="history-selection-badge text-primary">
                    已选 {selectedCount}
                  </span> */}
                  <Button
                    variant="ghost"
                    size="xsm"
                    onClick={handleCancelSelectionMode}
                    disabled={isDeleting}
                    className="history-header-action-button"
                    aria-label="取消删除选择"
                  >
                    <X className="h-3.5 w-3.5" />
                    取消
                  </Button>
                  <Button
                    variant="danger-subtle"
                    size="xsm"
                    onClick={handleDeleteSelected}
                    disabled={selectedCount === 0 || isDeleting}
                    isLoading={isDeleting}
                    loadingText="删除中"
                    className="history-header-action-button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleEnterSelectionMode}
                  disabled={isDeleting}
                  className="history-delete-entry inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-secondary-text transition-colors hover:text-danger disabled:pointer-events-none disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                  <span>删除</span>
                </button>
              )
            )}
          </div>

          {items.length > 0 && isSelectionMode && (
            <div className="flex items-center justify-between gap-2">
              <Checkbox
                isSelected={allVisibleSelected}
                isIndeterminate={someVisibleSelected}
                isDisabled={isDeleting}
                onChange={onToggleSelectAll}
                aria-label="全选当前已加载历史记录"
                className="[&_[data-slot='checkbox-default-indicator--checkmark']]:size-4 [&_[data-slot='checkbox-default-indicator--indeterminate']]:size-4"
              >
                <Checkbox.Control className="size-5 rounded-md before:rounded-md">
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Content>
                  <span className="text-md text-default-500 select-none">已选{selectedCount}</span>
                </Checkbox.Content>
              </Checkbox>
            </div>
          )}
        </div>

        {isLoading ? (
          <DashboardStateBlock
            loading
            compact
            title="加载历史记录中..."
          />
        ) : items.length === 0 ? (
          <DashboardStateBlock
            title="暂无历史分析记录"
            description="完成首次分析后，这里会保留最近结果。"
            icon={(
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          />
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <HistoryListItem
                key={item.id}
                item={item}
                isViewing={selectedId === item.id}
                isChecked={selectedIds.has(item.id)}
                isDeleting={isDeleting}
                selectionMode={isSelectionMode}
                onToggleChecked={onToggleItemSelection}
                onClick={onItemClick}
              />
            ))}

            <div ref={loadMoreTriggerRef} className="h-4" />
            
            {isLoadingMore && (
              <div className="flex justify-center py-4">
                <div className="home-spinner h-5 w-5 animate-spin border-2" />
              </div>
            )}

            {!hasMore && items.length > 0 && (
              <div className="text-center py-5">
                <div className="h-px bg-subtle w-full mb-3" />
                <span className="text-[10px] text-secondary-text uppercase tracking-[0.2em]">已到底部</span>
              </div>
            )}
          </div>
        )}
      </ScrollShadow>
    </aside>
  );
};
