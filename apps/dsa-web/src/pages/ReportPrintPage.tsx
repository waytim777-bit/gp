import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { publicReportsApi } from '../api/publicReports';
import { ReportFullContent } from '../components/report/ReportFullContent';
import type { AnalysisReport } from '../types/analysis';
import { normalizeReportLanguage } from '../utils/reportLanguage';

type PrintWindow = Window & {
  __DSA_REPORT_READY__?: boolean;
  __DSA_REPORT_ERROR__?: string;
};

const setPrintState = (value: boolean, error = '') => {
  (window as PrintWindow).__DSA_REPORT_READY__ = value;
  (window as PrintWindow).__DSA_REPORT_ERROR__ = error;
};

const ReportPrintPage = () => {
  const { recordId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [markdown, setMarkdown] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const root = document.documentElement;
    const previousClassName = root.className;
    const previousColorScheme = root.style.colorScheme;

    root.classList.remove('dark');
    root.classList.add('light');
    root.style.colorScheme = 'light';

    return () => {
      root.className = previousClassName;
      root.style.colorScheme = previousColorScheme;
    };
  }, []);

  useEffect(() => {
    setPrintState(false);
    let cancelled = false;

    const load = async () => {
      try {
        const payload = await publicReportsApi.getReportPrintData(recordId, token);
        if (!cancelled) {
          setReport(payload.report);
          setMarkdown(payload.markdown);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'unknown error';
          setError('报告加载失败');
          setPrintState(true, `报告加载失败: ${message}`);
        }
      }
    };

    if (recordId && token) {
      void load();
    } else {
      setError('报告链接无效');
      setPrintState(true, '报告链接无效');
    }

    return () => {
      cancelled = true;
    };
  }, [recordId, token]);

  useEffect(() => {
    if (report && markdown) {
      setPrintState(true);
    }
  }, [markdown, report]);

  if (error) {
    return <div className="min-h-screen bg-white p-8 text-sm text-red-600">{error}</div>;
  }

  if (!report || !markdown) {
    return <div className="min-h-screen bg-white p-8 text-sm text-slate-500">Loading...</div>;
  }

  const language = normalizeReportLanguage(report.meta.reportLanguage);
  const stockName = report.meta.stockName || '';
  const stockCode = report.meta.stockCode;

  return (
    <main className="report-print-page min-h-screen bg-white px-8 py-6 text-slate-900">
      <ReportFullContent
        stockName={stockName}
        stockCode={stockCode}
        markdown={markdown}
        details={report.details}
        language={language}
        printMode
      />
    </main>
  );
};

export default ReportPrintPage;
