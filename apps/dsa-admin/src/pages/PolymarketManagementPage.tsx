import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getErrorMessage, requestJson } from '../api'

const { Title, Text, Paragraph } = Typography

type WatchItem = {
  id: number
  slugType: 'event' | 'market'
  slug: string
  label: string
  category: string
  enabled: boolean
  priority: number
  marketSlug?: string | null
  outcomeLabel: string
  minVolume24h?: number | null
  minLiquidity?: number | null
  notes?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

type OutcomePreview = {
  label: string
  price?: number | null
  probabilityPct?: number | null
}

type MarketPreview = {
  slug: string
  question: string
  outcomes: OutcomePreview[]
  volume24h?: number | null
  liquidity?: number | null
  active?: boolean
  closed?: boolean
}

type PreviewResponse = {
  slugType: string
  slug: string
  title: string
  question: string
  markets: MarketPreview[]
  selectedMarket?: MarketPreview | null
  selectedOutcome?: OutcomePreview | null
  fetchedAt: string
}

type WatchlistResponse = {
  items: WatchItem[]
}

type FormValues = {
  slugType: 'event' | 'market'
  slug: string
  label: string
  category: string
  enabled: boolean
  priority: number
  marketSlug?: string
  outcomeLabel: string
  minVolume24h?: number | null
  minLiquidity?: number | null
  notes?: string
}

const CATEGORY_OPTIONS = [
  { value: 'macro', label: '宏观' },
  { value: 'geopolitics', label: '地缘' },
  { value: 'policy', label: '政策' },
  { value: 'rates', label: '利率' },
  { value: 'commodity', label: '商品' },
  { value: 'other', label: '其他' },
]

function formatPct(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return '-'
  }
  return `${value.toFixed(1)}%`
}

