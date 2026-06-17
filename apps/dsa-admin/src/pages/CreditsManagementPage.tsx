import { Button, InputNumber, Modal, Space, Table, Typography, Input } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMemo, useState } from 'react'
import { useAdminData } from '../hooks/useAdminData'
import type { User } from '../types'

const { Title, Text } = Typography

function formatCredits(value: number | null | undefined) {
  return (value ?? 0).toLocaleString()
}

export function CreditsManagementPage() {
  const { users, loading, savingUserId, adjustUserCredits } = useAdminData()
  const [keyword, setKeyword] = useState('')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [delta, setDelta] = useState<number>(0)
  const [reason, setReason] = useState<string>('')

  const filteredUsers = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return users
    return users.filter((u) => u.username.toLowerCase().includes(kw) || String(u.id).includes(kw))
  }, [keyword, users])

  const columns: ColumnsType<User> = [
    {
      title: '用户',
      dataIndex: 'username',
      render: (_, user) => (
        <Space direction="vertical" size={0}>
          <Text strong>{user.username}</Text>
          <Text type="secondary">id={user.id}</Text>
        </Space>
      ),
    },
    {
      title: '积分余额',
      dataIndex: 'creditBalance',
      width: 160,
      align: 'right',
      render: (_, user) => (
        <Space direction="vertical" size={0}>
          <Text strong>{formatCredits(user.creditBalance)}</Text>
          <Text type="secondary">累计 {formatCredits(user.lifetimeCredits)}</Text>
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_, user) => (
        <Button
          type="primary"
          onClick={() => {
            setSelectedUser(user)
            setDelta(0)
            setReason('')
          }}
          loading={savingUserId === user.id}
        >
          调整积分
        </Button>
      ),
    },
  ]

  return (
    <>
      <Space className="table-title" style={{ marginBottom: 12 }}>
        <Title level={5}>积分管理</Title>
        <Text type="secondary">管理员可为用户增加或减少积分（支持负数扣减）。</Text>
      </Space>

      <div style={{ marginBottom: 12, maxWidth: 360 }}>
        <Input
          placeholder="按用户名或用户ID搜索"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          allowClear
        />
      </div>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={filteredUsers}
        pagination={false}
      />

      <Modal
        open={Boolean(selectedUser)}
        title={selectedUser ? `调整积分：${selectedUser.username} (id=${selectedUser.id})` : '调整积分'}
        okText="确认调整"
        cancelText="取消"
        confirmLoading={selectedUser ? savingUserId === selectedUser.id : false}
        onCancel={() => setSelectedUser(null)}
        onOk={async () => {
          if (!selectedUser) return
          const n = Number(delta)
          if (!Number.isFinite(n) || n === 0) return
          await adjustUserCredits(selectedUser, Math.trunc(n), reason)
          setSelectedUser(null)
        }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <Text strong>增减积分（可为负数）</Text>
            <div style={{ marginTop: 8 }}>
              <InputNumber
                style={{ width: '100%' }}
                value={delta}
                onChange={(v) => setDelta(Number(v ?? 0))}
                placeholder="例如：+1000 或 -200"
              />
            </div>
          </div>
          <div>
            <Text strong>原因（可选）</Text>
            <div style={{ marginTop: 8 }}>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="例如：补偿、退款、手工调整"
                allowClear
              />
            </div>
          </div>
          <Text type="secondary">
            注意：余额不会变为负数；若扣减超过余额，将扣到 0 为止。
          </Text>
        </Space>
      </Modal>
    </>
  )
}

