import { toCamelCase } from './utils';
import { publicApiClient } from './publicApiClient';
import type { AnalysisReport } from '../types/analysis';

export interface PublicSharedReportPayload {
  shareToken: string;
  sharePath: string;
  report: AnalysisReport;
  markdown: string;
}

export interface ReportPrintPayload {
  report: AnalysisReport;
  markdown: string;
}

export interface ReportShareLinkPayload {
  historyId: number;
  shareToken: string;
  sharePath: string;
  enabled: boolean;
  createdAt?: string;
}

export const publicReportsApi = {
  getSharedReport: async (shareToken: string): Promise<PublicSharedReportPayload> => {
    const response = await publicApiClient.get<Record<string, unknown>>(
      `/api/v1/public/reports/${encodeURIComponent(shareToken)}`,
    );
    return toCamelCase<PublicSharedReportPayload>(response.data);
  },

  getReportPrintData: async (recordId: string, token: string): Promise<ReportPrintPayload> => {
    const response = await publicApiClient.get<Record<string, unknown>>(
      `/api/v1/public/report-print/${encodeURIComponent(recordId)}`,
      { params: { token } },
    );
    return toCamelCase<ReportPrintPayload>(response.data);
  },
};

export function buildShareReportUrl(sharePath: string): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${sharePath}`;
  }
  return sharePath;
}

export async function writeTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to execCommand below.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

export function shouldUseNativeShare(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return false;
  }
  // Desktop browsers may expose Web Share API but users expect clipboard copy.
  return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
}

export async function copyShareReportUrl(sharePath: string): Promise<string> {
  const url = buildShareReportUrl(sharePath);
  await writeTextToClipboard(url);
  return url;
}

export async function shareReportLink(sharePath: string, title: string): Promise<string> {
  const url = buildShareReportUrl(sharePath);
  await copyShareReportUrl(sharePath);

  if (shouldUseNativeShare()) {
    try {
      await navigator.share({ title, url });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return url;
      }
    }
  }

  return url;
}
