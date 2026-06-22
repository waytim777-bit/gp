import { describe, expect, it } from 'vitest';
import { buildReportPdfFilename, materializeColorsForPdf } from '../downloadReportPdf';

describe('buildReportPdfFilename', () => {
  it('builds a sanitized Chinese filename', () => {
    expect(buildReportPdfFilename('600519', '贵州茅台', 'zh')).toBe('600519_贵州茅台_分析报告.pdf');
  });

  it('builds an English filename', () => {
    expect(buildReportPdfFilename('AAPL', 'Apple', 'en')).toBe('AAPL_Apple_analysis_report.pdf');
  });

  it('strips invalid filename characters', () => {
    expect(buildReportPdfFilename('600519', 'Test/Name', 'zh')).toBe('600519_Test_Name_分析报告.pdf');
  });
});

describe('materializeColorsForPdf', () => {
  it('writes resolved rgb colors as inline styles', () => {
    const root = document.createElement('div');
    root.className = 'report-pdf-export-root';
    const child = document.createElement('p');
    child.textContent = 'hello';
    child.style.color = 'rgb(17, 24, 39)';
    root.appendChild(child);
    document.body.appendChild(root);

    materializeColorsForPdf(root);

    expect(child.style.getPropertyValue('color')).toBe('rgb(17, 24, 39)');

    document.body.removeChild(root);
  });
});
