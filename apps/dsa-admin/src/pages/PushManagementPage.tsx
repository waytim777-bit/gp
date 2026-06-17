import {
  Alert,
  Button,
  Card,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getErrorMessage, requestJson } from '../api'

const { Title, Text } = Typography

type OverviewRow = {
  subscriptionId: number
  userId: number
  username: string
  isAdmin?: boolean
  creditBalance: number
  notificationEmail: string
  hasWebhook: boolean
  code: string
  name: string
  market: string
  intervalDays: number
  intervalLabel: string
  status: string
  nextPushOn?: string | null
  lastPushedOn?: string | null
  creditsPerPush: number
  isDueToday: boolean
  lastPushStatus?: string | null
  lastPushAt?: string | null
  lastPushError?: string
}

type PushLogItem = {
  id: number
  subscriptionId: number
  userId: number
  username: string
  code: string
  pushedOn?: string | null
  channel: string
  status: string
  creditsCharged: number
  errorMessage: string
  createdAt?: string | null
}

type OverviewResponse = {
  rows: OverviewRow[]
  recentLogs: PushLogItem[]
  stats: {
    totalSubscriptions: number
    activeSubscriptions: number
    dueToday: number
  }
}

type DueStockItem = {
  code: string
  name: string
  market: string
  analysisDate: string
  marketOpen: boolean
  dueSubscriptionCount: number
  hasAnalysisCache: boolean
}

type DueTodayResponse = {
  dueSubscriptionCount: number
  stockCount: number
  stocks: DueStockItem[]
}

type AnalyzeResponse = {
  dueSubscriptionCount: number
  stockCount: number
  codesAnalyzed: number
  codesCached: number
  codesFailed: number
  results: Array<{ code: string; status: string; cached: boolean; message: string }>
  errors: string[]
}

type DeliverResponse = {
  dueCount: number
  pushesSuccess: number
  pushesFailed: number
  pushesSkipped: number
  creditsCharged: number
  errors: string[]
}

function statusTag(status?: string | null) {
  if (!status) return <Tag>未推送</Tag>
  if (status === 'success') return <Tag color="green">成功</Tag>
  if (status === 'skipped') return <Tag>跳过</Tag>
  if (status === 'failed') return <Tag color="red">失败</Tag>
  return <Tag>{status}</Tag>
}

