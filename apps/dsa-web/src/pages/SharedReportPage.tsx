import type React from 'react';
import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FileDown, Share2 } from 'lucide-react';
import { publicReportsApi, shareReportLink } from '../api/publicReports';
import { getParsedApiError, createParsedApiError, type ParsedApiError } from '../api/error';
import { ApiErrorAlert } from '../components/common';
import { ReportFullContent } from '../components/report/ReportFullContent';
import { buildReportPdfFilename, downloadReportPdf } from '../utils/downloadReportPdf';
import { getReportText, normalizeReportLanguage } from '../utils/reportLanguage';
import type { AnalysisReport } from '../types/analysis';

const SharedReportPage: React.FC = () => {
  const { token = '' } = useParams();
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ParsedApiError | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [pdfError, setPdfError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await publicReportsApi.getSharedReport(token);
        if (!cancelled) {
          setReport(payload.report);
          setMarkdown(payload.markdown);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getParsedApiError(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    if (token) {
      void load();
    } else {
      setLoading(false);
      setError(createParsedApiError({
        title: '链接无效',
        message: '分享链接无效',
        category: 'unknown',
      }));
    }
    return () => {
      cancelled = true;
    };
  }, [token]);

  const language = normalizeReportLanguage(report?.meta.reportLanguage);
  const text = getReportText(language);
  const stockName = report?.meta.stockName || '';
  const stockCode = report?.meta.stockCode || '';

  useEffect(() => {
    if (stockName || stockCode) {
      document.title = `${stockName || stockCode} - 分享报告 - DSA`;
    }
  }, [stockCode, stockName]);

  const handleDownloadPdf = useCallback(async () => {
    if (!markdown || isDownloadingPdf) {
      return;
    }
    const reportElement = document.querySelector<HTMLElement>('[data-report-print-root]');
    if (!reportElement) {
      setPdfError(text.downloadPdfFailed);
      return;
    }
    setPdfError('');
    setIsDownloadingPdf(true);
    try {
      await downloadReportPdf(
        reportElement,
        buildReportPdfFilename(stockCode, stockName, language),
      );
    } catch {
      setPdfError(text.downloadPdfFailed);
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [isDownloadingPdf, language, markdown, stockCode, stockName, text.downloadPdfFailed]);

  const handleShare = useCallback(async () => {
    const sharePath = `/r/${token}`;
    try {
      const url = await shareReportLink(sharePath, `${stockName || stockCode} ${text.fullReport}`);
      setShareMessage(`${text.shareLinkCopied}\n${url}`);
      window.setTimeout(() => setShareMessage(''), 2500);
    } catch {
      setShareMessage(text.shareFailed);
    }
  }, [stockCode, stockName, text.fullReport, text.shareFailed, text.shareLinkCopied, token]);

  return (
    <div className="min-h-screen bg-base text-foreground">
      <header className="border-b border-subtle bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs text-muted-text">{text.sharedReportBadge}</p>
            <h1 className="text-lg font-semibold">{stockName || stockCode || text.fullReport}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void handleShare(); }}
              disabled={loading || !report}
              className="home-surface-button inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
              aria-label={text.shareReport}
            >
              <Share2 className="h-4 w-4" />
              {text.shareReport}
            </button>
            <button
              type="button"
              onClick={() => { void handleDownloadPdf(); }}
              disabled={loading || !markdown || isDownloadingPdf}
              className="home-surface-button inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
              aria-label={text.downloadPdf}
            >
              {isDownloadingPdf ? (
                <div className="home-spinner h-4 w-4 animate-spin border-2" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              {text.downloadPdf}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        {shareMessage ? (
          <p className="mb-4 whitespace-pre-wrap break-all text-sm text-success">{shareMessage}</p>
        ) : null}
        {pdfError ? (
          <p className="mb-4 text-sm text-danger">{pdfError}</p>
        ) : null}
        {error ? (
          <ApiErrorAlert error={error} />
        ) : loading ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center">
            <div className="home-spinner h-10 w-10 animate-spin border-[3px]" />
            <p className="mt-4 text-sm text-secondary-text">{text.loadingReport}</p>
          </div>
        ) : report ? (
          <div className="space-y-6 pb-10">
            <section className="rounded-xl border border-subtle bg-surface/50 p-4">
              <h2 className="mb-4 text-base font-semibold">{text.fullReport}</h2>
              <ReportFullContent
                stockName={stockName}
                stockCode={stockCode}
                markdown={markdown}
                details={report.details}
                language={language}
              />
            </section>
            <p className="text-xs leading-6 text-muted-text">{text.sharedReportDisclaimer}</p>
          </div>
        ) : null}

        <div className="mt-8 text-center text-sm text-muted-text">
          <Link to="/login" className="text-cyan hover:underline">{text.loginToAnalyze}</Link>
        </div>
      </main>
    </div>
  );
};

export default SharedReportPage;
