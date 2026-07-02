import type React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { historyApi } from '../../../api/history';
import { ReportMarkdown } from '../ReportMarkdown';

vi.mock('../../../api/history', () => ({
  historyApi: {
    getMarkdown: vi.fn(),
    downloadPdf: vi.fn(),
    enableShareLink: vi.fn().mockResolvedValue({
      historyId: 1,
      shareToken: 'abc123',
      sharePath: '/r/abc123',
      enabled: true,
    }),
  },
}));

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
    vi.mocked(historyApi.downloadPdf).mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:report'),
      revokeObjectURL: vi.fn(),
    });
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

  it('renders important info speed read above company basics without duplicating it', async () => {
    vi.mocked(historyApi.getMarkdown).mockResolvedValue([
      '# Full report',
      '',
      '### 📰 重要信息速览',
      '',
      '**💭 舆情情绪**: 偏积极',
      '',
      '### 后续章节',
      '',
      '其他完整报告内容。',
    ].join('\n'));

    render(
      <ReportMarkdown
        recordId={1}
        stockName="Apple"
        stockCode="AAPL"
        reportLanguage="zh"
        details={{
          companyProfile: {
            fullName: '苹果公司',
            industry: '消费电子',
          },
        }}
        onClose={() => {}}
      />,
    );

    const importantInfoHeading = await screen.findByText(/重要信息速览/);
    const companyBasicsHeading = screen.getByText('基本信息');

    expect(
      importantInfoHeading.compareDocumentPosition(companyBasicsHeading)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByText(/重要信息速览/)).toHaveLength(1);
    expect(screen.getByText(/偏积极/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '后续章节' })).toBeInTheDocument();
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
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(downloadPdfButton);

    await waitFor(() => {
      expect(historyApi.downloadPdf).toHaveBeenCalledTimes(1);
    });
    expect(historyApi.downloadPdf).toHaveBeenCalledWith(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });
});
