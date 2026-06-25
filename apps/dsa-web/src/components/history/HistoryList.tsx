import type React from 'react';
import { useRef, useCallback, useEffect } from 'react';
import { ScrollShadow } from '@heroui/react';
import { History, Trash2 } from 'lucide-react';
import type { HistoryItem } from '../../types/analysis';
import { DashboardPanelHeader, DashboardStateBlock } from '../dashboard';
import { HistoryListItem } from './HistoryListItem';

interface HistoryListProps {
  items: HistoryItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  selectedId?: number;  // 当前选中的历史记录 ID
  isDeleting?: boolean;
  isSharing?: boolean;
  onShareSelected?: () => void;
  onItemClick: (recordId: number) => void;  // 点击记录的回调
  onLoadMore: () => void;
  onDeleteSelected: () => void;
  className?: string;
}

/**
 * 历史记录列表组件 (升级版)
 * 使用新设计系统组件实现，支持当前项操作和滚动加载
 */
export const HistoryList: React.FC<HistoryListProps> = ({
  items,
  isLoading,
  isLoadingMore,
  hasMore,
  selectedId,
  isDeleting = false,
  isSharing = false,
  onShareSelected,
  onItemClick,
  onLoadMore,
  onDeleteSelected,
  className = '',
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  const hasSelectedItem = selectedId !== undefined;

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

  return (
    <aside className={`home-history-panel overflow-hidden flex flex-col ${className}`}>
      <ScrollShadow
        ref={scrollContainerRef}
        data-testid="home-history-list-scroll"
        hideScrollBar={true}
        className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-0"
      >
        <div className="mb-4 space-y-4">
          <DashboardPanelHeader
            className="mb-0"
            title="历史分析"
            titleClassName="text-base font-bold"
            leading={(
              <History className="h-6 w-6 text-primary" strokeWidth={1.8} />
            )}
            headingClassName="items-center"
            actions={
              items.length > 0 ? (
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={onShareSelected}
                    disabled={!hasSelectedItem || isDeleting || isSharing}
                    className="history-text-action inline-flex items-center whitespace-nowrap text-primary disabled:opacity-40"
                  >
                    {isSharing ? '推荐中' : '推荐'}
                  </button>
                  <button
                    type="button"
                    onClick={onDeleteSelected}
                    disabled={!hasSelectedItem || isDeleting}
                    className="history-text-action inline-flex items-center gap-1 whitespace-nowrap text-danger disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                    {isDeleting ? '删除中' : '删除'}
                  </button>
                </div>
              ) : undefined
            }
          />
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
