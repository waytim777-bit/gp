import type React from 'react';
import { useEffect, useState, useCallback } from 'react';
import { Drawer } from '@heroui/react';
import { FileDown, Share2 } from 'lucide-react';
import { historyApi } from '../../api/history';
import { shareReportLink } from '../../api/publicReports';
import { Tooltip } from '../common/Tooltip';
import { getReportText, normalizeReportLanguage } from '../../utils/reportLanguage';
import type { ReportDetails, ReportLanguage } from '../../types/analysis';
import { buildReportPdfFilename } from '../../utils/downloadReportPdf';
import reportFullIcon from '../../assets/reportfullicon.png';
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
  const downloadPdfLabel = normalizedLanguage === 'zh' ? '下载PDF' : text.downloadPdf;
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

    setPdfError(null);
    setIsDownloadingPdf(true);
    try {
      const filename = buildReportPdfFilename(stockCode, stockName, normalizedLanguage);
      const blob = await historyApi.downloadPdf(recordId);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      window.URL.revokeObjectURL(url);
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
    recordId,
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
    <Drawer.Root isOpen={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <Drawer.Backdrop variant="blur" className="z-[100]">
        <Drawer.Content placement="right">
          <Drawer.Dialog className="ml-auto flex h-full w-full max-w-3xl flex-col bg-card text-left shadow-2xl outline-none">
            <Drawer.Body className="flex-1 overflow-y-auto p-6">
              <div className="mb-6 flex flex-col gap-2 print:hidden">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <img
                      src={reportFullIcon}
                      alt=""
                      className="h-12 w-12 shrink-0"
                      aria-hidden="true"
                    />
                    <h2 className="truncate text-[32px] font-semibold leading-none text-foreground">
                      {text.fullReport}
                    </h2>
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    <div className="flex flex-col items-center gap-1.5">
                      <Tooltip content={isSharing ? text.sharingReport : text.shareReport}>
                        <span className="inline-flex">
                          <button
                            type="button"
                            onClick={() => { void handleShare(); }}
                            disabled={isLoading || !content || isSharing}
                            className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-transparent text-secondary-text transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
                            aria-label={isSharing ? text.sharingReport : text.shareReport}
                          >
                            {isSharing ? (
                              <div className="home-spinner h-5 w-5 animate-spin border-2" />
                            ) : (
                              <Share2 className="h-6 w-6" aria-hidden="true" />
                            )}
                          </button>
                        </span>
                      </Tooltip>
                      <span className="text-xs font-semibold leading-none text-secondary-text">
                        {text.shareReport}
                      </span>
                    </div>

                    <div className="flex flex-col items-center gap-1.5">
                      <Tooltip content={isDownloadingPdf ? text.downloadingPdf : text.downloadPdf}>
                        <span className="inline-flex">
                          <button
                            type="button"
                            onClick={() => { void handleDownloadPdf(); }}
                            disabled={isLoading || !content || isDownloadingPdf}
                            className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-transparent text-secondary-text transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
                            aria-label={isDownloadingPdf ? text.downloadingPdf : text.downloadPdf}
                          >
                            {isDownloadingPdf ? (
                              <div className="home-spinner h-5 w-5 animate-spin border-2" />
                            ) : (
                              <FileDown className="h-6 w-6" aria-hidden="true" />
                            )}
                          </button>
                        </span>
                      </Tooltip>
                      <span className="text-xs font-semibold leading-none text-secondary-text">
                        {downloadPdfLabel}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="home-divider border-t" />
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
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer.Root>
  );
};
