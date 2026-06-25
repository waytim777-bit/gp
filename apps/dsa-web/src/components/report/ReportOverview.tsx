import type React from 'react';
import { useState } from 'react';
import type {
  ReportDetails as ReportDetailsType,
  ReportMeta,
  ReportStrategy as ReportStrategyType,
  ReportSummary as ReportSummaryType,
} from '../../types/analysis';
import basicViewIconSvg from '../../assets/basic-view.svg?raw';
import { Badge, ScoreGauge } from '../common';
import { Card } from '@heroui/react/card';
import { Modal, Separator } from "@heroui/react";
import { formatDateTime } from '../../utils/format';
import { hasBusinessModelValue } from '../../utils/businessModel';
import { getReportText, normalizeReportLanguage } from '../../utils/reportLanguage';
import { BusinessModelSection } from './BusinessModelSection';
import { CompanyProfileSection } from './CompanyProfileSection';
import { ReportStrategy } from './ReportStrategy';

interface ReportOverviewProps {
  meta: ReportMeta;
  summary: ReportSummaryType;
  strategy?: ReportStrategyType;
  details?: ReportDetailsType;
  isHistory?: boolean;
}

type BoardStatus = 'leading' | 'lagging';

type BoardSignal = {
  status: BoardStatus;
  changePct?: number;
};

const normalizeBoardName = (value?: string): string =>
  (value || '').trim().replace(/\s+/g, ' ');

const coerceFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/%$/, '');
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const buildBoardSignalMap = (details?: ReportDetailsType): Map<string, BoardSignal> => {
  const signalMap = new Map<string, BoardSignal>();
  const topBoards = Array.isArray(details?.sectorRankings?.top) ? details.sectorRankings.top : [];
  const bottomBoards = Array.isArray(details?.sectorRankings?.bottom) ? details.sectorRankings.bottom : [];

  topBoards.forEach((item) => {
    const normalizedName = normalizeBoardName(item?.name);
    if (!normalizedName) {
      return;
    }
    signalMap.set(normalizedName, {
      status: 'leading',
      changePct: coerceFiniteNumber(item.changePct),
    });
  });

  bottomBoards.forEach((item) => {
    const normalizedName = normalizeBoardName(item?.name);
    if (!normalizedName) {
      return;
    }
    signalMap.set(normalizedName, {
      status: 'lagging',
      changePct: coerceFiniteNumber(item.changePct),
    });
  });

  return signalMap;
};

const getIndustryFromBoards = (details?: ReportDetailsType): string | undefined => {
  const boards = Array.isArray(details?.belongBoards) ? details.belongBoards : [];
  const industryBoard = boards.find((board) => {
    const typeText = normalizeBoardName(board?.type).toLowerCase();
    return typeText.includes('行业') || typeText.includes('industry');
  });
  return normalizeBoardName(industryBoard?.name) || undefined;
};

const hasCompanyProfileValue = (details?: ReportDetailsType): boolean => {
  const profile = details?.companyProfile;
  if (!profile) {
    return Boolean(getIndustryFromBoards(details));
  }
  return Boolean(
    profile.fullName ||
    profile.industry ||
    profile.listingDate ||
    profile.totalShareCapital != null ||
    profile.floatShareCapital != null ||
    profile.employeeCount != null ||
    profile.website ||
    profile.mainBusiness ||
    profile.businessScope ||
    profile.companyIntro ||
    profile.legalRepresentative ||
    profile.chairman ||
    profile.manager ||
    profile.boardSecretary ||
    getIndustryFromBoards(details),
  );
};

/**
 * 鎶ュ憡姒傝鍖虹粍浠?- 缁堢椋庢牸
 */
