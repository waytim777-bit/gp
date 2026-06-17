import { Button, Card, Form, InputNumber, Space, Typography, message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { getErrorMessage, requestJson } from '../api'

const { Title, Text, Paragraph } = Typography

type Pricing = {
  purchaseCredits: number
  sellerRewardCredits: number
  platformCredits: number
}

export function PredictionReportPricingPage() {
  const [pricing, setPricing] = useState<Pricing | null>(null)
  const [purchaseCredits, setPurchaseCredits] = useState(100)
  const [sellerRewardCredits, setSellerRewardCredits] = useState(90)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadPricing = useCallback(async () => {
    setLoading(true)
    try {
      const data = await requestJson<Pricing>('/api/v1/admin/prediction-reports/pricing')
      setPricing(data)
      setPurchaseCredits(data.purchaseCredits)
      setSellerRewardCredits(data.sellerRewardCredits)
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPricing()
  }, [loadPricing])

  const handleSave = async () => {
    setSaving(true)
    try {
      const data = await requestJson<Pricing>('/api/v1/admin/prediction-reports/pricing', {
        method: 'PATCH',
        body: JSON.stringify({
          purchaseCredits,
          sellerRewardCredits,
        }),
      })
      setPricing(data)
      message.success('预测报告价格已更新（仅影响新分享的上架价格）')
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={5}>预测报告市场定价</Title>
        <Paragraph type="secondary">
          配置用户购买与分享者收益积分。修改后仅对新分享的报告生效，已上架条目保留分享时的快照价格。
        </Paragraph>
      </div>

      <Card loading={loading}>
        <Form layout="vertical" style={{ maxWidth: 360 }}>
          <Form.Item label="购买价格（积分）">
            <InputNumber min={1} value={purchaseCredits} onChange={(value) => setPurchaseCredits(Number(value || 1))} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="分享者收益（积分）">
            <InputNumber min={0} max={purchaseCredits} value={sellerRewardCredits} onChange={(value) => setSellerRewardCredits(Number(value || 0))} style={{ width: '100%' }} />
          </Form.Item>
          {pricing ? (
            <Text type="secondary">平台抽成：{Math.max(0, purchaseCredits - sellerRewardCredits)} 积分</Text>
          ) : null}
          <Button type="primary" onClick={() => void handleSave()} loading={saving} style={{ marginTop: 16 }}>
            保存定价
          </Button>
        </Form>
      </Card>
    </Space>
  )
}
