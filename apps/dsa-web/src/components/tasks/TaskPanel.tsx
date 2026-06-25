import type React from 'react';
import { CalendarDays } from 'lucide-react';
import { Badge, StatusDot } from '../common';
import type { TaskInfo } from '../../types/analysis';

/**
 * 任务项组件属性
 */
interface TaskItemProps {
  task: TaskInfo;
}

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stripTaskMessagePrefix = (message: string, task: TaskInfo): string => {
  const prefixes = [
    task.stockName,
    task.stockCode,
    task.stockCode.replace(/\.(SH|SZ|BJ|HK|US)$/i, ''),
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => escapeRegExp(value.trim()));

  if (prefixes.length === 0) {
    return message.trim();
  }

  const prefixPattern = new RegExp(`^\\s*(?:${prefixes.join('|')})\\s*[:：,-]?\\s*`, 'i');
  let nextMessage = message.trim();

  for (let index = 0; index < 3; index += 1) {
    const stripped = nextMessage.replace(prefixPattern, '').trim();
    if (stripped === nextMessage) {
      break;
    }
    nextMessage = stripped;
  }

  return nextMessage;
};

/**
 * 单个任务项
 */
const TaskItem: React.FC<TaskItemProps> = ({ task }) => {
  const isProcessing = task.status === 'processing';
  const statusLabel = isProcessing ? '分析中' : '等待中';
  const statusTone = isProcessing ? 'info' : 'neutral';
  const progress = Math.max(0, Math.min(100, task.progress || 0));
  const displayMessage = stripTaskMessagePrefix(task.message || `${statusLabel}...`, task);

  return (
    <div
      className="home-task-card min-h-[160px] w-full rounded-xl border-[1.5px] border-[hsl(var(--primary))] bg-[hsl(var(--card))] px-5 py-5 shadow-none"
      aria-label={`任务状态：${statusLabel}`}
    >
      <div className="flex h-full min-w-0 flex-col justify-between gap-7">
        <div className="flex items-center justify-between gap-4">
          <span className="truncate text-base font-bold leading-[22px] text-foreground">
            {task.stockName || task.stockCode}
          </span>
          <span className="shrink-0 text-base font-semibold leading-[22px] text-secondary-text">
            {task.stockCode}
          </span>
        </div>

        <div className="space-y-5">
          <div className="flex items-start gap-2.5">
            <StatusDot tone={statusTone} pulse={isProcessing} className="mt-1 h-3 w-3" />
            <p className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-5 text-secondary-text">
              {displayMessage}
            </p>
            <Badge
              variant={isProcessing ? 'info' : 'default'}
              className="shrink-0 border-[hsl(var(--primary)/0.38)] bg-[hsl(var(--primary)/0.12)] px-2 py-0.5 text-xs font-bold leading-4 text-[hsl(var(--primary))] shadow-none"
            >
              <StatusDot tone={statusTone} pulse={isProcessing} className="h-1.5 w-1.5" />
              {statusLabel}
            </Badge>
          </div>

          <div className="flex items-center gap-4">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[hsl(var(--foreground)/0.12)]">
              <div
                className="h-full rounded-full bg-[hsl(var(--primary))] transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="w-9 shrink-0 text-right text-base font-medium leading-[22px] text-secondary-text tabular-nums">
              {progress}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * 任务面板属性
 */
interface TaskPanelProps {
  /** 任务列表 */
  tasks: TaskInfo[];
  /** 是否显示 */
  visible?: boolean;
  /** 标题 */
  title?: string;
  /** 自定义类名 */
  className?: string;
}

/**
 * 任务面板组件
 * 显示进行中的分析任务列表
 */
export const TaskPanel: React.FC<TaskPanelProps> = ({
  tasks,
  visible = true,
  title = '分析任务',
  className = '',
}) => {
  // 筛选活跃任务（pending 和 processing）
  const activeTasks = tasks.filter(
    (t) => t.status === 'pending' || t.status === 'processing'
  );

  // 无任务或不可见时不渲染
  if (!visible || activeTasks.length === 0) {
    return null;
  }

  const pendingCount = activeTasks.filter((t) => t.status === 'pending').length;
  const processingCount = activeTasks.filter((t) => t.status === 'processing').length;
  const statusText = processingCount > 0
    ? `进行中(${processingCount})`
    : `等待中(${pendingCount})`;

  return (
    <section className={`w-full max-w-[280px] ${className}`} aria-label={title}>
      <div className="mb-4 flex h-6 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-1">
          <CalendarDays className="h-6 w-6 shrink-0 text-foreground" strokeWidth={2} aria-hidden="true" />
          <h3 className="truncate text-base font-bold leading-[22px] text-foreground">{title}</h3>
        </div>
        <span className="shrink-0 text-sm font-bold leading-5 text-[hsl(var(--primary))]">
          {statusText}
        </span>
      </div>

      <div className="max-h-[360px] overflow-y-auto">
        <div className="space-y-4">
          {activeTasks.map((task) => (
            <TaskItem key={task.taskId} task={task} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default TaskPanel;
