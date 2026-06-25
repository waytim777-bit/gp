import type React from 'react';
import type { ReportLanguage, ReportStrategy as ReportStrategyType } from '../../types/analysis';
import { Card } from '@heroui/react/card';
import { getReportText, normalizeReportLanguage } from '../../utils/reportLanguage';

interface ReportStrategyProps {
  strategy?: ReportStrategyType;
  language?: ReportLanguage;
}

interface StrategyItemProps {
  label: string;
  value?: string;
}

const StrategyItem: React.FC<StrategyItemProps> = ({
  label,
  value,
}) => (
  <div className="min-h-[160px] rounded-xl border border-[#5f6780] p-4">
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-sm font-bold leading-5 text-[#5f6780]">{label}</span>
      <span
        className="whitespace-pre-wrap break-words text-sm font-bold leading-5 text-white"
        style={!value ? { opacity: 0.4 } : undefined}
      >
        {value || '—'}
      </span>
    </div>
  </div>
);

/**
 * 策略点位区组件 - 终端风格
 */
export const ReportStrategy: React.FC<ReportStrategyProps> = ({ strategy, language = 'zh' }) => {
  if (!strategy) {
    return null;
  }

  const reportLanguage = normalizeReportLanguage(language);
  const text = getReportText(reportLanguage);

  const strategyItems = [
    {
      label: text.idealBuy,
      value: strategy.idealBuy,
    },
    {
      label: text.secondaryBuy,
      value: strategy.secondaryBuy,
    },
    {
      label: text.stopLoss,
      value: strategy.stopLoss,
    },
    {
      label: text.takeProfit,
      value: strategy.takeProfit,
    },
  ];

  return (
    <Card className="rounded-xl border-0 bg-[#1c1f26] shadow-none">
      <Card.Content className="space-y-5">
        <h3 className="text-xl font-bold leading-7 text-white">{text.sniperLevels}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {strategyItems.map((item) => (
            <StrategyItem key={item.label} {...item} />
          ))}
        </div>
      </Card.Content>
    </Card>
  );
};
