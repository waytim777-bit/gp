import type React from 'react';
import { useEffect, useState, useCallback } from 'react';
import { FileDown, Share2 } from 'lucide-react';
import { historyApi } from '../../api/history';
import { shareReportLink } from '../../api/publicReports';
import { Drawer } from '../common/Drawer';
import { Tooltip } from '../common/Tooltip';
import { getReportText, normalizeReportLanguage } from '../../utils/reportLanguage';
import type { ReportDetails, ReportLanguage } from '../../types/analysis';
import { buildReportPdfFilename, downloadReportPdf } from '../../utils/downloadReportPdf';
import { ReportFullContent } from './ReportFullContent';

interface ReportMarkdownProps {
  recordId: number;
  stockName: string;
  stockCode: string;
  onClose: () => void;
  reportLanguage?: ReportLanguage;
  details?: ReportDetails;
}

export const ReportMarkdown: React.FC<ReportMarkdownProps> = ({
  recordId,
  stockName,
  stockCode,
  onClose,
  reportLanguage = 'zh',
  details,
}) => {
  const normalizedLanguage = normalizeReportLanguage(reportLanguage);
  const text = getReportText(normalizedLanguage);
  const loadReportFailedText = text.loadReportFailed;
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  const handleDownloadPdf = useCallback(async () => {
    if (!content || isDownloadingPdf) {
      return;
    }
    const reportElement = document.querySelector<HTMLElement>('[data-report-print-root]');
    if (!reportElement) {
      setPdfError(text.downloadPdfFailed);
      return;
    }

    setPdfError(null);
    setIsDownloadingPdf(true);
    try {
      const filename = buildReportPdfFilename(stockCode, stockName, normalizedLanguage);
      await downloadReportPdf(reportElement, filename);
    } catch (downloadError) {
      console.error('PDF download failed:', downloadError);
      setPdfError(text.downloadPdfFailed);
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [
    content,
    isDownloadingPdf,
    normalizedLanguage,
    stockCode,
    stockName,
    text.downloadPdfFailed,
  ]);

  const handleShare = useCallback(async () => {
    if (isSharing) {
      return;
    }
    setIsSharing(true);
    setShareMessage(null);
    try {
      const link = await historyApi.enableShareLink(recordId);
      const url = await shareReportLink(link.sharePath, `${stockName || stockCode} ${text.fullReport}`);
      setShareMessage(`${text.shareLinkCopied}\n${url}`);
      window.setTimeout(() => setShareMessage(null), 2500);
    } catch (shareError) {
      console.error('Share link failed:', shareError);
      setShareMessage(text.shareFailed);
    } finally {
      setIsSharing(false);
    }
  }, [isSharing, recordId, stockCode, stockName, text.fullReport, text.shareFailed, text.shareLinkCopied]);

  useEffect(() => {
    let isMounted = true;

    const fetchMarkdown = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const markdownContent = await historyApi.getMarkdown(recordId);
        if (isMounted) {
          setContent(markdownContent);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : loadReportFailedText);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void fetchMarkdown();

    return () => {
      isMounted = false;
    };
  }, [recordId, loadReportFailedText]);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={handleClose}
      width="max-w-3xl"
      zIndex={100}
      backdropClassName="bg-background/56 backdrop-blur-[2px]"
    >
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <div className="flex flex-1 items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--home-action-report-bg)] text-[var(--home-action-report-text)]">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{stockName || stockCode}</h2>
            <p className="text-xs text-muted-text">{text.fullReport}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip content={isSharing ? text.sharingReport : text.shareReport}>
            <span className="inline-flex">
              <button
                type="button"
                onClick={() => { void handleShare(); }}
                disabled={isLoading || !content || isSharing}
                className="home-surface-button flex h-10 w-10 items-center justify-center rounded-lg text-secondary-text hover:text-foreground disabled:opacity-50"
                aria-label={isSharing ? text.sharingReport : text.shareReport}
              >
                {isSharing ? (
                  <div className="home-spinner h-5 w-5 animate-spin border-2" />
                ) : (
                  <Share2 className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </span>
          </Tooltip>

          <Tooltip content={isDownloadingPdf ? text.downloadingPdf : text.downloadPdf}>
            <span className="inline-flex">
              <button
                type="button"
                onClick={() => { void handleDownloadPdf(); }}
                disabled={isLoading || !content || isDownloadingPdf}
                className="home-surface-button flex h-10 w-10 items-center justify-center rounded-lg text-secondary-text hover:text-foreground disabled:opacity-50"
                aria-label={isDownloadingPdf ? text.downloadingPdf : text.downloadPdf}
              >
                {isDownloadingPdf ? (
                  <div className="home-spinner h-5 w-5 animate-spin border-2" />
                ) : (
                  <FileDown className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </span>
          </Tooltip>
        </div>
      </div>

      {shareMessage ? (
        <p className="mb-3 whitespace-pre-wrap break-all text-sm text-success print:hidden">{shareMessage}</p>
      ) : null}
      {pdfError ? (
        <p className="mb-3 text-sm text-danger print:hidden">{pdfError}</p>
      ) : null}

      {isLoading ? (
        <div className="flex h-64 flex-col items-center justify-center">
          <div className="home-spinner h-10 w-10 animate-spin border-[3px]" />
          <p className="mt-4 text-sm text-secondary-text">{text.loadingReport}</p>
        </div>
      ) : error ? (
        <div className="flex h-64 flex-col items-center justify-center">
          <p className="text-sm text-danger">{error}</p>
          <button
            type="button"
            onClick={handleClose}
            className="home-surface-button mt-4 rounded-lg px-4 py-2 text-sm text-secondary-text"
          >
            {text.dismiss}
          </button>
        </div>
      ) : (
        <ReportFullContent
          stockName={stockName}
          stockCode={stockCode}
          markdown={content}
          details={details}
          language={normalizedLanguage}
        />
      )}

      <div className="home-divider mt-6 flex justify-end border-t pt-4 print:hidden">
        <button
          type="button"
          onClick={handleClose}
          className="home-surface-button rounded-lg px-4 py-2 text-sm text-secondary-text hover:text-foreground"
        >
          {text.dismiss}
        </button>
      </div>
    </Drawer>
  );
};
