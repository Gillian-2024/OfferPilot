import { useState } from 'react';
import { Tooltip, Dropdown, Modal, Input, message } from 'antd';
import type { MenuProps } from 'antd';
import { HistoryOutlined, LogoutOutlined, PlusOutlined, DeleteOutlined, CrownOutlined, DashboardOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useSidebar } from '../../contexts/SidebarContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePricing } from '../../contexts/PricingContext';
import { createJob, deleteJob } from '../../store/local';
import type { JobContext } from '../../store/local';
import InviteDialog from './InviteDialog';

/* ---------- Model status ---------- */

type ModelStatus = 'checking' | 'ok' | 'missing' | 'error';

const modelStatusMeta = (status: ModelStatus, modelChecked: string, modelError: string) => ({
  ok: { color: '#4ade80', short: '已配置', tip: `模型可用：${modelChecked || '已配置'}` },
  missing: { color: '#f87171', short: '未配置', tip: '尚未配置模型，点击「🤖 我的模型」填写 API Key' },
  error: { color: '#fb923c', short: '配置出错', tip: `配置无法使用：${modelError || '未知错误'}` },
  checking: { color: '#94a3b8', short: '检测中', tip: '正在验证模型配置' },
}[status]);

/* ---------- Sub-components ---------- */

function IdentityRow() {
  const { openAuthModal } = useSidebar();
  const { user, isLoggedIn, logout } = useAuth();
  const { credits, isSubscribed, openPaywall } = usePricing();
  const navigate = useNavigate();

  if (!isLoggedIn) {
    return (
      <Tooltip title="未登录 · 点击登录" placement="right">
        <div className="strip-item" onClick={openAuthModal}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#1a2744', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c9a44c', fontSize: 11, fontWeight: 600 }}>
            ?
          </div>
          <span className="strip-item-text">
            <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.9)' }}>未登录</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>点击登录</div>
          </span>
        </div>
      </Tooltip>
    );
  }

  const initial = (isLoggedIn ? (user!.nickname || user!.username || '?') : '?')[0].toUpperCase();

  const menuItems: MenuProps['items'] = [
    { key: 'user-info', label: `${user?.nickname || user?.username}`, disabled: true, className: 'menu-user-name' },
    { key: 'credits', label: isSubscribed ? '已订阅 · 不限次' : `剩余额度 ${credits} 次`, disabled: true },
    { type: 'divider' },
    { key: 'upgrade', icon: <CrownOutlined />, label: '升级会员', onClick: openPaywall },
    { type: 'divider' },
    { key: 'history', icon: <HistoryOutlined />, label: '历史记录', onClick: () => navigate('/history') },
    ...(user?.isAdmin
      ? [
          { type: 'divider' as const },
          { key: 'admin', icon: <DashboardOutlined />, label: '管理看板', onClick: () => navigate('/admin') },
        ]
      : []),
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: logout },
  ];

  return (
    <div style={{ marginBottom: 4 }}>
      {/* Avatar row → dropdown (user info / history / logout) */}
      <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg, #1a2744, #2d4a7a)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c9a44c', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
            {initial}
          </div>
          <span className="strip-item-text" style={{ fontSize: 12, fontWeight: 500 }}>{user!.nickname || user!.username}</span>
        </div>
      </Dropdown>
    </div>
  );
}

function ModelRow({ modelStatus, modelChecked, modelError }: { modelStatus: ModelStatus; modelChecked: string; modelError: string }) {
  const { openSettings } = useSidebar();
  const s = modelStatusMeta(modelStatus, modelChecked, modelError);
  return (
    <Tooltip title={s.tip} placement="right">
      <div className="strip-item" onClick={openSettings}>
        <span className="strip-item-icon">🤖</span>
        <span className="strip-item-text">我的模型</span>
        <span style={{ fontSize: 9, color: s.color, marginLeft: 'auto', paddingRight: 2, whiteSpace: 'nowrap' }}>● {s.short}</span>
      </div>
    </Tooltip>
  );
}

function InviteRow() {
  const { openInviteDialog } = useSidebar();
  return (
    <Tooltip title="我的邀请码" placement="right">
      <div className="strip-item" onClick={openInviteDialog}>
        <span className="strip-item-icon">🔗</span>
        <span className="strip-item-text">我的邀请码</span>
      </div>
    </Tooltip>
  );
}

function AdvancedFeatureRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, color: 'rgba(255,255,255,0.4)', opacity: 0.5, cursor: 'default', fontSize: 12, whiteSpace: 'nowrap', margin: '0 4px' }}>
      <span style={{ fontSize: 15 }}>🚀</span> 高级功能
      <span style={{ fontSize: 10 }}>(即将上线)</span>
    </div>
  );
}

