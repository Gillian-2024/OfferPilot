import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, List, Tag, Button, Empty, Space, Typography, Modal, message, Spin, Segmented } from 'antd';
import {
  ArrowLeftOutlined, DeleteOutlined, ClockCircleOutlined,
  ThunderboltOutlined, FileProtectOutlined, MessageOutlined,
} from '@ant-design/icons';
import { fetchHistory, deleteHistoryItem } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';
import { getHistory, clearHistory } from '../store/local';

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  jd: { label: 'JD 拆解', icon: <ThunderboltOutlined />, color: 'blue' },
  resume: { label: '简历拆解', icon: <FileProtectOutlined />, color: 'green' },
  interview: { label: '面试复盘', icon: <MessageOutlined />, color: 'purple' },
};

interface HistoryEntry {
  id: string;
  type: string;
  title: string;
  createdAt: string;
  source: 'server' | 'local';
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [filter, setFilter] = useState<string>('all');
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const entries: HistoryEntry[] = [];
      if (isLoggedIn) {
        // Fetch from server for each type
        const [jd, resume, interview] = await Promise.all([
          fetchHistory('jd'),
          fetchHistory('resume'),
          fetchHistory('interview'),
        ]);
        const addItems = (list: any[], type: string) => {
          for (const h of list) {
            entries.push({
              id: h.id,
              type,
              title: h.title || `${TYPE_CONFIG[type]?.label || type}`,
              createdAt: h.created_at || new Date(h.ts).toISOString(),
              source: 'server',
            });
          }
        };
        addItems(jd, 'jd');
        addItems(resume, 'resume');
        addItems(interview, 'interview');
      } else {
        // Fallback to localStorage
        const types = ['jd', 'resume', 'interview'] as const;
        for (const type of types) {
          const list = getHistory(type);
          for (const h of list) {
            entries.push({
              id: h.id,
              type,
              title: h.title || `${TYPE_CONFIG[type]?.label || type}`,
              createdAt: new Date(h.ts).toISOString(),
              source: 'local',
            });
          }
        }
      }
      // Sort by date descending
      entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setItems(entries);
    } catch {
      message.error('加载历史记录失败');
    }
    setLoading(false);
  };

  useEffect(() => { loadHistory(); }, [isLoggedIn]);

  const filtered = filter === 'all' ? items : items.filter((h) => h.type === filter);

  const handleDelete = (item: HistoryEntry) => {
    Modal.confirm({
      title: '确认删除',
      content: `删除「${item.title}」？此操作不可撤销。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          if (item.source === 'server') {
            await deleteHistoryItem(item.id);
          }
          setItems((prev) => prev.filter((h) => h.id !== item.id));
          message.success('已删除');
        } catch {
          message.error('删除失败');
        }
      },
    });
  };

  const handleClearAll = () => {
    Modal.confirm({
      title: '清空全部历史',
      content: '此操作不可撤销，确定要清空所有历史记录吗？',
      okText: '清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        if (isLoggedIn) {
          // Delete each item from server
          await Promise.all(items.map((h) => deleteHistoryItem(h.id).catch(() => {})));
        } else {
          clearHistory('jd');
          clearHistory('resume');
          clearHistory('interview');
        }
        setItems([]);
        message.success('已清空');
      },
    });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <Space>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
            返回
          </Button>
          <span className="app-title" style={{ fontSize: 18 }}>
            <ClockCircleOutlined style={{ marginRight: 8 }} />
            历史记录
            <Tag bordered={false} style={{ fontSize: 10, marginLeft: 8 }}>
              {isLoggedIn ? '云端同步' : '本地存储'}
            </Tag>
          </span>
        </Space>
        <Button
          danger
          type="text"
          icon={<DeleteOutlined />}
          disabled={!items.length}
          onClick={handleClearAll}
        >
          清空全部
        </Button>
      </header>

      <div style={{ padding: '16px 24px', maxWidth: 800, margin: '0 auto' }}>
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as string)}
          block
          options={[
            { label: `全部 (${items.length})`, value: 'all' },
            { label: `JD (${items.filter((h) => h.type === 'jd').length})`, value: 'jd' },
            { label: `简历 (${items.filter((h) => h.type === 'resume').length})`, value: 'resume' },
            { label: `面试 (${items.filter((h) => h.type === 'interview').length})`, value: 'interview' },
          ]}
          style={{ marginBottom: 16 }}
        />

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : filtered.length === 0 ? (
          <Empty description="暂无历史记录" style={{ marginTop: 64 }}>
            <Button type="primary" onClick={() => navigate('/')}>
              开始使用
            </Button>
          </Empty>
        ) : (
          <List
            dataSource={filtered}
            renderItem={(item) => {
              const cfg = TYPE_CONFIG[item.type] || { label: item.type, icon: null, color: 'default' };
              return (
                <Card
                  size="small"
                  style={{ marginBottom: 8, borderRadius: 12 }}
                  styles={{ body: { padding: '12px 16px' } }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space>
                      <Tag icon={cfg.icon} color={cfg.color} bordered={false}>{cfg.label}</Tag>
                      <Typography.Text strong>{item.title}</Typography.Text>
                    </Space>
                    <Space size={8}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {formatDate(item.createdAt)}
                      </Typography.Text>
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(item)}
                      />
                    </Space>
                  </div>
                </Card>
              );
            }}
          />
        )}
      </div>
    </div>
  );
}
