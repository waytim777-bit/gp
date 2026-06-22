import React from 'react';
import type { AnalysisResult, AnalysisReport } from '../../types/analysis';
import type { BacktestResultItem } from '../../types/backtest';
import { ReportOverview } from './ReportOverview';
import { ReportStrategy } from './ReportStrategy';
import { ReportNews } from './ReportNews';
import { ReportDetails } from './ReportDetails';
import { FinancialRevenueGrowthSection } from './FinancialRevenueGrowthSection';
import { FinancialProfitabilitySection } from './FinancialProfitabilitySection';
import { FinancialIncomePeriodsSection } from './FinancialIncomePeriodsSection';
import { FinancialBalanceSheetSection } from './FinancialBalanceSheetSection';
import { FinancialCashFlowSection } from './FinancialCashFlowSection';
import { FinancialExpressSection } from './FinancialExpressSection';
import { TechnicalAnalysisSection } from './TechnicalAnalysisSection';
import { TechnicalIndicatorsSection } from './TechnicalIndicatorsSection';
import { PriceTrendAnalysisSection } from './PriceTrendAnalysisSection';
import { KlineChartSection } from './KlineChartSection';
import { WeeklyTrendAnalysisSection } from './WeeklyTrendAnalysisSection';
import { CapitalFlowSection } from './CapitalFlowSection';
import { KeyLevelsSection } from './KeyLevelsSection';
import { ChipDistributionSection } from './ChipDistributionSection';
import { PredictionCycleBanner } from './PredictionCycleBanner';
import { BacktestReportSection } from './BacktestReportSection';
import { ModelOpinionsPanel } from './ModelOpinionsPanel';
import { getReportText, normalizeReportLanguage } from '../../utils/reportLanguage';

interface ReportSummaryProps {
  data: AnalysisResult | AnalysisReport;
  isHistory?: boolean;
}

/**
 * 完整报告展示组件
 * 整合概览、策略、资讯、详情四个区域
 */
export const ReportSummary: React.FC<ReportSummaryProps> = ({
  data,
  isHistory = false,
}) => {
  // 兼容 AnalysisResult 和 AnalysisReport 两种数据格式
  const report: AnalysisReport = 'report' in data ? data.report : data;
  // 使用 report id，因为 queryId 在批量分析时可能重复，且历史报告详情接口需要 recordId 来获取关联资讯和详情数据
  const recordId = report.meta.id;

  const { meta, summary, strategy, details } = report;
  const reportLanguage = normalizeReportLanguage(meta.reportLanguage);
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
  const backtestResult = (details?.backtestResult ?? details?.backtest_result) as BacktestResultItem | undefined;
  const modelOpinions = details?.modelOpinions ?? details?.model_opinions;
  const text = getReportText(reportLanguage);
  const modelUsed = (meta.modelUsed || '').trim();
  const shouldShowModel = Boolean(
    modelUsed && !['unknown', 'error', 'none', 'null', 'n/a'].includes(modelUsed.toLowerCase()),
  );

  return (
    <div className="space-y-5 pb-8 animate-fade-in">
      <PredictionCycleBanner
        cycle={meta.predictionCycle}
        language={reportLanguage}
      />

      {/* 概览区（首屏） */}
      <ReportOverview
        meta={meta}
        summary={summary}
        details={details}
        isHistory={isHistory}
      />

      {/* 财务数据分析区 */}
      <FinancialRevenueGrowthSection
        financialReport={details?.financialReport}
        financialFundamentalsAnalysis={financialFundamentalsAnalysis}
        language={reportLanguage}
      />
      <FinancialProfitabilitySection
        financialReport={details?.financialReport}
        profitabilityAnalysis={details?.profitabilityAnalysis}
        financialFundamentalsAnalysis={financialFundamentalsAnalysis}
        language={reportLanguage}
      />
      <FinancialIncomePeriodsSection
        financialReport={details?.financialReport}
        financialFundamentalsAnalysis={financialFundamentalsAnalysis}
        language={reportLanguage}
      />
      <FinancialBalanceSheetSection
        financialReport={details?.financialReport}
        financialFundamentalsAnalysis={financialFundamentalsAnalysis}
        language={reportLanguage}
      />
      <FinancialCashFlowSection
        financialReport={details?.financialReport}
        financialFundamentalsAnalysis={financialFundamentalsAnalysis}
        language={reportLanguage}
      />
      <FinancialExpressSection
        financialReport={details?.financialReport}
        financialFundamentalsAnalysis={financialFundamentalsAnalysis}
        language={reportLanguage}
      />

      {/* 技术分析区 */}
      <PriceTrendAnalysisSection
        priceTrendAnalysis={priceTrendAnalysis}
        language={reportLanguage}
      />
      <KlineChartSection
        klineSeries={klineSeries}
        language={reportLanguage}
      />
      <WeeklyTrendAnalysisSection
        weeklyTrendAnalysis={weeklyTrendAnalysis}
        language={reportLanguage}
      />
      <KlineChartSection
        klineSeries={weeklyKlineSeries}
        language={reportLanguage}
        variant="weekly"
      />
      <TechnicalAnalysisSection
        technicalAnalysisReport={technicalAnalysisReport}
        language={reportLanguage}
      />
      <TechnicalIndicatorsSection
        technicalIndicators={technicalIndicators}
        language={reportLanguage}
      />
      <ChipDistributionSection
        chipDistribution={chipDistribution}
        language={reportLanguage}
      />
      <CapitalFlowSection
        capitalFlow={capitalFlow}
        capitalFlowAnalysis={capitalFlowAnalysis}
        language={reportLanguage}
      />
      <KeyLevelsSection
        keyLevels={keyLevels}
        keyLevelsAnalysis={keyLevelsAnalysis}
        language={reportLanguage}
      />

      {/* 策略点位区 */}
      <ReportStrategy strategy={strategy} language={reportLanguage} />

      {/* 资讯区 */}
      <ReportNews recordId={recordId} limit={8} language={reportLanguage} />

      {/* 透明度与追溯区 */}
      <ReportDetails details={details} recordId={recordId} language={reportLanguage} />

      {/* 多模型会诊（主模型 + 只读会诊） */}
      <ModelOpinionsPanel
        modelOpinions={modelOpinions}
        language={reportLanguage}
      />

      {/* 回测报告（仅已完成评估时展示） */}
      <BacktestReportSection
        backtestResult={backtestResult}
        trendPrediction={summary.trendPrediction}
        language={reportLanguage}
      />

      {/* 分析模型标记（Issue #528）— 报告末尾 */}
      {shouldShowModel && (
        <p className="px-1 text-xs text-muted-text">
          {text.analysisModel}: {modelUsed}
        </p>
      )}
    </div>
  );
};
