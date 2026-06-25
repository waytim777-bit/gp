import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TaskPanel } from '../TaskPanel';
import type { TaskInfo } from '../../../types/analysis';

const baseTask: TaskInfo = {
  taskId: 'task-1',
  stockCode: '600519',
  stockName: '贵州茅台',
  status: 'processing',
  progress: 40,
  message: '正在抓取最新行情',
  reportType: 'detailed',
  createdAt: '2026-03-21T08:00:00Z',
};

describe('TaskPanel', () => {
  it('renders active tasks with preserved dashboard panel styling', () => {
    const { container } = render(
      <TaskPanel
        tasks={[
          baseTask,
          {
            ...baseTask,
            taskId: 'task-2',
            stockCode: 'AAPL',
            stockName: 'Apple',
            status: 'pending',
            message: '等待分析队列',
          },
        ]}
      />,
    );

    expect(screen.getByText('分析任务')).toBeInTheDocument();
    expect(screen.getByText('进行中(1)')).toBeInTheDocument();
    expect(screen.getByText('贵州茅台')).toBeInTheDocument();
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('正在抓取最新行情')).toBeInTheDocument();
    expect(screen.getByText('等待分析队列')).toBeInTheDocument();
    expect(screen.getByText('分析中')).toBeInTheDocument();
    expect(screen.getByText('等待中')).toBeInTheDocument();
    expect(screen.getByLabelText('任务状态：分析中')).toBeInTheDocument();
    expect(container.querySelector('.home-task-card')).toBeTruthy();
    expect(container.querySelector('.home-panel-card')).toBeFalsy();
  });

  it('strips stock name prefixes from task messages', () => {
    render(
      <TaskPanel
        tasks={[
          {
            ...baseTask,
            stockCode: '600519.SH',
            message: '贵州茅台：600519.SH：正在检索新闻',
          },
        ]}
      />,
    );

    expect(screen.getByText('正在检索新闻')).toBeInTheDocument();
    expect(screen.queryByText(/贵州茅台/)).not.toHaveTextContent('贵州茅台：');
    expect(screen.queryByText(/600519\.SH：正在检索新闻/)).not.toBeInTheDocument();
  });

  it('does not render when there are no active tasks', () => {
    const { container } = render(
      <TaskPanel
        tasks={[
          {
            ...baseTask,
            status: 'completed',
          },
        ]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
