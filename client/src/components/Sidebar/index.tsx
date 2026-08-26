import { useState } from 'react';
import { Tooltip, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { HistoryOutlined, LogoutOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useSidebar } from '../../contexts/SidebarContext';
import { useAuth } from '../../contexts/AuthContext';
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
    { type: 'divider' },
    { key: 'history', icon: <HistoryOutlined />, label: '历史记录', onClick: () => navigate('/history') },
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

function SessionsNav() {
  const { expandedSection, setExpandedSection, setHistoryTab } = useSidebar();
  const isExpanded = expandedSection === 'project-history';

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap',
        background: isExpanded ? 'rgba(255,255,255,0.08)' : 'transparent',
        margin: '0 4px',
      }}
      onClick={() => {
        if (isExpanded) {
          setExpandedSection(null);
        } else {
          setHistoryTab('tree');
          setExpandedSection('project-history');
        }
      }}
    >
      <span style={{ fontSize: 15 }}>🗂</span>{' '}
      <span className="strip-item-text">项目树 / 历史树</span>
      <span className="strip-chevron" style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
    </div>
  );
}

function ExpandedArea() {
  const { expandedSection, historyTab, setHistoryTab } = useSidebar();
  const show = expandedSection === 'project-history';

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', maxHeight: show ? 380 : 0, transition: 'max-height 0.3s ease', overflowY: 'auto' }}>
      {!show && <div />} {/* prevent layout shift */}
      {show && (
        <>
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div
              style={{ flex: 1, padding: '8px 4px', textAlign: 'center', fontSize: 11, cursor: 'pointer', borderBottom: historyTab === 'tree' ? '2px solid #fff' : '2px solid transparent', fontWeight: historyTab === 'tree' ? 600 : 400, color: historyTab === 'tree' ? '#fff' : 'rgba(255,255,255,0.5)' }}
              onClick={() => setHistoryTab('tree')}
            >项目树</div>
            <div
              style={{ flex: 1, padding: '8px 4px', textAlign: 'center', fontSize: 11, cursor: 'pointer', borderBottom: historyTab === 'history' ? '2px solid #fff' : '2px solid transparent', fontWeight: historyTab === 'history' ? 600 : 400, color: historyTab === 'history' ? '#fff' : 'rgba(255,255,255,0.5)' }}
              onClick={() => setHistoryTab('history')}
            >历史树</div>
          </div>
          <div style={{ padding: 10 }}>
            {historyTab === 'tree' ? (
              <div>
                {/* Project tree placeholder — populated when projects API is integrated */}
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', cursor: 'pointer', padding: '5px 8px', marginBottom: 6, borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>＋</span> 新建项目
                </div>
                {/* Folder group placeholder */}
                <div style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 4, color: 'rgba(255,255,255,0.8)' }}>
                    <span>▶</span> 📂 默认
                  </div>
                  <div style={{ paddingLeft: 20 }}>
                    <div style={{ fontSize: 11, padding: '5px 8px', cursor: 'pointer', borderRadius: 4, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>💼 Google · AI PM <span style={{ fontSize: 9, opacity: 0.5, float: 'right' }}>2h前</span></div>
                    <div style={{ fontSize: 11, padding: '5px 8px', cursor: 'pointer', borderRadius: 4, color: 'rgba(255,255,255,0.7)' }}>💼 Meta · SPM <span style={{ fontSize: 9, opacity: 0.5, float: 'right' }}>昨天</span></div>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '3px 8px', borderRadius: 4 }}>＋ 新建文件夹</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {[
                  { type: 'jd', label: 'JD 拆解', title: 'Google · AI PM', time: '2小时前', color: '#dbeafe' },
                  { type: 'resume', label: '简历拆解', title: 'Meta · SRE', time: '昨天', color: '#dcfce7' },
                  { type: 'review', label: '面试复盘', title: 'Byte · DSA轮', time: '3天前', color: '#fef3c7' },
                  { type: 'jd', label: 'JD 拆解', title: 'Apple · PM', time: '1周前', color: '#dbeafe' },
                ].map((item) => (
                  <div key={item.title} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 10, cursor: 'pointer', color: 'rgba(255,255,255,0.8)' }}>
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: item.color, color: '#1a2744', display: 'inline-block', marginBottom: 4 }}>{item.label}</span>
                    <div style={{ fontSize: 11, marginBottom: 3 }}>{item.title}</div>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>{item.time}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Main Sidebar Component ---------- */

export default function Sidebar({ modelStatus, modelChecked, modelError }: { modelStatus: ModelStatus; modelChecked: string; modelError: string }) {
  const { expandedSection, setExpandedSection, inviteDialogOpen, closeInviteDialog, historyTab, setHistoryTab } = useSidebar();

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
          {/* Section 1: 基础配置 */}
          <div style={{ padding: '16px 8px 8px', flexShrink: 0 }}>
            <div className="strip-section-label">基础配置</div>
            <div style={{ padding: '0 4px' }}>
              <IdentityRow />
              <ModelRow modelStatus={modelStatus} modelChecked={modelChecked} modelError={modelError} />
              <InviteRow />
              <AdvancedFeatureRow />
            </div>
          </div>

          {/* Section 2: 管理会话 */}
          <div style={{ marginTop: 'auto', padding: '0 8px 8px', flexShrink: 0 }}>
            <div className="strip-section-label">管理会话</div>
            <div style={{ padding: '0 4px' }}>
              <SessionsNav />
              {/* 展开面板紧贴菜单项下方，向下手风琴展开 */}
              <ExpandedArea />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="strip-footer">v1.0.0 · Gillian-2024/OfferPilot</div>
      </div>

      {/* Trigger modals/dialogs */}
      {inviteDialogOpen && <InviteDialog open={inviteDialogOpen} onClose={closeInviteDialog} />}
    </>
  );
}
