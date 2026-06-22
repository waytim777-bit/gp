import {
  Alert,
  Button,
  Card,
  Descriptions,
  Input,
  Space,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getErrorMessage, requestJson } from '../api'

const { Title, Text, Paragraph } = Typography

type FileInfo = {
  exists: boolean
  path?: string
  sizeKb?: number
  modifiedAt?: string
}

type IndexStats = {
  exists: boolean
  total: number
  markets: Record<string, number>
}

type LookupResult = {
  canonicalCode: string
  displayCode: string
  nameZh: string
}

type StockIndexStatus = {
  indexPublic: FileInfo
  indexStatic: FileInfo
  activeIndexPath?: string | null
  indexStats: IndexStats
  csvFiles: {
    aShare: FileInfo
    hk: FileInfo
    us: FileInfo
  }
  tushareTokenConfigured: boolean
  lookupResults?: LookupResult[]
}

type TaskResponse = {
  task: string
  success: boolean
  exitCode?: number
  stdout?: string
  stderr?: string
  publish?: {
    sourcePath: string
    targetPath: string
    sizeKb: number
  } | null
  status: StockIndexStatus
}

function formatFileLine(label: string, file?: FileInfo) {
  if (!file?.exists) {
    return `${label}：未生成`
  }
  return `${label}：${file.modifiedAt ?? '-'} · ${file.sizeKb ?? 0} KB`
}

