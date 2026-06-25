import type React from 'react';
import { Activity } from 'lucide-react';
import { Card } from '@heroui/react/card';
import type { ReportLanguage, TechnicalIndicatorsReport } from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';
import { coerceFiniteNumber, formatRatio } from './financialFormat';

interface TechnicalIndicatorsSectionProps {
  technicalIndicators?: TechnicalIndicatorsReport;
  language?: ReportLanguage;
  compact?: boolean;
}

const formatLevels = (values?: number[] | null): string => {
  if (!Array.isArray(values) || values.length === 0) {
    return '--';
  }
  return values
    .filter((value) => Number.isFinite(value))
    .map((value) => value.toFixed(2))
    .join(' / ');
};

export const TechnicalIndicatorsSection: React.FC<TechnicalIndicatorsSectionProps> = ({
  technicalIndicators,
  language,
  compact = false,
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  if (!technicalIndicators) {
    return null;
  }

  const trend = technicalIndicators.trend;
  const ma = technicalIndicators.movingAverages ?? technicalIndicators.moving_averages;
  const macd = technicalIndicators.macd;
  const rsi = technicalIndicators.rsi;
  const kdj = technicalIndicators.kdj;
  const boll = technicalIndicators.boll;
  const volume = technicalIndicators.volume;
  const levels = technicalIndicators.levels;
  const signal = technicalIndicators.signal;

  const hasContent = Boolean(
    technicalIndicators.asOfPrice
    ?? technicalIndicators.as_of_price
    ?? ma?.ma5
    ?? macd?.dif
    ?? rsi?.rsi6
    ?? rsi?.rsi_6
    ?? levels?.supportLevels?.length
    ?? levels?.support_levels?.length,
  );
  if (!hasContent) {
    return null;
  }

  const copy = reportLanguage === 'en'
    ? {
      eyebrow: 'TECHNICAL ANALYSIS',
      title: 'Indicator Snapshot',
      trend: 'Trend',
      price: 'Price',
      ma: 'MA5/10/20/60',
      bias: 'Bias MA5/10/20',
      macd: 'MACD DIF/DEA/Bar',
      macdSignal: 'MACD Signal',
      rsi: 'RSI 6/12/24',
      rsiSignal: 'RSI Signal',
      kdj: 'KDJ K/D/J',
      kdjSignal: 'KDJ Signal',
      boll: 'BOLL Upper/Mid/Lower',
      bollSignal: 'BOLL %B / Status',
      volume: 'Volume / 5D Ratio',
      support: 'Support Levels',
      resistance: 'Resistance Levels',
      system: 'System Score / Signal',
      source: 'Source',
    }
    : {
      eyebrow: '技术分析',
      title: '技术指标快照',
      trend: '趋势',
      price: '现价',
      ma: 'MA5/10/20/60',
      bias: '乖离 MA5/10/20',
      macd: 'MACD DIF/DEA/柱',
      macdSignal: 'MACD 信号',
      rsi: 'RSI 6/12/24',
      rsiSignal: 'RSI 信号',
      kdj: 'KDJ K/D/J',
      kdjSignal: 'KDJ 信号',
      boll: 'BOLL 上/中/下轨',
      bollSignal: 'BOLL %B / 状态',
      volume: '量能 / 5日量比',
      support: '支撑位',
      resistance: '阻力位',
      system: '系统评分 / 信号',
      source: '数据源',
    };

  const price = coerceFiniteNumber(technicalIndicators.asOfPrice ?? technicalIndicators.as_of_price);
  const rows = [
    { label: copy.trend, value: `${trend?.status ?? '--'} / ${trend?.maAlignment ?? trend?.ma_alignment ?? '--'}` },
    { label: copy.price, value: price != null ? price.toFixed(2) : '--' },
    {
      label: copy.ma,
      value: [ma?.ma5, ma?.ma10, ma?.ma20, ma?.ma60].map((item) => formatRatio(item as number | null)).join(' / '),
    },
    {
      label: copy.bias,
      value: `${formatRatio(ma?.biasMa5 ?? ma?.bias_ma5, '%')} / ${formatRatio(ma?.biasMa10 ?? ma?.bias_ma10, '%')} / ${formatRatio(ma?.biasMa20 ?? ma?.bias_ma20, '%')}`,
    },
    {
      label: copy.macd,
      value: `${formatRatio(macd?.dif)} / ${formatRatio(macd?.dea)} / ${formatRatio(macd?.bar)}`,
    },
    { label: copy.macdSignal, value: `${macd?.status ?? '--'} / ${macd?.signal ?? '--'}` },
    {
      label: copy.rsi,
      value: `${formatRatio(rsi?.rsi6 ?? rsi?.rsi_6)} / ${formatRatio(rsi?.rsi12 ?? rsi?.rsi_12)} / ${formatRatio(rsi?.rsi24 ?? rsi?.rsi_24)}`,
    },
    { label: copy.rsiSignal, value: `${rsi?.status ?? '--'} / ${rsi?.signal ?? '--'}` },
    {
      label: copy.kdj,
      value: `${formatRatio(kdj?.k)} / ${formatRatio(kdj?.d)} / ${formatRatio(kdj?.j)}`,
    },
    { label: copy.kdjSignal, value: `${kdj?.status ?? '--'} / ${kdj?.signal ?? '--'}` },
    {
      label: copy.boll,
      value: `${formatRatio(boll?.upper)} / ${formatRatio(boll?.middle)} / ${formatRatio(boll?.lower)}`,
    },
    {
      label: copy.bollSignal,
      value: `${formatRatio(boll?.pctB ?? boll?.pct_b)} / ${boll?.status ?? '--'}`,
    },
    {
      label: copy.volume,
      value: `${volume?.status ?? '--'} / ${formatRatio(volume?.ratio5d ?? volume?.ratio_5d)}`,
    },
    {
      label: copy.support,
      value: formatLevels(levels?.supportLevels ?? levels?.support_levels),
    },
    {
      label: copy.resistance,
      value: formatLevels(levels?.resistanceLevels ?? levels?.resistance_levels),
    },
    {
      label: copy.system,
      value: `${signal?.score ?? '--'} / ${signal?.buySignal ?? signal?.buy_signal ?? '--'}`,
    },
  ];

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-default-500" aria-hidden="true" />
          <div>
            {!compact ? (
              <div className="text-[11px] font-medium uppercase tracking-wider text-default-500">
                {copy.eyebrow}
              </div>
            ) : null}
            <h3 className="text-base font-semibold text-foreground">{copy.title}</h3>
          </div>
        </div>
        {technicalIndicators.source ? (
          <span className="rounded-md bg-default-100 px-2 py-1 text-[11px] text-default-500">
            {copy.source}: {technicalIndicators.source}
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed text-left text-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-subtle last:border-b-0">
                <td className="w-2/5 px-2 py-2 text-default-600">{row.label}</td>
                <td className="px-2 py-2 text-right font-mono text-foreground">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  return (
    <Card className="text-left">
      <Card.Content className={compact ? 'space-y-3' : 'space-y-4'}>
        {content}
      </Card.Content>
    </Card>
  );
};
