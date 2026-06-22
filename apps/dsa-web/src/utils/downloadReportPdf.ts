import type { ReportLanguage } from '../types/analysis';

const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;

const PDF_MARGIN_X_MM = 12;
const PDF_MARGIN_Y_MM = 14;

export function buildReportPdfFilename(
  stockCode: string,
  stockName: string,
  language: ReportLanguage = 'zh',
): string {
  const label = language === 'en' ? 'analysis_report' : '分析报告';
  const base = [stockCode, stockName].filter(Boolean).join('_')
    .replace(INVALID_FILENAME_CHARS, '_')
    .replace(/\s+/g, '_')
    .trim();
  return `${base || 'report'}_${label}.pdf`;
}

function styleCloneForPdfExport(root: HTMLElement): void {
  root.classList.add('report-pdf-export-root');
  root.style.background = '#ffffff';
  root.style.color = '#111827';

  root.querySelectorAll<HTMLElement>('.hidden.print\\:block').forEach((element) => {
    element.classList.remove('hidden');
    element.style.display = 'block';
  });

  root.querySelectorAll<HTMLElement>('.print\\:hidden').forEach((element) => {
    element.style.display = 'none';
  });

  root.querySelectorAll<HTMLElement>('.prose-invert, .home-markdown-prose').forEach((element) => {
    element.style.color = '#374151';
  });

  root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, strong, th').forEach((element) => {
    element.style.color = '#111827';
  });

  root.querySelectorAll<HTMLElement>('.text-foreground, .text-secondary-text, .text-muted-text').forEach((element) => {
    element.style.color = '#374151';
  });

  root.querySelectorAll<SVGElement>('svg').forEach((svg) => {
    svg.style.maxWidth = '100%';
  });
}

/**
 * Render the full report DOM subtree and trigger a direct PDF download.
 */
export async function downloadReportPdf(
  source: HTMLElement,
  filename: string,
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ]);

  const staging = document.createElement('div');
  staging.setAttribute('aria-hidden', 'true');
  staging.style.cssText = 'position:fixed;left:-10000px;top:0;width:820px;background:#fff;';

  const clone = source.cloneNode(true) as HTMLElement;
  styleCloneForPdfExport(clone);
  staging.appendChild(clone);
  document.body.appendChild(staging);

  try {
    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: staging.scrollWidth,
      windowHeight: staging.scrollHeight,
    });

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const printableWidth = pageWidth - PDF_MARGIN_X_MM * 2;
    const printableHeight = pageHeight - PDF_MARGIN_Y_MM * 2;
    const imgWidth = printableWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    let offsetY = 0;
    let pageIndex = 0;

    while (offsetY < imgHeight) {
      if (pageIndex > 0) {
        pdf.addPage();
      }
      pdf.addImage(
        imgData,
        'JPEG',
        PDF_MARGIN_X_MM,
        PDF_MARGIN_Y_MM - offsetY,
        imgWidth,
        imgHeight,
      );
      offsetY += printableHeight;
      pageIndex += 1;
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(staging);
  }
}

// Kept for unit tests that assert color materialization behavior.
export function materializeColorsForPdf(root: HTMLElement): void {
  const elements: Array<HTMLElement | SVGElement> = [root];
  root.querySelectorAll<HTMLElement | SVGElement>('*').forEach((element) => {
    if (element instanceof HTMLElement || element instanceof SVGElement) {
      elements.push(element);
    }
  });

  for (const element of elements) {
    const computed = window.getComputedStyle(element);
    element.style.color = computed.color;
    element.style.backgroundColor = computed.backgroundColor;
  }
}