export function PolymarketManagementPage() {
  const [items, setItems] = useState<WatchItem[]>([])
  const [loading, setLoading] = useState(true)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [lookupSlugType, setLookupSlugType] = useState<'event' | 'market'>('event')
  const [lookupSlug, setLookupSlug] = useState('')
  const [lookupMarketSlug, setLookupMarketSlug] = useState('')
  const [lookupOutcomeLabel, setLookupOutcomeLabel] = useState('Yes')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<WatchItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<FormValues>()

  const loadWatchlist = useCallback(async () => {
    setLoading(true)
    try {
      const data = await requestJson<WatchlistResponse>('/api/v1/admin/polymarket/watchlist')
      setItems(data.items)
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWatchlist()
  }, [loadWatchlist])

  const runPreview = useCallback(
    async (params: {
      slugType?: string
      slug?: string
      marketSlug?: string
      outcomeLabel?: string
      itemId?: number
    }) => {
      setPreviewLoading(true)
      try {
        const url = params.itemId
          ? `/api/v1/admin/polymarket/preview/${params.itemId}`
          : `/api/v1/admin/polymarket/preview?slugType=${encodeURIComponent(params.slugType || 'event')}&slug=${encodeURIComponent(params.slug || '')}${params.marketSlug ? `&marketSlug=${encodeURIComponent(params.marketSlug)}` : ''}&outcomeLabel=${encodeURIComponent(params.outcomeLabel || 'Yes')}`
        const data = await requestJson<PreviewResponse>(url)
        setPreview(data)
      } catch (error) {
        message.error(getErrorMessage(error))
      } finally {
        setPreviewLoading(false)
      }
    },
    [],
  )

  const openCreateModal = () => {
    setEditingItem(null)
    form.setFieldsValue({
      slugType: lookupSlugType,
      slug: lookupSlug,
      label: preview?.title || '',
      category: 'macro',
      enabled: true,
      priority: 100,
      marketSlug: lookupMarketSlug || preview?.selectedMarket?.slug || '',
      outcomeLabel: lookupOutcomeLabel,
      minVolume24h: undefined,
      minLiquidity: undefined,
      notes: '',
    })
    setEditorOpen(true)
  }

  const openEditModal = (item: WatchItem) => {
    setEditingItem(item)
    form.setFieldsValue({
      slugType: item.slugType,
      slug: item.slug,
      label: item.label,
      category: item.category,
      enabled: item.enabled,
      priority: item.priority,
      marketSlug: item.marketSlug || '',
      outcomeLabel: item.outcomeLabel,
      minVolume24h: item.minVolume24h ?? undefined,
      minLiquidity: item.minLiquidity ?? undefined,
      notes: item.notes || '',
    })
    setEditorOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const payload = {
        slugType: values.slugType,
        slug: values.slug.trim(),
        label: values.label.trim(),
        category: values.category,
        enabled: values.enabled,
        priority: values.priority,
        marketSlug: values.marketSlug?.trim() || null,
        outcomeLabel: values.outcomeLabel.trim() || 'Yes',
        minVolume24h: values.minVolume24h ?? null,
        minLiquidity: values.minLiquidity ?? null,
        notes: values.notes?.trim() || null,
      }
      if (editingItem) {
        await requestJson<WatchItem>(`/api/v1/admin/polymarket/watchlist/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        message.success('已更新关注项')
      } else {
        await requestJson<WatchItem>('/api/v1/admin/polymarket/watchlist', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        message.success('已加入关注列表')
      }
      setEditorOpen(false)
      await loadWatchlist()
    } catch (error) {
      if (error instanceof Error && error.message) {
        message.error(getErrorMessage(error))
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (item: WatchItem) => {
    Modal.confirm({
      title: '删除关注项',
      content: `确认删除 ${item.label || item.slug}？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await requestJson(`/api/v1/admin/polymarket/watchlist/${item.id}`, { method: 'DELETE' })
          message.success('已删除')
          await loadWatchlist()
        } catch (error) {
          message.error(getErrorMessage(error))
        }
      },
    })
  }

  const columns: ColumnsType<WatchItem> = useMemo(
    () => [
      { title: '优先级', dataIndex: 'priority', width: 80 },
      {
        title: '类型',
        dataIndex: 'slugType',
        width: 90,
        render: (value: WatchItem['slugType']) => (
          <Tag color={value === 'event' ? 'blue' : 'purple'}>{value}</Tag>
        ),
      },
      { title: 'Slug', dataIndex: 'slug', ellipsis: true },
      { title: '标签', dataIndex: 'label', ellipsis: true },
      { title: '分类', dataIndex: 'category', width: 90 },
      {
        title: '启用',
        dataIndex: 'enabled',
        width: 80,
        render: (value: boolean) => (value ? <Tag color="green">是</Tag> : <Tag>否</Tag>),
      },
      {
        title: '操作',
        key: 'actions',
        width: 220,
        render: (_, record) => (
          <Space size="small">
            <Button size="small" onClick={() => void runPreview({ itemId: record.id })}>
              预览
            </Button>
            <Button size="small" onClick={() => openEditModal(record)}>
              编辑
            </Button>
            <Button size="small" danger onClick={() => handleDelete(record)}>
              删除
            </Button>
          </Space>
        ),
      },
    ],
    [runPreview],
  )

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={5}>Polymarket 宏观关注</Title>
        <Paragraph type="secondary">
          维护首页宏观预测上下文所用的 Polymarket event/market slug。支持在线查询 Gamma API 预览 Yes/No 隐含概率，再一键加入关注列表。
        </Paragraph>
      </div>

      <Card title="Slug 查询预览" loading={previewLoading}>
        <Space wrap style={{ marginBottom: 16 }}>
          <Select
            value={lookupSlugType}
            style={{ width: 120 }}
            options={[
              { value: 'event', label: 'event' },
              { value: 'market', label: 'market' },
            ]}
            onChange={(value) => setLookupSlugType(value)}
          />
          <Input
            placeholder="slug，例如 fed-decision-in-october"
            value={lookupSlug}
            onChange={(event) => setLookupSlug(event.target.value)}
            style={{ width: 320 }}
          />
          <Input
            placeholder="marketSlug（event 多市场时可选）"
            value={lookupMarketSlug}
            onChange={(event) => setLookupMarketSlug(event.target.value)}
            style={{ width: 260 }}
          />
          <Input
            placeholder="关注 outcome，默认 Yes"
            value={lookupOutcomeLabel}
            onChange={(event) => setLookupOutcomeLabel(event.target.value)}
            style={{ width: 160 }}
          />
          <Button
            type="primary"
            onClick={() =>
              void runPreview({
                slugType: lookupSlugType,
                slug: lookupSlug.trim(),
                marketSlug: lookupMarketSlug.trim() || undefined,
                outcomeLabel: lookupOutcomeLabel.trim() || 'Yes',
              })
            }
            disabled={!lookupSlug.trim()}
          >
            查询预览
          </Button>
          <Button onClick={openCreateModal} disabled={!lookupSlug.trim() && !preview}>
            加入关注列表
          </Button>
        </Space>

        {preview ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text strong>{preview.title || preview.slug}</Text>
            <Text type="secondary">{preview.question}</Text>
            {preview.selectedOutcome ? (
              <Text>
                关注 outcome「{preview.selectedOutcome.label}」：
                <Text code>{formatPct(preview.selectedOutcome.probabilityPct)}</Text>
                {preview.selectedOutcome.price != null ? `（价格 ${preview.selectedOutcome.price}）` : null}
              </Text>
            ) : null}
            {preview.selectedMarket ? (
              <Text type="secondary">
                24h 成交量 {preview.selectedMarket.volume24h ?? '-'} · 流动性 {preview.selectedMarket.liquidity ?? '-'}
              </Text>
            ) : null}
            {preview.markets.length > 1 ? (
              <Table
                size="small"
                pagination={false}
                rowKey="slug"
                dataSource={preview.markets}
                columns={[
                  { title: 'Market Slug', dataIndex: 'slug', ellipsis: true },
                  { title: '问题', dataIndex: 'question', ellipsis: true },
                  {
                    title: 'Yes',
                    render: (_, record) => formatPct(record.outcomes.find((item) => item.label === 'Yes')?.probabilityPct),
                  },
                  {
                    title: 'No',
                    render: (_, record) => formatPct(record.outcomes.find((item) => item.label === 'No')?.probabilityPct),
                  },
                ]}
              />
            ) : null}
            <Text type="secondary">拉取时间：{preview.fetchedAt}</Text>
          </Space>
        ) : (
          <Text type="secondary">输入 slug 后点击「查询预览」查看 Gamma API 返回的 Yes/No 价格。</Text>
        )}
      </Card>

      <Card
        title="关注列表"
        extra={
          <Button type="primary" onClick={openCreateModal}>
            新建
          </Button>
        }
      >
        <Table rowKey="id" loading={loading} columns={columns} dataSource={items} pagination={false} />
      </Card>

      <Modal
        title={editingItem ? '编辑关注项' : '新建关注项'}
        open={editorOpen}
        onCancel={() => setEditorOpen(false)}
        onOk={() => void handleSave()}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="slugType" label="类型" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'event', label: 'event' },
                { value: 'market', label: 'market' },
              ]}
            />
          </Form.Item>
          <Form.Item name="slug" label="Slug" rules={[{ required: true, message: '请输入 slug' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="label" label="显示标签">
            <Input />
          </Form.Item>
          <Form.Item name="category" label="分类" rules={[{ required: true }]}>
            <Select options={CATEGORY_OPTIONS} />
          </Form.Item>
          <Form.Item name="priority" label="优先级（越小越靠前）" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="marketSlug" label="Market Slug（event 多市场时可选）">
            <Input />
          </Form.Item>
          <Form.Item name="outcomeLabel" label="关注 Outcome" rules={[{ required: true }]}>
            <Input placeholder="Yes" />
          </Form.Item>
          <Form.Item name="minVolume24h" label="最低 24h 成交量（可选）">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="minLiquidity" label="最低流动性（可选）">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
