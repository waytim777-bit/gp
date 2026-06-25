import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HistoryList } from '../HistoryList';
import type { HistoryItem } from '../../../types/analysis';

const baseProps = {
  isLoading: false,
  isLoadingMore: false,
  hasMore: false,
  onItemClick: vi.fn(),
  onLoadMore: vi.fn(),
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

  it('enables selected item actions and forwards item interactions', () => {
    const onItemClick = vi.fn();

    render(
      <HistoryList
        {...baseProps}
        items={items}
        selectedId={1}
        onItemClick={onItemClick}
      />,
    );

    expect(screen.getByText('买入 82')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '推荐' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '删除' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /贵州茅台/i }));
    expect(onItemClick).toHaveBeenCalledWith(1);
  });

  it('disables actions when no history item is selected', () => {
    render(<HistoryList {...baseProps} items={items} />);

    expect(screen.getByRole('button', { name: '删除' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '推荐' })).toBeDisabled();
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

  it('does not render history selection checkboxes', () => {
    render(
      <HistoryList {...baseProps} items={items} selectedId={1} />,
    );

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
