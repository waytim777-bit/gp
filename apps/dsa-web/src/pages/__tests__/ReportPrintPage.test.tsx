import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { publicReportsApi } from '../../api/publicReports';
import ReportPrintPage from '../ReportPrintPage';

vi.mock('../../api/publicReports', () => ({
  publicReportsApi: {
    getReportPrintData: vi.fn(),
  },
}));

vi.mock('../../components/report/ReportFullContent', () => ({
  ReportFullContent: ({ stockName, stockCode, markdown }: {
    stockName: string;
    stockCode: string;
    markdown: string;
  }) => (
    <div data-testid="report-full-content">
      {stockName} {stockCode} {markdown}
    </div>
  ),
}));

describe('ReportPrintPage', () => {
  const printWindow = window as Window & {
    __DSA_REPORT_READY__?: boolean;
    __DSA_REPORT_ERROR__?: string;
  };

  it('loads print data and marks the page ready', async () => {
    vi.mocked(publicReportsApi.getReportPrintData).mockResolvedValue({
      report: {
        meta: {
          queryId: 'q1',
          stockCode: 'AAPL',
          stockName: 'Apple',
          reportType: 'detailed',
          reportLanguage: 'en',
          createdAt: '2026-01-01T00:00:00',
        },
        summary: {
          analysisSummary: '',
          operationAdvice: '',
          trendPrediction: '',
          sentimentScore: 50,
        },
      },
      markdown: '# Full report',
    });

    render(
      <MemoryRouter initialEntries={['/reports/123/print?token=t1']}>
        <Routes>
          <Route path="/reports/:recordId/print" element={<ReportPrintPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(document.documentElement).toHaveClass('light');
    expect(document.documentElement).not.toHaveClass('dark');
    expect(await screen.findByTestId('report-full-content')).toHaveTextContent('Apple AAPL # Full report');
    expect(publicReportsApi.getReportPrintData).toHaveBeenCalledWith('123', 't1');
    await waitFor(() => {
      expect(printWindow.__DSA_REPORT_READY__).toBe(true);
    });
    expect(printWindow.__DSA_REPORT_ERROR__).toBe('');
  });

  it('marks print errors so backend does not download the error page', async () => {
    vi.mocked(publicReportsApi.getReportPrintData).mockRejectedValue(new Error('forbidden'));

    render(
      <MemoryRouter initialEntries={['/reports/123/print?token=bad']}>
        <Routes>
          <Route path="/reports/:recordId/print" element={<ReportPrintPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('报告加载失败')).toBeInTheDocument();
    expect(printWindow.__DSA_REPORT_READY__).toBe(true);
    expect(printWindow.__DSA_REPORT_ERROR__).toBe('报告加载失败: forbidden');
  });
});
