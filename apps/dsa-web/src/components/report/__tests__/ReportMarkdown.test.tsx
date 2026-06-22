import type React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { historyApi } from '../../../api/history';
import { ReportMarkdown } from '../ReportMarkdown';

vi.mock('../../../api/history', () => ({
  historyApi: {
    getMarkdown: vi.fn(),
    enableShareLink: vi.fn().mockResolvedValue({
      historyId: 1,
      shareToken: 'abc123',
      sharePath: '/r/abc123',
      enabled: true,
    }),
  },
}));

const downloadReportPdfMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../utils/downloadReportPdf', async () => {
  const actual = await vi.importActual<typeof import('../../../utils/downloadReportPdf')>(
    '../../../utils/downloadReportPdf',
  );
  return {
    ...actual,
    downloadReportPdf: (...args: unknown[]) => downloadReportPdfMock(...args),
  };
});

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Area: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

describe('ReportMarkdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    downloadReportPdfMock.mockResolvedValue(undefined);
  });

  it('uses localized copy labels for English reports', async () => {
    vi.mocked(historyApi.getMarkdown).mockResolvedValue('# Full report');

    render(
      <ReportMarkdown
        recordId={1}
        stockName="Apple"
        stockCode="AAPL"
        reportLanguage="en"
        onClose={() => {}}
      />
    );

    expect(await screen.findByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeInTheDocument();
  });

  it('renders company profile before markdown content', async () => {
    vi.mocked(historyApi.getMarkdown).mockResolvedValue('# Full report');

    render(
      <ReportMarkdown
        recordId={1}
        stockName="Apple"
        stockCode="AAPL"
        reportLanguage="en"
        details={{
          companyProfile: {
            fullName: 'Apple Inc.',
            industry: 'Consumer Electronics',
            legalRepresentative: 'Tim Cook',
            manager: 'Jeff Williams',
            boardSecretary: 'Katherine Adams',
            companyIntro: 'Apple designs consumer technology products and services.',
            actualController: 'Public shareholders',
          },
        }}
        onClose={() => {}}
      />,
    );

    expect(await screen.findByText('Company Basics')).toBeInTheDocument();
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getByText('Company Introduction')).toBeInTheDocument();
    expect(screen.getByText('Apple designs consumer technology products and services.')).toBeInTheDocument();
    expect(screen.getByText('Core Management')).toBeInTheDocument();
    expect(screen.getByText('Tim Cook')).toBeInTheDocument();
    expect(screen.getByText('Jeff Williams')).toBeInTheDocument();
    expect(screen.getByText('Katherine Adams')).toBeInTheDocument();
    expect(screen.queryByText('Public shareholders')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Full report' })).toBeInTheDocument();
  });

  it('renders business model before markdown content', async () => {
    vi.mocked(historyApi.getMarkdown).mockResolvedValue('# Full report');

    render(
      <ReportMarkdown
        recordId={1}
        stockName="CloudCo"
        stockCode="CLOUD"
        reportLanguage="en"
        details={{
          businessModel: {
            summary: 'CloudCo sells recurring cloud infrastructure services.',
            items: [
              {
                title: 'Commercial model',
                content: 'Enterprise subscriptions and usage fees anchor revenue.',
              },
            ],
          },
        }}
        onClose={() => {}}
      />,
    );

    expect(await screen.findByText('Business Model')).toBeInTheDocument();
    expect(screen.getByText('Commercial model')).toBeInTheDocument();
    expect(screen.getByText(/Enterprise subscriptions/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Full report' })).toBeInTheDocument();
  });

  it('renders profitability before markdown content', async () => {
    vi.mocked(historyApi.getMarkdown).mockResolvedValue('# Full report');

    render(
      <ReportMarkdown
        recordId={1}
        stockName="Apple"
        stockCode="AAPL"
        reportLanguage="zh"
        details={{
          financialReport: {
            profitability: {
              rows: [
                { period: '2025-12-31', grossMargin: 42.61, netMargin: 28.2, roe: 43.84 },
              ],
            },
          },
          profitabilityAnalysis: {
            summary: '公司盈利能力持续提升，2025年毛利率达42.61%。',
            items: [{ title: '成本控制', content: '净利率和ROE维持高位。' }],
          },
        }}
        onClose={() => {}}
      />,
    );

    expect(await screen.findByText('盈利能力')).toBeInTheDocument();
    expect(screen.getByText(/公司盈利能力持续提升/)).toBeInTheDocument();
    expect(screen.getByText('盈利能力趋势（毛利率）')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Full report' })).toBeInTheDocument();
  });

  it('renders multi-model consultation before markdown content', async () => {
    vi.mocked(historyApi.getMarkdown).mockResolvedValue('# Full report');

    render(
      <ReportMarkdown
        recordId={1}
        stockName="CloudCo"
        stockCode="CLOUD"
        reportLanguage="zh"
        details={{
          modelOpinions: {
            primaryModel: 'primary-model',
            opinions: [
              {
                role: 'consultation',
                model: 'consult-a',
                success: true,
                sentimentScore: 72,
                summary: '会诊模型 A 观点',
              },
              {
                role: 'primary',
                model: 'primary-model',
                success: true,
                sentimentScore: 68,
                summary: '主模型观点',
              },
            ],
          },
        }}
        onClose={() => {}}
      />,
    );

    expect(await screen.findByText('多模型会诊')).toBeInTheDocument();
    expect(screen.getByText(/独立会诊 · 共享事实 · 1 个模型 · 先阅会诊后看主模型/)).toBeInTheDocument();
    expect(screen.getByText('会诊模型 A 观点')).toBeInTheDocument();
    expect(screen.getByText('主模型观点')).toBeInTheDocument();
  });

  it('downloads the full report as PDF', async () => {
    vi.mocked(historyApi.getMarkdown).mockResolvedValue('# Full report');

    render(
      <ReportMarkdown
        recordId={1}
        stockName="Apple"
        stockCode="AAPL"
        reportLanguage="en"
        onClose={() => {}}
      />,
    );

    const downloadPdfButton = await screen.findByRole('button', { name: 'Download PDF' });
    fireEvent.click(downloadPdfButton);

    await waitFor(() => {
      expect(downloadReportPdfMock).toHaveBeenCalledTimes(1);
    });
    expect(downloadReportPdfMock.mock.calls[0]?.[1]).toBe('AAPL_Apple_analysis_report.pdf');
  });
});