export function StockManagementPage() {
  const [status, setStatus] = useState<StockIndexStatus | null>(null)
  const [lookup, setLookup] = useState('长裕集团')
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [runningTask, setRunningTask] = useState<string | null>(null)
  const [lastOutput, setLastOutput] = useState('')

  const loadStatus = useCallback(async (lookupQuery?: string) => {
    setLoadingStatus(true)
    try {
      const query = lookupQuery?.trim()
      const url = query
        ? `/api/v1/admin/stock-index/status?lookup=${encodeURIComponent(query)}`
        : '/api/v1/admin/stock-index/status'
      const data = await requestJson<StockIndexStatus>(url)
      setStatus(data)
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoadingStatus(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const runTask = useCallback(async (taskKey: string, request: () => Promise<TaskResponse | Record<string, unknown>>) => {
    setRunningTask(taskKey)
    try {
      const data = await request()
      if ('status' in data && data.status) {
        setStatus(data.status as StockIndexStatus)
      }
      if ('stdout' in data || 'stderr' in data) {
        const stdout = String((data as TaskResponse).stdout ?? '')
        const stderr = String((data as TaskResponse).stderr ?? '')
        setLastOutput([stdout, stderr].filter(Boolean).join('\n'))
      } else {
        setLastOutput(JSON.stringify(data, null, 2))
      }
      if ('success' in data && data.success === false) {
        message.error('任务执行失败，请查看下方日志')
      } else {
        message.success('任务执行完成')
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setRunningTask(null)
    }
  }, [])

  const marketSummary = useMemo(() => {
    if (!status?.indexStats?.markets) {
      return '-'
    }
    return Object.entries(status.indexStats.markets)
      .map(([market, count]) => `${market}: ${count}`)
      .join(' · ')
  }, [status])

  return (
    <div className="admin-page">
      <Title level={3}>股票管理</Title>
      <Paragraph type="secondary">
        维护首页搜索框使用的 <Text code>stocks.index.json</Text> 自动补全索引。
        新股（如 603407 长裕集团）搜不到时，可先拉取 Tushare 列表，再生成并发布索引。
      </Paragraph>

      {!status?.tushareTokenConfigured ? (
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          message="未配置 TUSHARE_TOKEN"
          description="拉取 A/港/美列表需要在 .env 中配置 TUSHARE_TOKEN。你仍可使用已有 CSV 直接生成索引。"
        />
      ) : null}

      <Card title="当前状态" loading={loadingStatus} className="mb-4">
        <Descriptions column={1} size="small">
          <Descriptions.Item label="索引总量">
            {status?.indexStats?.total ?? 0} 条（{marketSummary}）
          </Descriptions.Item>
          <Descriptions.Item label="生效路径">
            {status?.activeIndexPath ?? '未找到索引文件'}
          </Descriptions.Item>
          <Descriptions.Item label="public 索引">
            {formatFileLine('public', status?.indexPublic)}
          </Descriptions.Item>
          <Descriptions.Item label="static 索引">
            {formatFileLine('static', status?.indexStatic)}
          </Descriptions.Item>
          <Descriptions.Item label="A股 CSV">
            {formatFileLine('A股', status?.csvFiles?.aShare)}
          </Descriptions.Item>
          <Descriptions.Item label="港股 CSV">
            {formatFileLine('港股', status?.csvFiles?.hk)}
          </Descriptions.Item>
          <Descriptions.Item label="美股 CSV">
            {formatFileLine('美股', status?.csvFiles?.us)}
          </Descriptions.Item>
        </Descriptions>

        <Space.Compact className="mt-4 w-full max-w-xl">
          <Input
            value={lookup}
            onChange={(event) => setLookup(event.target.value)}
            placeholder="试查代码或名称，如 603407 / 长裕集团"
            onPressEnter={() => { void loadStatus(lookup); }}
          />
          <Button onClick={() => { void loadStatus(lookup); }}>试查索引</Button>
        </Space.Compact>

        {status?.lookupResults && status.lookupResults.length > 0 ? (
          <Alert
            className="mt-4"
            type="success"
            showIcon
            message={`命中 ${status.lookupResults.length} 条`}
            description={(
              <ul className="mb-0 pl-4">
                {status.lookupResults.map((item) => (
                  <li key={`${item.canonicalCode}-${item.displayCode}`}>
                    {item.displayCode} · {item.nameZh} · {item.canonicalCode}
                  </li>
                ))}
              </ul>
            )}
          />
        ) : lookup.trim() && status?.lookupResults ? (
          <Alert className="mt-4" type="info" showIcon message="当前索引中未命中该关键词" />
        ) : null}
      </Card>

      <Card title="维护操作" className="mb-4">
        <Space wrap>
          <Button
            type="primary"
            loading={runningTask === 'fetch'}
            disabled={Boolean(runningTask)}
            onClick={() => void runTask('fetch', () => requestJson<TaskResponse>('/api/v1/admin/stock-index/fetch-lists', { method: 'POST' }))}
          >
            1. 拉取最新 A/港/美列表
          </Button>
          <Button
            loading={runningTask === 'generate-test'}
            disabled={Boolean(runningTask)}
            onClick={() => void runTask(
              'generate-test',
              () => requestJson<TaskResponse>('/api/v1/admin/stock-index/generate?testMode=true', { method: 'POST' }),
            )}
          >
            2. 预览生成索引
          </Button>
          <Button
            type="primary"
            loading={runningTask === 'generate'}
            disabled={Boolean(runningTask)}
            onClick={() => void runTask(
              'generate',
              () => requestJson<TaskResponse>('/api/v1/admin/stock-index/generate', { method: 'POST' }),
            )}
          >
            3. 生成并发布索引
          </Button>
          <Button
            loading={runningTask === 'publish'}
            disabled={Boolean(runningTask)}
            onClick={() => void runTask(
              'publish',
              () => requestJson<Record<string, unknown>>('/api/v1/admin/stock-index/publish', { method: 'POST' }),
            )}
          >
            仅发布到 static
          </Button>
          <Button
            loading={runningTask === 'build-web'}
            disabled={Boolean(runningTask)}
            onClick={() => void runTask(
              'build-web',
              () => requestJson<TaskResponse>('/api/v1/admin/stock-index/build-web', { method: 'POST' }),
            )}
          >
            4. 构建前端 static
          </Button>
        </Space>
        <Paragraph type="secondary" className="!mt-4 !mb-0">
          推荐顺序：拉取列表 → 预览生成 → 生成并发布。第 3 步会自动把索引复制到 <Text code>static/stocks.index.json</Text>，首页搜索即可生效；第 4 步用于完整重建 Web 静态资源。
        </Paragraph>
      </Card>

      {lastOutput ? (
        <Card title="最近任务日志">
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words text-xs">{lastOutput}</pre>
        </Card>
      ) : null}
    </div>
  )
}
