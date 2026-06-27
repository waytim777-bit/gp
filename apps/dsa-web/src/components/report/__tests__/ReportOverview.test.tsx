import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReportOverview } from '../ReportOverview';

const baseMeta = {
  queryId: 'q-1',
  stockCode: '600519',
  stockName: '贵州茅台',
  reportType: 'detailed' as const,
  reportLanguage: 'zh' as const,
  createdAt: '2026-03-21T08:00:00Z',
};

const baseSummary = {
  analysisSummary: '趋势维持强势',
  operationAdvice: '继续观察买点',
  trendPrediction: '短线震荡偏强',
  sentimentScore: 78,
};

describe('ReportOverview', () => {
  it('renders company profile basics with website link', () => {
    render(
      <ReportOverview
        meta={{ ...baseMeta, reportLanguage: 'en', stockName: 'Apple' }}
        summary={baseSummary}
        details={{
          companyProfile: {
            fullName: 'Apple Inc.',
            industry: 'Consumer Electronics',
            legalRepresentative: 'Tim Cook',
            manager: 'Jeff Williams',
            boardSecretary: 'Katherine Adams',
            listingDate: '1980-12-12',
            totalShareCapital: 15000000000,
            floatShareCapital: 14900000000,
            employeeCount: 164000,
            website: 'www.apple.com',
            companyIntro: 'Apple designs consumer technology products and services.',
            actualController: 'Public shareholders',
            actualControllerHoldRatio: 12.25,
            directController: 'Board of Directors',
            controlType: 'Public company',
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'View Company Basics' }));

    expect(screen.getAllByText('Company Basics').length).toBeGreaterThan(0);
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getByText('Consumer Electronics')).toBeInTheDocument();
    expect(screen.getByText('1980-12-12')).toBeInTheDocument();
    expect(screen.getByText('Company Introduction')).toBeInTheDocument();
    expect(screen.getByText('Apple designs consumer technology products and services.')).toBeInTheDocument();
    expect(screen.getByText('Core Management')).toBeInTheDocument();
    expect(screen.getByText('Tim Cook')).toBeInTheDocument();
    expect(screen.getByText('General Manager')).toBeInTheDocument();
    expect(screen.getByText('Jeff Williams')).toBeInTheDocument();
    expect(screen.getByText('Board Secretary')).toBeInTheDocument();
    expect(screen.getByText('Katherine Adams')).toBeInTheDocument();
    expect(screen.queryByText('Public shareholders (Holding approx. 12.25%)')).not.toBeInTheDocument();
    expect(screen.queryByText('Board of Directors')).not.toBeInTheDocument();
    expect(screen.queryByText('Public company')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /www\.apple\.com/i })).toHaveAttribute(
      'href',
      'https://www.apple.com',
    );
  });

  it('renders business model section with dynamic dimensions', () => {
    render(
      <ReportOverview
        meta={{ ...baseMeta, reportLanguage: 'en', stockName: 'CloudCo' }}
        summary={baseSummary}
        details={{
          businessModel: {
            summary: 'CloudCo monetizes enterprise cloud infrastructure through subscriptions.',
            items: [
              {
                title: 'Revenue mix',
                content: 'Subscription contracts and usage-based services provide recurring revenue.',
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByText('Business Model')).toBeInTheDocument();
    expect(screen.getByText('Revenue mix')).toBeInTheDocument();
    expect(screen.getByText(/usage-based services/)).toBeInTheDocument();
    expect(screen.getByText('Core Business Model')).toBeInTheDocument();
  });

  it('uses industry board as company basics fallback', () => {
    render(
      <ReportOverview
        meta={{ ...baseMeta, reportLanguage: 'en' }}
        summary={baseSummary}
        details={{
          belongBoards: [{ name: 'Semiconductors', type: 'Industry' }],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'View Company Basics' }));

    expect(screen.getAllByText('Company Basics').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Semiconductors').length).toBeGreaterThan(0);
  });

  it('uses Chinese industry board as company basics fallback', () => {
    render(
      <ReportOverview
        meta={{ ...baseMeta, reportLanguage: 'en' }}
        summary={baseSummary}
        details={{
          belongBoards: [{ name: 'Baijiu', type: '行业' }],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'View Company Basics' }));

    expect(screen.getAllByText('Company Basics').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Baijiu').length).toBeGreaterThan(0);
  });

  it('renders related board names in the overview summary strip', () => {
    render(
      <ReportOverview
        meta={baseMeta}
        summary={baseSummary}
        details={{
          belongBoards: [
            { name: ' 白酒 ', type: '行业' },
            { name: '消费', type: '概念' },
            { name: '新能源' },
          ],
          sectorRankings: {
            top: [{ name: '白酒', changePct: 2.31 }],
            bottom: [{ name: '消费', changePct: -1.2 }],
          },
        }}
      />,
    );

    expect(screen.getByText('关联板块')).toBeInTheDocument();
    expect(screen.getAllByText('白酒').length).toBeGreaterThan(0);
    expect(screen.getByText('消费')).toBeInTheDocument();
    expect(screen.getByText('新能源')).toBeInTheDocument();
    expect(screen.queryByText('行业')).not.toBeInTheDocument();
    expect(screen.queryByText('领涨')).not.toBeInTheDocument();
    expect(screen.queryByText('+2.31%')).not.toBeInTheDocument();
    expect(screen.queryByText('领跌')).not.toBeInTheDocument();
    expect(screen.queryByText('-1.20%')).not.toBeInTheDocument();
    expect(screen.queryByText('中性')).not.toBeInTheDocument();
  });

  it('shows board list when rankings are unavailable', () => {
    render(
      <ReportOverview
        meta={baseMeta}
        summary={baseSummary}
        details={{
          belongBoards: [{ name: '半导体', type: '行业' }],
        }}
      />,
    );

    expect(screen.getByText('关联板块')).toBeInTheDocument();
    expect(screen.getAllByText('半导体').length).toBeGreaterThan(0);
    expect(screen.queryByText('中性')).not.toBeInTheDocument();
    expect(screen.queryByText('领涨')).not.toBeInTheDocument();
    expect(screen.queryByText('领跌')).not.toBeInTheDocument();
  });

  it('hides related boards section when no boards are available', () => {
    render(<ReportOverview meta={baseMeta} summary={baseSummary} details={{ belongBoards: [] }} />);

    expect(screen.queryByText('关联板块')).not.toBeInTheDocument();
  });

  it('renders strategy points inside the overview area when strategy is available', () => {
    render(
      <ReportOverview
        meta={baseMeta}
        summary={baseSummary}
        strategy={{
          idealBuy: '回踩企稳 MA10 附近',
          secondaryBuy: '突破 MA5 后加仓',
          stopLoss: '跌破 3.50 元退出',
          takeProfit: '第一目标 4.16 元',
        }}
        details={{ belongBoards: [] }}
      />,
    );

    expect(screen.getByText('狙击点位')).toBeInTheDocument();
    expect(screen.getByText('理想买入')).toBeInTheDocument();
    expect(screen.getByText('二次买入')).toBeInTheDocument();
    expect(screen.getByText('止损价位')).toBeInTheDocument();
    expect(screen.getByText('止盈目标')).toBeInTheDocument();
    expect(screen.getByText('回踩企稳 MA10 附近')).toBeInTheDocument();
    expect(screen.getByText('突破 MA5 后加仓')).toBeInTheDocument();
    expect(screen.getByText('跌破 3.50 元退出')).toBeInTheDocument();
    expect(screen.getByText('第一目标 4.16 元')).toBeInTheDocument();
  });

  it('does not render strategy points when strategy is unavailable', () => {
    render(<ReportOverview meta={baseMeta} summary={baseSummary} details={{ belongBoards: [] }} />);

    expect(screen.queryByText('狙击点位')).not.toBeInTheDocument();
  });

  it('renders board names when ranking payloads are malformed in the overview summary strip', () => {
    render(
      <ReportOverview
        meta={baseMeta}
        summary={baseSummary}
        details={{
          belongBoards: [{ name: ' 白酒 ' }],
          sectorRankings: {
            top: {} as unknown as never[],
            bottom: [{ name: '白酒', changePct: '-2.5%' as unknown as number }],
          },
        }}
      />,
    );

    expect(screen.getByText('关联板块')).toBeInTheDocument();
    expect(screen.getByText('白酒')).toBeInTheDocument();
    expect(screen.queryByText('领跌')).not.toBeInTheDocument();
    expect(screen.queryByText('-2.50%')).not.toBeInTheDocument();
  });
});
