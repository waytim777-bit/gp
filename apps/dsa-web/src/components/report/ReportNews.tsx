import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import type { ParsedApiError } from '../../api/error';
import { getParsedApiError } from '../../api/error';
import { ApiErrorAlert } from '../common';
import { Card } from '@heroui/react/card';
import { Link } from '@heroui/react';
import { DashboardStateBlock } from '../dashboard';
import { historyApi } from '../../api/history';
import type { NewsIntelItem, ReportLanguage } from '../../types/analysis';
import { getReportText, normalizeReportLanguage } from '../../utils/reportLanguage';

interface ReportNewsProps {
  recordId?: number;  // 分析历史记录主键 ID
  limit?: number;
  language?: ReportLanguage;
}

export const ReportNews: React.FC<ReportNewsProps> = ({ recordId, limit = 8, language = 'zh' }) => {
  const reportLanguage = normalizeReportLanguage(language);
  const text = getReportText(reportLanguage);
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<NewsIntelItem[]>([]);
  const [error, setError] = useState<ParsedApiError | null>(null);

  const fetchNews = useCallback(async () => {
    if (!recordId) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await historyApi.getNews(recordId, limit);
      setItems(response.items || []);
    } catch (err) {
      setError(getParsedApiError(err));
    } finally {
      setIsLoading(false);
    }
  }, [recordId, limit]);

  useEffect(() => {
    setItems([]);
    setError(null);

    if (recordId) {
      fetchNews();
    }
  }, [recordId, fetchNews]);

  if (!recordId) {
    return null;
  }

  return (
    <Card className="rounded-xl border-0 bg-surface text-left shadow-none">
      <Card.Content className="space-y-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-secondary-text">{text.newsFeed}</p>
            <h3 className="mt-1 text-lg font-semibold leading-none text-foreground">{text.relatedNews}</h3>
          </div>
          <button
            type="button"
            onClick={() => void fetchNews()}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-subtle px-2.5 text-xs font-medium text-secondary-text transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={text.refresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            {text.refresh}
          </button>
        </div>

        {error && !isLoading && (
          <ApiErrorAlert
            error={error}
            actionLabel={text.retry}
            onAction={() => void fetchNews()}
            dismissLabel={text.dismiss}
          />
        )}

        {isLoading && !error && (
          <DashboardStateBlock
            compact
            loading
            title={text.loadingNews}
          />
        )}

        {!isLoading && !error && items.length === 0 && (
          <DashboardStateBlock
            compact
            title={text.noNews}
            description={text.noNewsDescription}
            icon={(
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 14l-7-7m0 0l-7 7m7-7v18" />
              </svg>
            )}
          />
        )}

        {!isLoading && !error && items.length > 0 && (
          <div className="divide-y divide-subtle text-left">
            {items.map((item, index) => (
              <article
                key={`${item.title}-${index}`}
                className="group py-3.5 first:pt-0 last:pb-0"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-5 w-7 shrink-0 items-center justify-center rounded bg-default-100 text-[11px] font-semibold text-secondary-text">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="min-w-0 text-sm font-semibold leading-5 text-foreground">
                        {item.url ? (
                          <Link
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground hover:text-primary"
                          >
                            {item.title}
                          </Link>
                        ) : (
                          item.title
                        )}
                      </h4>
                      {item.url ? (
                        <Link
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-6 shrink-0 items-center gap-1 rounded border border-subtle px-2 text-[11px] font-medium text-secondary-text transition-colors hover:border-primary/40 hover:text-primary"
                          aria-label={text.openLink}
                        >
                          {text.openLink}
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </Link>
                      ) : null}
                    </div>
                    {item.snippet ? (
                      <p className="mt-1.5 overflow-hidden text-xs leading-5 text-secondary-text [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
                        {item.snippet}
                      </p>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card.Content>
    </Card>
  );
};