export const ReportOverview: React.FC<ReportOverviewProps> = ({
  meta,
  summary,
  strategy,
  details,
}) => {
  const [companyBasicsDialogOpen, setCompanyBasicsDialogOpen] = useState(false);
  const reportLanguage = normalizeReportLanguage(meta.reportLanguage);
  const text = getReportText(reportLanguage);
  const relatedBoards = (Array.isArray(details?.belongBoards) ? details.belongBoards : [])
    .filter((board) => normalizeBoardName(board?.name).length > 0)
    .slice(0, 3);
  const boardSignals = buildBoardSignalMap(details);
  const shouldShowCompanyBasics = hasCompanyProfileValue(details);
  const shouldShowBusinessModel = hasBusinessModelValue(details);

  const getPriceChangeStyle = (changePct: number | undefined): React.CSSProperties | undefined => {
    if (changePct === undefined || changePct === null) {
      return undefined;
    }

    if (changePct > 0) {
      return { color: 'var(--home-price-up)' };
    }

    if (changePct < 0) {
      return { color: 'var(--home-price-down)' };
    }

    return undefined;
  };

  const formatChangePct = (changePct: number | undefined): string => {
    if (changePct === undefined || changePct === null) return '--';
    const sign = changePct > 0 ? '+' : '';
    return `${sign}${changePct.toFixed(2)}%`;
  };

  const getBoardStatusLabel = (status: BoardStatus): string => {
    if (status === 'leading') {
      return text.leadingBoard;
    }
    return text.laggingBoard;
  };

  const getBoardStatusVariant = (status: BoardStatus): 'success' | 'danger' => {
    if (status === 'leading') {
      return 'success';
    }
    return 'danger';
  };

  return (
    <div className="space-y-5">
      <Card>
        <Card.Content>
          <div className="flex justify-between items-center">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-[28px] font-bold leading-tight text-foreground">
                  {meta.stockName || meta.stockCode}
                </h2>
                {meta.currentPrice != null && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold font-mono" style={getPriceChangeStyle(meta.changePct)}>
                      {meta.currentPrice.toFixed(2)}
                    </span>
                    <span className="text-sm font-semibold font-mono" style={getPriceChangeStyle(meta.changePct)}>
                      {formatChangePct(meta.changePct)}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="rounded-md bg-default-100 px-2 py-0.5 font-mono text-xs text-default-600">
                  {meta.stockCode}
                </span>
                <span className="text-xs text-default-400 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {formatDateTime(meta.createdAt)}
                </span>
              </div>
            </div>
            {shouldShowCompanyBasics ? (
              <button
                type="button"
                aria-label={text.viewCompanyBasics}
                className="inline-flex h-6 shrink-0 items-center justify-start gap-1 rounded-md border border-transparent bg-transparent p-0 text-sm font-medium leading-[22px] text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                onClick={() => setCompanyBasicsDialogOpen(true)}
              >
                <span
                  className="h-5 w-5 shrink-0 [&_svg]:block [&_svg]:h-5 [&_svg]:w-5"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: basicViewIconSvg }}
                />
                <span className="whitespace-nowrap">{text.viewCompanyBasics}</span>
              </button>
            ) : null}
          </div>
        </Card.Content>
      </Card>
      {/* 主信息区 - 两列布局，items-stretch 确保右侧与左侧同高 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
        {/* 左侧：股票信息与结论 */}
        <div className="lg:col-span-2 space-y-5 flex flex-col">
          {/* 核心洞察 */}
          <Card className="flex-1 flex flex-col">
            <Card.Content className="space-y-5 flex-1">
              <div>
                <Card.Title className="mb-2 text-xs font-medium uppercase tracking-wider text-default-500">
                  {text.keyInsights}
                </Card.Title>
                <p className="max-w-[62ch] whitespace-pre-wrap text-left text-[15px] leading-7 text-foreground">
                  {summary.analysisSummary || text.noAnalysisSummary}
                </p>
              </div>
            </Card.Content>
          </Card>
        </div>

        {/* 右侧：情绪指标 */}
        <div className="flex flex-col self-stretch min-h-full">
          <Card className="flex-1 flex flex-col">
          <Card.Content className="flex flex-col items-center justify-center flex-1 p-6">
              <Card.Title className="mb-5 text-sm font-medium tracking-wide text-foreground">{text.marketSentiment}</Card.Title>
              <ScoreGauge score={summary.sentimentScore} size="lg" language={reportLanguage} />
            </Card.Content>
          </Card>
        </div>
      </div>


      <div className={`grid grid-cols-1 gap-5 ${relatedBoards.length > 0 ? 'lg:grid-cols-3' : 'md:grid-cols-2'}`}>
        <Card>
          <Card.Content className="flex h-[100px] items-center justify-between flex-row">
            <div className="flex w-16 shrink-0 flex-col items-center">
              <svg className="h-8 w-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 32 32" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 6.5h14A2.5 2.5 0 0 1 25.5 9v14a2.5 2.5 0 0 1-2.5 2.5H9A2.5 2.5 0 0 1 6.5 23V9A2.5 2.5 0 0 1 9 6.5Z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 13.5h10M11 18.5l3 3 7-7" />
              </svg>
              <div className="mt-1 text-sm leading-5 text-secondary-text">{text.actionAdvice}</div>
            </div>
            <div
              className="min-w-0 truncate text-right text-xl font-semibold leading-7 text-warning"
              title={summary.operationAdvice || text.noAdvice}
            >
              {summary.operationAdvice || text.noAdvice}
            </div>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content className="flex h-[100px] items-center justify-between flex-row">
            <div className="flex w-16 shrink-0 flex-col items-center">
              <svg className="h-8 w-8 text-warning" fill="none" stroke="currentColor" viewBox="0 0 32 32" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 23h18M9 20l5-5 4 4 6-8" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11h5v5" />
              </svg>
              <div className="mt-1 text-sm leading-5 text-secondary-text">{text.trendPrediction}</div>
            </div>
            <div
              className="min-w-0 truncate text-right text-xl font-semibold leading-7 text-foreground"
              title={summary.trendPrediction || text.noPrediction}
            >
              {summary.trendPrediction || text.noPrediction}
            </div>
          </Card.Content>
        </Card>

        {relatedBoards.length > 0 && (
          <Card>
            <Card.Content className="flex h-[100px] flex-col justify-center gap-1.5 px-4 py-6">
              <div className="flex items-center justify-between gap-4 text-xs leading-[17px] text-default-500">
                <span>{text.boardLinkage}</span>
                <span>{text.relatedBoards}</span>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                {Array.from({ length: 3 }, (_, index) => {
                  const board = relatedBoards[index];
                  const boardName = normalizeBoardName(board?.name);
                  const signal = boardSignals.get(boardName);
                  return (
                    <div
                      key={`${boardName || 'empty'}-${board?.code || index}`}
                      className={`min-w-0 space-y-1 ${index === 0 ? 'text-left' : index === 2 ? 'text-right' : 'text-center'}`}
                      title={boardName}
                    >
                      <div className="truncate text-base font-medium leading-[22px] text-foreground">
                        {boardName}
                      </div>
                      {board ? (
                        <div className={`flex min-h-5 flex-wrap items-center gap-1.5 ${index === 0 ? 'justify-start' : index === 2 ? 'justify-end' : 'justify-center'}`}>
                          {board.type ? (
                            <span className="rounded-full bg-default-100 px-1.5 py-0.5 text-[10px] leading-4 text-default-600">
                              {board.type}
                            </span>
                          ) : null}
                          {signal ? (
                            <Badge
                              variant={getBoardStatusVariant(signal.status)}
                              className="px-1.5 py-0 text-[10px] leading-4 shadow-none"
                            >
                              {getBoardStatusLabel(signal.status)}
                            </Badge>
                          ) : null}
                          {signal && signal.changePct !== undefined && signal.changePct !== null ? (
                            <span
                              className="text-[10px] font-mono leading-4"
                              style={getPriceChangeStyle(signal.changePct)}
                            >
                              {formatChangePct(signal.changePct)}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Card.Content>
          </Card>
        )}
      </div>

      <ReportStrategy strategy={strategy} language={reportLanguage} />

      {shouldShowBusinessModel && (
        <>
          <BusinessModelSection
            details={details}
            language={reportLanguage}
          />
          <Separator />
        </>
      )}

      <Modal.Root isOpen={companyBasicsDialogOpen} onOpenChange={setCompanyBasicsDialogOpen}>
        <Modal.Backdrop variant="blur">
          <Modal.Container size="lg" placement="center">
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>{text.companyBasics}</Modal.Heading>
                <Modal.CloseTrigger />
              </Modal.Header>
              <Modal.Body>
                <CompanyProfileSection details={details} language={reportLanguage} />
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </div>
  );
};
