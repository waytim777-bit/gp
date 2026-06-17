import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PredictionCycleBanner } from '../PredictionCycleBanner';

describe('PredictionCycleBanner', () => {
  it('renders cycle dates when metadata is present', () => {
    render(
      <PredictionCycleBanner
        cycle={{
          cycleAnchorDate: '2026-06-13',
          predictionTargetDate: '2026-06-16',
          dataAsOfDate: '2026-06-13',
          fromCache: true,
          probeCreditsCharged: 2,
        }}
        language="zh"
      />,
    );

    expect(screen.getByText('预测周期')).toBeInTheDocument();
    expect(screen.getByText('复用本周期缓存')).toBeInTheDocument();
    expect(screen.getByText('探测积分 -2')).toBeInTheDocument();
    expect(screen.getByText(/周期锚点/)).toHaveTextContent('2026-06-13');
    expect(screen.getByText(/预测目标/)).toHaveTextContent('2026-06-16');
  });

  it('renders nothing when cycle metadata is missing', () => {
    const { container } = render(<PredictionCycleBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
