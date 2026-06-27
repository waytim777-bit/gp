import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HistoryList } from '../HistoryList';
import type { HistoryItem } from '../../../types/analysis';

const baseProps = {
  isLoading: false,
  isLoadingMore: false,
  hasMore: false,
  selectedIds: new Set<number>(),
  onItemClick: vi.fn(),
  onLoadMore: vi.fn(),
  onToggleItemSelection: vi.fn(),
  onToggleSelectAll: vi.fn(),
  onDeleteSelected: vi.fn(),
};

const items: HistoryItem[] = [
  {
    id: 1,
    queryId: 'q-1',
    stockCode: '600519',
    stockName: '贵州茅台',
    sentimentScore: 82,
    operationAdvice: '买入',
    createdAt: '2026-03-15T08:00:00Z',
  },
];

const longChineseNameItem: HistoryItem = {
  id: 2,
  queryId: 'q-2',
  stockCode: '600519',
  stockName: '贵州茅台股票股份有限公司',
  sentimentScore: 75,
  operationAdvice: '持有',
  createdAt: '2026-03-16T08:00:00Z',
};

describe('HistoryList', () => {
  it('shows the empty state copy when no history exists', () => {
    const { container } = render(<HistoryList {...baseProps} items={[]} />);

    expect(screen.getByText('暂无历史分析记录')).toBeInTheDocument();
    expect(screen.getByText('完成首次分析后，这里会保留最近结果。')).toBeInTheDocument();
    expect(screen.getByText('历史分析')).toBeInTheDocument();
    expect(container.querySelector('.home-history-panel')).toBeTruthy();
  });

  it('enables batch actions and selects items in delete mode', () => {
    const onItemClick = vi.fn();
    const onToggleItemSelection = vi.fn();

    render(
      <HistoryList
        {...baseProps}
        items={items}
        selectedId={1}
        selectedIds={new Set([1])}
        onItemClick={onItemClick}
        onToggleItemSelection={onToggleItemSelection}
      />,
    );

    expect(screen.getByText('买入 82')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /贵州茅台/i }).parentElement).toHaveClass('home-history-row-selected');

    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    expect(screen.getByText('已选 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除' })).toBeEnabled();

    const historyItemButton = screen.getByRole('button', { name: /贵州茅台/i });
    expect(historyItemButton.parentElement).not.toHaveClass('home-history-row-selected');

    fireEvent.click(historyItemButton);
    expect(onToggleItemSelection).toHaveBeenCalledWith(1);
    expect(onItemClick).not.toHaveBeenCalled();
  });

  it('does not show checkboxes before delete mode is opened', () => {
    render(<HistoryList {...baseProps} items={items} />);

    expect(screen.getByRole('button', { name: '删除' })).toBeEnabled();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('opens delete mode and renders selection checkboxes', () => {
    render(<HistoryList {...baseProps} items={items} selectedId={1} />);

    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    expect(screen.getByText('选择要删除的历史分析')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '删除' })).toBeDisabled();
  });

  it('truncates long stock names with trailing dot', () => {
    render(
      <HistoryList
        {...baseProps}
        items={[longChineseNameItem]}
      />,
    );

    // '贵州茅台股票股份有限公司' (12 Chinese chars) should be truncated to '贵州茅台股票股份.' (8 chars + dot)
    // The full name exists in a hidden span, visible on hover
    expect(screen.getByText('贵州茅台股票股份.')).toBeInTheDocument();
    const fullNameHidden = screen.queryByText('贵州茅台股票股份有限公司');
    expect(fullNameHidden).toBeInTheDocument();
    expect(fullNameHidden).toHaveClass('hidden');
  });

  it('forwards selected delete from delete mode', () => {
    const onDeleteSelected = vi.fn();

    render(
      <HistoryList
        {...baseProps}
        items={items}
        selectedId={1}
        selectedIds={new Set([1])}
        onDeleteSelected={onDeleteSelected}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    expect(onDeleteSelected).toHaveBeenCalledTimes(1);
  });

  it('cancels delete mode and clears visible selections', () => {
    const onToggleItemSelection = vi.fn();

    render(
      <HistoryList
        {...baseProps}
        items={items}
        selectedId={1}
        selectedIds={new Set([1])}
        onToggleItemSelection={onToggleItemSelection}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    expect(screen.getAllByRole('checkbox')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: '取消删除选择' }));

    expect(onToggleItemSelection).toHaveBeenCalledWith(1);
  });
});