// 求职岗位：多岗位上下文切换器（P0-1）
function JobSection() {
  const navigate = useNavigate();
  const { jobs, activeJobId, setActiveJob, refreshJobs } = useSidebar();
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [newJobName, setNewJobName] = useState('');

  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0] || null;

  const chip = (show: boolean, label: string) =>
    show ? <span className="job-chip">{label}</span> : null;

  const switchJob = (job: JobContext) => {
    if (job.id === activeJobId) return;
    setActiveJob(job.id);
    message.success(`已切换到「${job.name}」`);
    const missing: string[] = [];
    if (!job.jdResult) missing.push('JD');
    if (!job.resumeSummary) missing.push('简历');
    if (missing.length) {
      message.info(`该岗位还没拆解${missing.join('、')}，对应 Tab 将按通用标准工作`);
    }
  };

  const confirmDelete = () => {
    if (!activeJob) return;
    Modal.confirm({
      title: `删除岗位「${activeJob.name}」？`,
      content: '该岗位的 JD 拆解与简历摘要会一并删除，不可恢复。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        deleteJob(activeJob.id);
        refreshJobs();
        message.success('已删除');
      },
    });
  };

  const createNewJob = () => {
    const name = newJobName.trim();
    if (!name) return message.warning('请填写岗位名（建议：公司 + 岗位）');
    createJob(name);
    refreshJobs();
    setNewJobOpen(false);
    setNewJobName('');
    message.success(`已创建并切换到「${name}」`);
  };

  const jobMenu: MenuProps['items'] = [
    ...jobs.map((j) => ({
      key: j.id,
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</span>
          {j.id === activeJobId && <span style={{ color: '#c9a44c' }}>✓</span>}
          {chip(!!j.jdResult, 'JD')}
          {chip(!!j.resumeSummary, '简历')}
        </span>
      ),
      onClick: () => switchJob(j),
    })),
    { type: 'divider' },
    { key: 'job-history', icon: <HistoryOutlined />, label: '查看该岗位历史', onClick: () => navigate(`/history?job=${encodeURIComponent(activeJob.id)}`) },
    { key: 'new', icon: <PlusOutlined />, label: '新建岗位', onClick: () => setNewJobOpen(true) },
    ...(jobs.length > 1 ? [{ key: 'delete', icon: <DeleteOutlined />, danger: true, label: '删除当前岗位', onClick: confirmDelete }] : []),
  ];

  return (
    <div style={{ padding: '16px 8px 4px', flexShrink: 0 }}>
      <div className="strip-section-label">求职岗位</div>
      <div style={{ padding: '0 4px' }}>
        {activeJob ? (
          <Dropdown menu={{ items: jobMenu }} trigger={['click']} placement="bottomLeft">
            <div className="strip-item" style={{ cursor: 'pointer' }}>
              <span className="strip-item-icon">💼</span>
              <span className="strip-item-text" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeJob.name}</span>
              <span style={{ display: 'flex', gap: 4, marginLeft: 'auto', paddingRight: 2, flexShrink: 0 }}>
                {chip(!!activeJob.jdResult, 'JD✓')}
                {chip(!!activeJob.resumeSummary, '简历✓')}
              </span>
            </div>
          </Dropdown>
        ) : (
          <div className="strip-item" style={{ cursor: 'pointer' }} onClick={() => setNewJobOpen(true)}>
            <span className="strip-item-icon">＋</span>
            <span className="strip-item-text">新建岗位</span>
          </div>
        )}
      </div>

      <Modal
        open={newJobOpen}
        onOk={createNewJob}
        onCancel={() => { setNewJobOpen(false); setNewJobName(''); }}
        okText="创建"
        cancelText="取消"
        title="新建求职岗位"
      >
        <Input
          value={newJobName}
          onChange={(e) => setNewJobName(e.target.value)}
          onPressEnter={createNewJob}
          placeholder="如：字节跳动 · 内容运营"
          autoFocus
        />
      </Modal>
    </div>
  );
}


/* ---------- Main Sidebar Component ---------- */

export default function Sidebar({ modelStatus, modelChecked, modelError }: { modelStatus: ModelStatus; modelChecked: string; modelError: string }) {
  const { inviteDialogOpen, closeInviteDialog } = useSidebar();

  return (
    <>
      <div className="sidebar-strip">
        {/* Brand */}
        <div className="strip-brand">
          <img src="/logo.svg" alt="" className="app-logo" style={{ width: 26, height: 26 }} />
          <div className="strip-brand-text">
            <div className="t">OfferPilot 领航员</div>
            <div className="s">聚焦：AI 策略 PM</div>
          </div>
        </div>

        {/* Nav Items */}
        <div className="strip-items">
          {/* Section 0: 基础配置 */}
          <div style={{ padding: '16px 8px 8px', flexShrink: 0 }}>
            <div className="strip-section-label">基础配置</div>
            <div style={{ padding: '0 4px' }}>
              <IdentityRow />
              <ModelRow modelStatus={modelStatus} modelChecked={modelChecked} modelError={modelError} />
              <InviteRow />
              <AdvancedFeatureRow />
            </div>
          </div>

          {/* Section 1: 求职岗位 */}
          <JobSection />

        </div>

        {/* Footer */}
        <div className="strip-footer">v1.0.0 · Gillian-2024/OfferPilot</div>
      </div>

      {/* Trigger modals/dialogs */}
      {inviteDialogOpen && <InviteDialog open={inviteDialogOpen} onClose={closeInviteDialog} />}
    </>
  );
}
