import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Tag, Button, Space, Typography, message, Spin, Empty, Descriptions, List } from 'antd';
import type { TableColumnsType } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined, DashboardOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { fetchAdminUsers, fetchAdminUserEvents } from '../../api/admin';
import type { AdminUser, AdminEvent } from '../../api/admin';

/* ---------- 事件名 → 中文标签 ---------- */
const EVENT_LABELS: Record<string, string> = {
  page_enter: '进入页面',
  tab_switch: '切换标签',
  jd_analysis_start: '开始 JD 拆解',
  jd_analysis_done: '完成 JD 拆解',
  jd_file_upload: '上传 JD 文件',
  jd_share_click: '点击 JD 分享',
  jd_share_done: '完成 JD 分享',
  jd_pdf_export: '导出 JD PDF',
  jd_pdf_export_done: 'JD PDF 导出完成',
  jd_png_export: '导出 JD PNG',
  jd_png_export_done: 'JD PNG 导出完成',
  resume_analysis_start: '开始简历拆解',
  resume_analysis_done: '完成简历拆解',
  resume_rewrite_start: '开始简历改写',
  resume_rewrite_done: '完成简历改写',
  resume_self_eval_start: '开始简历自评',
  resume_self_eval_done: '完成简历自评',
  resume_share_click: '点击简历分享',
  resume_share_done: '完成简历分享',
  resume_pdf_export: '导出简历 PDF',
  resume_pdf_export_done: '简历 PDF 导出完成',
  resume_png_export: '导出简历 PNG',
  resume_png_export_done: '简历 PNG 导出完成',
  interview_archive_start: '开始面试复盘',
  interview_archive_done: '完成面试复盘',
  interview_share_click: '点击面试分享',
  interview_share_done: '完成面试分享',
  interview_pdf_export: '导出面试 PDF',
  interview_pdf_export_done: '面试 PDF 导出完成',
  growth_archive_pdf_export: '导出成长档案 PDF',
  growth_archive_pdf_export_done: '成长档案 PDF 导出完成',
  result_feedback: '结果反馈',
  global_feedback: '全局反馈',
  coaching_remind_click: '点击陪练上线提醒',
  click: '点击',
  error_client: '客户端错误',
};

