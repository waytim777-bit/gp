import type React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getReportText, normalizeReportLanguage } from '../../utils/reportLanguage';
import type { ReportDetails, ReportLanguage } from '../../types/analysis';
import { hasBusinessModelValue } from '../../utils/businessModel';
import { hasCompanyProfileValue } from '../../utils/companyProfile';
import { BusinessModelSection } from './BusinessModelSection';
import { CompanyProfileSection } from './CompanyProfileSection';
import { FinancialRevenueGrowthSection } from './FinancialRevenueGrowthSection';
import { FinancialProfitabilitySection } from './FinancialProfitabilitySection';
import { FinancialIncomePeriodsSection } from './FinancialIncomePeriodsSection';
import { FinancialBalanceSheetSection } from './FinancialBalanceSheetSection';
import { FinancialCashFlowSection } from './FinancialCashFlowSection';
import { FinancialExpressSection } from './FinancialExpressSection';
import { TechnicalAnalysisSection } from './TechnicalAnalysisSection';
import { TechnicalIndicatorsSection } from './TechnicalIndicatorsSection';
import { PriceTrendAnalysisSection } from './PriceTrendAnalysisSection';
import { WeeklyTrendAnalysisSection } from './WeeklyTrendAnalysisSection';
import { CapitalFlowSection } from './CapitalFlowSection';
import { KeyLevelsSection } from './KeyLevelsSection';
import { ChipDistributionSection } from './ChipDistributionSection';
import { KlineChartSection } from './KlineChartSection';
import { ModelOpinionsPanel } from './ModelOpinionsPanel';

interface ReportFullContentProps {
  stockName: string;
  stockCode: string;
  markdown: string;
  details?: ReportDetails;
  language?: ReportLanguage;
  showPrintHeader?: boolean;
}

export const ReportFullContent: React.FC<ReportFullContentProps> = ({
  stockName,
  stockCode,
  markdown,
  details,
  language = 'zh',
  showPrintHeader = true,
}) => {
  const normalizedLanguage = normalizeReportLanguage(language);
  const text = getReportText(normalizedLanguage);
  const financialFundamentalsAnalysis = details?.financialFundamentalsAnalysis
    ?? details?.financial_fundamentals_analysis;
  const technicalIndicators = details?.technicalIndicators ?? details?.technical_indicators;
  const technicalAnalysisReport = details?.technicalAnalysisReport
    ?? details?.technical_analysis_report;
  const klineSeries = details?.klineSeries ?? details?.kline_series;
  const priceTrendAnalysis = details?.priceTrendAnalysis ?? details?.price_trend_analysis;
  const chipDistribution = details?.chipDistribution ?? details?.chip_distribution;
  const keyLevels = details?.keyLevels ?? details?.key_levels;
  const keyLevelsAnalysis = details?.keyLevelsAnalysis ?? details?.key_levels_analysis;
  const weeklyKlineSeries = details?.weeklyKlineSeries ?? details?.weekly_kline_series;
  const weeklyTrendAnalysis = details?.weeklyTrendAnalysis ?? details?.weekly_trend_analysis;
  const capitalFlow = details?.capitalFlow ?? details?.capital_flow;
  const capitalFlowAnalysis = details?.capitalFlowAnalysis ?? details?.capital_flow_analysis;
  const modelOpinions = details?.modelOpinions ?? details?.model_opinions;

  return (
    <div className="space-y-5" data-report-print-root>
      {showPrintHeader ? (
        <div className="hidden print:block">
          <h1 className="text-xl font-semibold text-foreground">{stockName || stockCode}</h1>
          <p className="text-sm text-muted-text">{text.fullReport}</p>
        </div>
      ) : null}
      {hasCompanyProfileValue(details) ? (
        <CompanyProfileSection
          details={details}
          language={normalizedLanguage}
          className="home-divider rounded-xl border border-subtle bg-surface/50 p-4"
        />
      ) : null}
      {hasBusinessModelValue(details) ? (
        <BusinessModelSection
          details={details}
          language={normalizedLanguage}
          className="home-divider rounded-xl border border-subtle bg-surface/50 p-4"
        />
      ) : null}
      <FinancialRevenueGrowthSection
        financialReport={details?.financialReport}
        financialFundamentalsAnalysis={financialFundamentalsAnalysis}
        language={normalizedLanguage}
        compact
      />
      <FinancialProfitabilitySection
        financialReport={details?.financialReport}
        profitabilityAnalysis={details?.profitabilityAnalysis}
        financialFundamentalsAnalysis={financialFundamentalsAnalysis}
        language={normalizedLanguage}
        compact
      />
      <FinancialIncomePeriodsSection
        financialReport={details?.financialReport}
        financialFundamentalsAnalysis={financialFundamentalsAnalysis}
        language={normalizedLanguage}
        compact
      />
      <FinancialBalanceSheetSection
        financialReport={details?.financialReport}
        financialFundamentalsAnalysis={financialFundamentalsAnalysis}
        language={normalizedLanguage}
        compact
      />
      <FinancialCashFlowSection
        financialReport={details?.financialReport}
        financialFundamentalsAnalysis={financialFundamentalsAnalysis}
        language={normalizedLanguage}
        compact
      />
      <FinancialExpressSection
        financialReport={details?.financialReport}
        financialFundamentalsAnalysis={financialFundamentalsAnalysis}
        language={normalizedLanguage}
        compact
      />
      <PriceTrendAnalysisSection
        priceTrendAnalysis={priceTrendAnalysis}
        language={normalizedLanguage}
        compact
      />
      <KlineChartSection
        klineSeries={klineSeries}
        language={normalizedLanguage}
        compact
      />
      <WeeklyTrendAnalysisSection
        weeklyTrendAnalysis={weeklyTrendAnalysis}
        language={normalizedLanguage}
        compact
      />
      <KlineChartSection
        klineSeries={weeklyKlineSeries}
        language={normalizedLanguage}
        variant="weekly"
        compact
      />
      <TechnicalAnalysisSection
        technicalAnalysisReport={technicalAnalysisReport}
        language={normalizedLanguage}
        compact
      />
      <TechnicalIndicatorsSection
        technicalIndicators={technicalIndicators}
        language={normalizedLanguage}
        compact
      />
      <ChipDistributionSection
        chipDistribution={chipDistribution}
        language={normalizedLanguage}
        compact
      />
      <CapitalFlowSection
        capitalFlow={capitalFlow}
        capitalFlowAnalysis={capitalFlowAnalysis}
        language={normalizedLanguage}
        compact
      />
      <KeyLevelsSection
        keyLevels={keyLevels}
        keyLevelsAnalysis={keyLevelsAnalysis}
        language={normalizedLanguage}
        compact
      />
      <ModelOpinionsPanel
        modelOpinions={modelOpinions}
        language={normalizedLanguage}
      />
      <div
        className="home-markdown-prose prose prose-invert prose-sm max-w-none
          prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
          prose-h1:text-xl
          prose-h2:text-lg
          prose-h3:text-base
          prose-p:leading-relaxed prose-p:mb-3 prose-p:last:mb-0
          prose-strong:text-foreground prose-strong:font-semibold
          prose-ul:my-2 prose-ol:my-2 prose-li:my-1
          prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
          prose-pre:border
          prose-table:border-collapse
          prose-hr:my-4
          prose-a:no-underline hover:prose-a:underline
          prose-blockquote:text-secondary-text
          whitespace-pre-line break-words
        "
      >
        <Markdown remarkPlugins={[remarkGfm]}>
          {markdown}
        </Markdown>
      </div>
    </div>
  );
};