export function PushManagementPage() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null)
  const [duePreview, setDuePreview] = useState<DueTodayResponse | null>(null)
  const [loadingOverview, setLoadingOverview] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [delivering, setDelivering] = useState(false)
  const [lastAnalyze, setLastAnalyze] = useState<AnalyzeResponse | null>(null)
  const [lastDeliver, setLastDeliver] = useState<DeliverResponse | null>(null)

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true)
    try {
      const data = await requestJson<OverviewResponse>('/api/v1/admin/subscription-push/overview')
      setOverview(data)
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoadingOverview(false)
    }
  }, [])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  const handleScanDue = async () => {
    setScanning(true)
    try {
      const data = await requestJson<DueTodayResponse>('/api/v1/admin/subscription-push/due-today')
      setDuePreview(data)
      message.success(`扫描完成：${data.stockCount} 只股票，${data.dueSubscriptionCount} 条到期订阅`)
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setScanning(false)
    }
  }

  const handleAnalyze = async () => {
    setAnalyzing(true)
    try {
      const data = await requestJson<AnalyzeResponse>('/api/v1/admin/subscription-push/analyze', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setLastAnalyze(data)
      message.success(`分析完成：新增 ${data.codesAnalyzed}，缓存 ${data.codesCached}，失败 ${data.codesFailed}`)
      await loadOverview()
      await handleScanDue()
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setAnalyzing(false)
    }
  }

  const handleDeliver = async () => {
    setDelivering(true)
    try {
      const data = await requestJson<DeliverResponse>('/api/v1/admin/subscription-push/deliver', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setLastDeliver(data)
      message.success(`推送完成：成功 ${data.pushesSuccess}，失败 ${data.pushesFailed}，跳过 ${data.pushesSkipped}`)
      await loadOverview()
      await handleScanDue()
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setDelivering(false)
    }
  }

  const overviewColumns: ColumnsType<OverviewRow> = useMemo(
    () => [
      { title: '用户', dataIndex: 'username', width: 140, render: (value: string, row) => (
          <Space>
            <span>{value}</span>
            {row.isAdmin ? <Tag color="red">管理员</Tag> : null}
          </Space>
        ) },
      {
        title: '积分',
        dataIndex: 'creditBalance',
        width: 90,
        align: 'right',
        render: (value: number) => value.toLocaleString(),
      },
      {
        title: '推送方式',
        key: 'destination',
        width: 180,
        render: (_, row) => (
          <Space direction="vertical" size={0}>
            <Text>{row.notificationEmail || '-'}</Text>
            {row.hasWebhook ? <Text type="secondary">Webhook</Text> : null}
          </Space>
        ),
      },
      {
        title: '股票',
        key: 'stock',
        render: (_, row) => (
          <Space direction="vertical" size={0}>
            <Text strong>{row.code}</Text>
            {row.name ? <Text type="secondary">{row.name}</Text> : null}
          </Space>
        ),
      },
      { title: '间隔', dataIndex: 'intervalLabel', width: 90 },
      {
        title: '状态',
        dataIndex: 'status',
        width: 90,
        render: (value: string) => (
          <Tag color={value === 'active' ? 'green' : 'default'}>
            {value === 'active' ? '活跃' : '已暂停'}
          </Tag>
        ),
      },
      {
        title: '今日到期',
        dataIndex: 'isDueToday',
        width: 90,
        render: (value: boolean) => (value ? <Tag color="orange">是</Tag> : <Tag>否</Tag>),
      },
      { title: '下次推送', dataIndex: 'nextPushOn', width: 120, render: (v) => v ?? '-' },
      {
        title: '最近推送',
        key: 'lastPush',
        width: 140,
        render: (_, row) => (
          <Space direction="vertical" size={0}>
            {statusTag(row.lastPushStatus)}
            {row.lastPushError ? <Text type="danger">{row.lastPushError}</Text> : null}
          </Space>
        ),
      },
    ],
    [],
  )

  const dueColumns: ColumnsType<DueStockItem> = [
    { title: '代码', dataIndex: 'code', width: 100 },
    { title: '名称', dataIndex: 'name' },
    { title: '市场', dataIndex: 'market', width: 80 },
    { title: '分析日', dataIndex: 'analysisDate', width: 120 },
    {
      title: '交易日',
      dataIndex: 'marketOpen',
      width: 90,
      render: (value: boolean) => (value ? <Tag color="green">是</Tag> : <Tag color="red">否</Tag>),
    },
    { title: '到期订阅数', dataIndex: 'dueSubscriptionCount', width: 110 },
    {
      title: '分析缓存',
      dataIndex: 'hasAnalysisCache',
      width: 100,
      render: (value: boolean) => (value ? <Tag color="blue">已有</Tag> : <Tag>未分析</Tag>),
    },
  ]

  const logColumns: ColumnsType<PushLogItem> = [
    { title: '时间', dataIndex: 'createdAt', width: 180, render: (v) => v ?? '-' },
    { title: '用户', dataIndex: 'username', width: 120 },
    { title: '股票', dataIndex: 'code', width: 100 },
    { title: '渠道', dataIndex: 'channel', width: 100 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (value: string) => statusTag(value),
    },
    { title: '扣费', dataIndex: 'creditsCharged', width: 80 },
    { title: '说明', dataIndex: 'errorMessage' },
  ]

  return (
    <div className="admin-settings-page">
      <div className="table-title">
        <div>
          <Title level={5}>推送管理</Title>
          <Text type="secondary">手动扫描到期订阅、执行共享分析并按用户推送扣费。</Text>
        </div>
        <Space>
          <Button onClick={() => void loadOverview()} loading={loadingOverview}>
            刷新
          </Button>
        </Space>
      </div>

      <Space size="large" wrap style={{ marginBottom: 16 }}>
        <Card size="small">
          <Statistic title="订阅总数" value={overview?.stats.totalSubscriptions ?? 0} />
        </Card>
        <Card size="small">
          <Statistic title="活跃订阅" value={overview?.stats.activeSubscriptions ?? 0} />
        </Card>
        <Card size="small">
          <Statistic title="今日到期" value={overview?.stats.dueToday ?? 0} />
        </Card>
      </Space>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="推荐流程"
        description="A 扫描今日到期股票 → B 立即分析（同股只分析一次）→ C 立即推送（成功后才扣用户积分）。订阅数据来自 C 端「我的订阅」，包含管理员账号的订阅；系统设置里的自选股列表不会出现在此表。"
      />

      <Space wrap style={{ marginBottom: 16 }}>
        <Button type="default" loading={scanning} onClick={() => void handleScanDue()}>
          A. 扫描今日到期股票
        </Button>
        <Button type="primary" loading={analyzing} onClick={() => void handleAnalyze()}>
          B. 立即分析
        </Button>
        <Button type="primary" danger loading={delivering} onClick={() => void handleDeliver()}>
          C. 立即推送
        </Button>
      </Space>

      {duePreview ? (
        <Card title={`今日到期股票（${duePreview.stockCount}）`} size="small" style={{ marginBottom: 16 }}>
          <Table
            rowKey="code"
            size="small"
            pagination={false}
            columns={dueColumns}
            dataSource={duePreview.stocks}
          />
        </Card>
      ) : null}

      {lastAnalyze ? (
        <Alert
          style={{ marginBottom: 16 }}
          type={lastAnalyze.codesFailed > 0 ? 'warning' : 'success'}
          message={`分析结果：新增 ${lastAnalyze.codesAnalyzed}，缓存 ${lastAnalyze.codesCached}，失败 ${lastAnalyze.codesFailed}`}
        />
      ) : null}

      {lastDeliver ? (
        <Alert
          style={{ marginBottom: 16 }}
          type={lastDeliver.pushesFailed > 0 ? 'warning' : 'success'}
          message={`推送结果：成功 ${lastDeliver.pushesSuccess}，失败 ${lastDeliver.pushesFailed}，跳过 ${lastDeliver.pushesSkipped}，扣费 ${lastDeliver.creditsCharged}`}
        />
      ) : null}

      <Card title="订阅总览" size="small" style={{ marginBottom: 16 }}>
        <Table
          rowKey="subscriptionId"
          size="small"
          loading={loadingOverview}
          columns={overviewColumns}
          dataSource={overview?.rows ?? []}
          scroll={{ x: 1100 }}
          pagination={{ pageSize: 20, showSizeChanger: true }}
        />
      </Card>

      <Card title="最近推送记录" size="small">
        <Table
          rowKey="id"
          size="small"
          loading={loadingOverview}
          columns={logColumns}
          dataSource={overview?.recentLogs ?? []}
          pagination={{ pageSize: 20, showSizeChanger: true }}
        />
      </Card>
    </div>
  )
}