const fmtTime = (ts: number | null | undefined): string => {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const fmtDateTime = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

function planTag(u: AdminUser) {
  if (u.subscribed && u.capabilities.includes('jobpass')) return <Tag color="gold">求职通</Tag>;
  if (u.subscribed && u.capabilities.includes('monthly')) return <Tag color="geekblue">月卡</Tag>;
  return <Tag color="default">免费</Tag>;
}

// extra → 一行摘要（优先挑有信息量的字符串字段）
function extraSummary(extra: Record<string, any>): string {
  if (!extra || Object.keys(extra).length === 0) return '';
  const prefer = ['category', 'result_type', 'rating', 'from_tab', 'to_tab', 'path', 'error', 'comment', 'content'];
  const picked: string[] = [];
  for (const k of prefer) {
    const v = extra[k];
    if (v !== undefined && v !== null && v !== '') {
      if (typeof v === 'object') picked.push(`${k}=${JSON.stringify(v)}`);
      else picked.push(`${k}=${String(v)}`);
    }
    if (picked.length >= 3) break;
  }
  if (picked.length) return picked.join(' · ');
  return JSON.stringify(extra).slice(0, 120);
}

export default function AdminPanel() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const selected = users.find((u) => u.id === selectedId) || null;

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchAdminUsers();
      setUsers(list);
    } catch (e: any) {
      message.error(e.message || '加载用户列表失败');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const selectUser = useCallback(async (id: string) => {
    setSelectedId(id);
    setEventsLoading(true);
    try {
      setEvents(await fetchAdminUserEvents(id));
    } catch (e: any) {
      message.error(e.message || '加载事件失败');
    }
    setEventsLoading(false);
  }, []);

  const columns: TableColumnsType<AdminUser> = [
    { title: '用户名', dataIndex: 'username', key: 'username', render: (v: string, r) => (
      <Space direction="vertical" size={0}>
        <Typography.Text strong>{v}</Typography.Text>
        {r.nickname && <Typography.Text type="secondary" className="fs-12">{r.nickname}</Typography.Text>}
      </Space>
    ) },
    { title: '注册时间', dataIndex: 'createdAt', key: 'createdAt', width: 150, render: (v: number) => fmtDateTime(v) },
    { title: '额度', dataIndex: 'credits', key: 'credits', width: 70, render: (v: number, r) => r.subscribed ? '不限' : v },
    { title: '权益', dataIndex: 'subscribed', key: 'subscribed', width: 100, render: (_: any, r) => planTag(r) },
    { title: '事件数', dataIndex: 'eventCount', key: 'eventCount', width: 80 },
    { title: '最后活跃', dataIndex: 'lastActiveAt', key: 'lastActiveAt', width: 140, render: (v: number) => fmtTime(v) },
  ];

  return (
    <div className="app-shell">
      <header className="app-header">
        <Space>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>返回</Button>
          <span className="app-title fs-18">
            <DashboardOutlined className="mr-8" />
            管理看板
            <Tag bordered={false} style={{ marginLeft: 8 }}>{users.length} 位用户</Tag>
          </span>
        </Space>
        <Button icon={<ReloadOutlined />} onClick={loadUsers} loading={loading}>刷新</Button>
      </header>

      <div className="adm-body">
        {loading ? (
          <div className="hp-loading"><Spin size="large" /></div>
        ) : users.length === 0 ? (
          <Empty description="还没有用户注册" className="hp-empty" />
        ) : (
          <Table
            dataSource={users}
            rowKey="id"
            columns={columns}
            size="small"
            pagination={{ pageSize: 20, hideOnSinglePage: true }}
            onRow={(record) => ({ onClick: () => selectUser(record.id), style: { cursor: 'pointer' } })}
            rowClassName={(r) => (r.id === selectedId ? 'adm-row-selected' : '')}
          />
        )}

        {selected && (
          <div className="adm-detail">
            <Typography.Title level={5} className="mb-16">
              {selected.nickname || selected.username} 的生命周期
            </Typography.Title>

            <Descriptions size="small" column={4} bordered className="mb-16">
              <Descriptions.Item label="用户名">{selected.username}</Descriptions.Item>
              <Descriptions.Item label="注册时间">{fmtDateTime(selected.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="剩余额度">{selected.subscribed ? '不限次' : selected.credits}</Descriptions.Item>
              <Descriptions.Item label="权益">{planTag(selected)}</Descriptions.Item>
              <Descriptions.Item label="订阅到期">{selected.planExpiresAt ? fmtDateTime(selected.planExpiresAt) : '—'}</Descriptions.Item>
              <Descriptions.Item label="事件总数">{selected.eventCount}</Descriptions.Item>
              <Descriptions.Item label="最后活跃">{fmtTime(selected.lastActiveAt)}</Descriptions.Item>
              <Descriptions.Item label="用户 ID">{selected.id}</Descriptions.Item>
            </Descriptions>

            {eventsLoading ? (
              <div className="hp-loading"><Spin /></div>
            ) : events.length === 0 ? (
              <Empty description="该用户暂无行为事件" />
            ) : (
              <List
                dataSource={events}
                renderItem={(ev) => (
                  <List.Item className="adm-event">
                    <List.Item.Meta
                      title={
                        <Space>
                          <span>{EVENT_LABELS[ev.event] || ev.event}</span>
                          <Typography.Text type="secondary" className="fs-12">({ev.event})</Typography.Text>
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={2}>
                          <Typography.Text type="secondary" className="fs-12">
                            <ClockCircleOutlined className="mr-4" />{fmtDateTime(ev.ts)}
                          </Typography.Text>
                          {extraSummary(ev.extra) && (
                            <Typography.Text type="secondary" className="fs-12" style={{ wordBreak: 'break-all' }}>
                              {extraSummary(ev.extra)}
                            </Typography.Text>
                          )}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
