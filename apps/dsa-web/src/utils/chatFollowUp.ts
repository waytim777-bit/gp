import type { AnalysisReport } from '../types/analysis';
import { historyApi } from '../api/history';
import { validateStockCode } from './validation';

export type ChatMode = 'report_interpret' | 'incremental' | 'standard';

export interface ChatFollowUpContext {
  stock_code: string;
  stock_name: string | null;
  record_id?: number;
  chat_mode?: ChatMode;
  previous_analysis_summary?: unknown;
  previous_strategy?: unknown;
  previous_price?: number;
  previous_change_pct?: number;
}

export interface FollowUpQuickQuestion {
  id: string;
  label: string;
  chat_mode?: ChatMode;
  buildMessage: (displayName: string) => string;
}

type ResolveChatFollowUpContextParams = {
  stockCode: string;
  stockName: string | null;
  recordId?: number;
};

const MAX_FOLLOW_UP_NAME_LENGTH = 80;

function hasInvalidFollowUpNameCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

export function sanitizeFollowUpStockCode(stockCode: string | null): string | null {
  if (!stockCode) {
    return null;
  }

  const { valid, normalized } = validateStockCode(stockCode);
  return valid ? normalized : null;
}

export function sanitizeFollowUpStockName(stockName: string | null): string | null {
  const normalized = stockName?.trim().replace(/\s+/g, ' ') ?? '';
  if (!normalized) {
    return null;
  }

  if (
    normalized.length > MAX_FOLLOW_UP_NAME_LENGTH
    || hasInvalidFollowUpNameCharacter(normalized)
  ) {
    return null;
  }

  return normalized;
}

export function parseFollowUpRecordId(recordId: string | null): number | undefined {
  if (!recordId || !/^\d+$/.test(recordId)) {
    return undefined;
  }

  const parsed = Number(recordId);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

export function formatFollowUpDisplayName(stockCode: string, stockName: string | null): string {
  return stockName ? `${stockName}(${stockCode})` : stockCode;
}

/** Placeholder shown in the chat input when arriving from a homepage report. */
export function buildFollowUpInputPlaceholder(stockCode: string, stockName: string | null): string {
  const displayName = formatFollowUpDisplayName(stockCode, stockName);
  return `基于报告追问 ${displayName}，例如：估值是否合理？`;
}

export const REPORT_FOLLOW_UP_QUICK_QUESTIONS: FollowUpQuickQuestion[] = [
  {
    id: 'valuation',
    label: '估值是否合理？',
    buildMessage: (display) => `基于首页报告，请重点解读 ${display} 的估值水平是否合理，并说明依据。`,
  },
  {
    id: 'peers',
    label: '与同业相比？',
    buildMessage: (display) => `基于首页报告，请对比 ${display} 与主要同业的核心差异与相对优劣势。`,
  },
  {
    id: 'position',
    label: '我已持仓怎么办？',
    buildMessage: (display) => `假设我已持有 ${display}，请结合报告给出仓位管理与加减仓建议。`,
  },
  {
    id: 'risk',
    label: '主要风险有哪些？',
    buildMessage: (display) => `基于首页报告，请归纳 ${display} 当前最需要关注的 3 个风险点。`,
  },
  {
    id: 'incremental',
    label: '查最新动态（增量）',
    chat_mode: 'incremental',
    buildMessage: (display) => `请针对 ${display} 补充检索最新新闻与行情变化，并说明与首页报告的差异。`,
  },
];

export function buildChatFollowUpContext(
  stockCode: string,
  stockName: string | null,
  recordId?: number,
  report?: AnalysisReport | null,
): ChatFollowUpContext {
  const context: ChatFollowUpContext = {
    stock_code: stockCode,
    stock_name: stockName,
    record_id: recordId,
    chat_mode: recordId !== undefined ? 'report_interpret' : 'standard',
  };

  if (!report) {
    return context;
  }

  if (report.summary) {
    context.previous_analysis_summary = report.summary;
  }

  if (report.strategy) {
    context.previous_strategy = report.strategy;
  }

  if (report.meta) {
    context.previous_price = report.meta.currentPrice;
    context.previous_change_pct = report.meta.changePct;
  }

  return context;
}

export async function resolveChatFollowUpContext({
  stockCode,
  stockName,
  recordId,
}: ResolveChatFollowUpContextParams): Promise<ChatFollowUpContext> {
  if (!recordId) {
    return buildChatFollowUpContext(stockCode, stockName);
  }

  try {
    const report = await historyApi.getDetail(recordId);
    return buildChatFollowUpContext(stockCode, stockName, recordId, report);
  } catch {
    return buildChatFollowUpContext(stockCode, stockName, recordId);
  }
}
