import type React from 'react';
import { BarChart3 } from 'lucide-react';
import { Card } from '@heroui/react/card';
import type { BacktestResultItem } from '../../types/backtest';
import type { ReportLanguage } from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';
import {
  actualMovementLabel,
  backtestToneBorderClass,
  backtestToneTextClass,
  firstHitLabel,
  formatBacktestPct,
  normalizeBacktestResult,
  outcomeLabel,
} from '../../utils/backtestDisplay';

interface BacktestReportSectionProps {
  backtestResult?: BacktestResultItem | Record<string, unknown> | null;
  trendPrediction?: string | null;
  language?: ReportLanguage;
}

const boolText = (value: boolean | null | undefined, language: ReportLanguage): string => {
  if (value === true) {
    return language === 'en' ? 'Yes' : '是';
  }
  if (value === false) {
    return language === 'en' ? 'No' : '否';
  }
  return '--';
};

const MetricRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3 border-b border-subtle py-2 last:border-b-0">
    <span className="text-sm text-default-500">{label}</span>
    <span className="max-w-[62ch] text-right text-sm text-foreground">{value}</span>
  </div>
);

export const BacktestReportSection: React.FC<BacktestReportSectionProps> = ({
  backtestResult,
  trendPrediction,
  language,
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const result = normalizeBacktestResult(backtestResult);
  if (!result || result.evalStatus !== 'completed') {
    return null;
  }

  const tone = result.outcome === 'win' || result.directionCorrect === true
    ? 'success'
    : result.outcome === 'loss' || result.directionCorrect === false
      ? 'danger'
      : 'neutral';

  const copy = reportLanguage === 'en'
    ? {
      eyebrow: 'BACKTEST',
      title: 'Backtest Report',
      analysisDate: 'Analysis date',
      evalWindow: 'Evaluation window',
      aiPrediction: 'AI prediction',
      actualMovement: 'Actual movement',
      directionMatch: 'Direction match',
      outcome: 'Outcome',
      windowReturn: 'Window return',
      simulatedReturn: 'Simulated return',
      exitReason: 'Exit reason',
      stopLossHit: 'Stop loss hit',
      takeProfitHit: 'Take profit hit',
      firstHit: 'First trigger',
      firstHitDate: 'First trigger date',
      startPrice: 'Start price',
      endClose: 'End close',
      rangeHigh: 'Range high',
      rangeLow: 'Range low',
      days: 'trading days',
    }
    : {
      eyebrow: '回测验证',
      title: '回测报告',
      analysisDate: '分析日',
      evalWindow: '评估窗口',
      aiPrediction: 'AI 预测',
      actualMovement: '实际走势',
      directionMatch: '方向匹配',
      outcome: '验证结果',
      windowReturn: '窗口涨跌幅',
      simulatedReturn: '模拟收益',
      exitReason: '模拟退出原因',
      stopLossHit: '止损触发',
      takeProfitHit: '止盈触发',
      firstHit: '首次触发',
      firstHitDate: '首次触发日',
      startPrice: '起始价',
      endClose: '结束收盘价',
      rangeHigh: '区间最高',
      rangeLow: '区间最低',
      days: '个交易日',
    };

  const returnPct = result.stockReturnPct ?? result.actualReturnPct;
  const returnClass = returnPct == null
    ? 'text-foreground'
    : returnPct > 0
      ? 'text-success'
      : returnPct < 0
        ? 'text-danger'
        : 'text-default-500';

  return (
    <Card className={`border p-4 ${backtestToneBorderClass(tone)}`}>
      <div className="flex items-center gap-2">
        <BarChart3 className={`h-4 w-4 ${backtestToneTextClass(tone)}`} aria-hidden="true" />
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-default-500">
            {copy.eyebrow}
          </div>
          <h3 className="text-base font-semibold text-foreground">{copy.title}</h3>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-subtle bg-background/40 px-3">
        <MetricRow label={copy.analysisDate} value={result.analysisDate || '--'} />
        <MetricRow
          label={copy.evalWindow}
          value={result.evalWindowDays ? `${result.evalWindowDays} ${copy.days}` : '--'}
        />
        <MetricRow label={copy.aiPrediction} value={trendPrediction || result.trendPrediction || '--'} />
        <MetricRow
          label={copy.actualMovement}
          value={(
            <span className={backtestToneTextClass(
              result.actualMovement === 'up'
                ? 'success'
                : result.actualMovement === 'down'
                  ? 'danger'
                  : 'neutral',
            )}
            >
              {actualMovementLabel(result.actualMovement, reportLanguage)}
              {returnPct != null ? ` · ${formatBacktestPct(returnPct)}` : ''}
            </span>
          )}
        />
        <MetricRow
          label={copy.directionMatch}
          value={(
            <span className={backtestToneTextClass(
              result.directionCorrect === true
                ? 'success'
                : result.directionCorrect === false
                  ? 'danger'
                  : 'neutral',
            )}
            >
              {boolText(result.directionCorrect, reportLanguage)}
              {result.directionExpected ? ` · ${result.directionExpected}` : ''}
            </span>
          )}
        />
        <MetricRow
          label={copy.outcome}
          value={(
            <span className={backtestToneTextClass(tone)}>
              {outcomeLabel(result.outcome, reportLanguage)}
            </span>
          )}
        />
        <MetricRow
          label={copy.windowReturn}
          value={<span className={returnClass}>{formatBacktestPct(returnPct)}</span>}
        />
        {result.simulatedReturnPct != null ? (
          <MetricRow
            label={copy.simulatedReturn}
            value={formatBacktestPct(result.simulatedReturnPct)}
          />
        ) : null}
        {result.simulatedExitReason ? (
          <MetricRow label={copy.exitReason} value={result.simulatedExitReason} />
        ) : null}
        <MetricRow label={copy.stopLossHit} value={boolText(result.hitStopLoss, reportLanguage)} />
        <MetricRow label={copy.takeProfitHit} value={boolText(result.hitTakeProfit, reportLanguage)} />
        <MetricRow label={copy.firstHit} value={firstHitLabel(result.firstHit, reportLanguage)} />
        {result.firstHitDate ? (
          <MetricRow label={copy.firstHitDate} value={result.firstHitDate} />
        ) : null}
        {result.startPrice != null ? (
          <MetricRow label={copy.startPrice} value={result.startPrice.toFixed(2)} />
        ) : null}
        {result.endClose != null ? (
          <MetricRow label={copy.endClose} value={result.endClose.toFixed(2)} />
        ) : null}
        {result.maxHigh != null ? (
          <MetricRow label={copy.rangeHigh} value={result.maxHigh.toFixed(2)} />
        ) : null}
        {result.minLow != null ? (
          <MetricRow label={copy.rangeLow} value={result.minLow.toFixed(2)} />
        ) : null}
      </div>
    </Card>
  );
};
