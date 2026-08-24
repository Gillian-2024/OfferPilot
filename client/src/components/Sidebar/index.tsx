import { Drawer, Tooltip } from 'antd';
import { useSidebar } from '../../contexts/SidebarContext';
import { useAuth } from '../../contexts/AuthContext';
import InviteDialog from './InviteDialog';

/* ---------- Sub-components ---------- */

function IdentityRow() {
  const { openAuthModal, openSettings } = useSidebar();
  const { user, isLoggedIn } = useAuth();

  if (!isLoggedIn) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }} onClick={openAuthModal}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#1a2744', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c9a44c', fontSize: 11, fontWeight: 600 }}>
          ?
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 500 }}>未登录</div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>点击登录</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, cursor: 'default', marginBottom: 4 }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg, #1a2744, #2d4a7a)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c9a44c', fontSize: 11, fontWeight: 600 }}>
        {(user?.nickname || user?.username || '?')[0].toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500 }}>{user?.nickname || user?.username}</div>
        <Tooltip title="点击配置模型">
          <div style={{ fontSize: 10, color: '#059669', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); openSettings(); }}>● 模型已配</div>
        </Tooltip>
      </div>
    </div>
  );
}

function ModelRow() {
  const { openSettings } = useSidebar();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }} onClick={openSettings}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#059669' }} />
      <span style={{ fontSize: 12 }}>我的模型</span>
    </div>
  );
}

function InviteRow() {
  const { openInviteDialog } = useSidebar();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }} onClick={openInviteDialog}>
      <span style={{ fontSize: 15 }}>🔗</span>
      <span style={{ fontSize: 12, flex: 1 }}>我的邀请码</span>
    </div>
  );
}

function AdvancedFeatureRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, color: '#6b7280', opacity: 0.5, cursor: 'default', fontSize: 12 }}>
      <span style={{ fontSize: 15 }}>🚀</span> 高级功能
      <span style={{ fontSize: 10, color: '#6b7280' }}>(即将上线)</span>
    </div>
  );
}

function SessionsNav() {
  const { expandedSection, setExpandedSection, setHistoryTab } = useSidebar();
  const isExpanded = expandedSection === 'project-history';

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
        background: isExpanded ? '#e8eef6' : 'transparent',
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
      <span style={{ fontSize: 15 }}>🗂</span> 项目树 / 历史树
      <span style={{ fontSize: 10, marginLeft: 'auto', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
    </div>
  );
}

function ExpandedArea() {
  const { expandedSection, historyTab, setHistoryTab } = useSidebar();
  const show = expandedSection === 'project-history';

  return (
    <div style={{ borderTop: '1px solid #e5e7eb', flex: 1, overflow: 'hidden', maxHeight: show ? 380 : 0, transition: 'max-height 0.3s ease', overflowY: 'auto' }}>
      {!show && <div />} {/* prevent layout shift */}
      {show && (
        <>
          <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
            <div
              style={{ flex: 1, padding: '8px 4px', textAlign: 'center', fontSize: 11, cursor: 'pointer', borderBottom: historyTab === 'tree' ? '2px solid #1a2744' : '2px solid transparent', fontWeight: historyTab === 'tree' ? 600 : 400, color: historyTab === 'tree' ? '#1a2744' : '#6b7280' }}
              onClick={() => setHistoryTab('tree')}
            >项目树</div>
            <div
              style={{ flex: 1, padding: '8px 4px', textAlign: 'center', fontSize: 11, cursor: 'pointer', borderBottom: historyTab === 'history' ? '2px solid #1a2744' : '2px solid transparent', fontWeight: historyTab === 'history' ? 600 : 400, color: historyTab === 'history' ? '#1a2744' : '#6b7280' }}
              onClick={() => setHistoryTab('history')}
            >历史树</div>
          </div>
          <div style={{ padding: 10 }}>
            {historyTab === 'tree' ? (
              <div>
                {/* Project tree placeholder — populated when projects API is integrated */}
                <div style={{ fontSize: 11, color: '#2d4a7a', cursor: 'pointer', padding: '5px 8px', marginBottom: 6, borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>＋</span> 新建项目
                </div>
                {/* Folder group placeholder */}
                <div style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 4 }}>
                    <span>▶</span> 📂 默认
                  </div>
                  <div style={{ paddingLeft: 20 }}>
                    <div style={{ fontSize: 11, padding: '5px 8px', cursor: 'pointer', borderRadius: 4, fontWeight: 500 }}>💼 Google · AI PM <span style={{ fontSize: 9, opacity: 0.5, float: 'right' }}>2h前</span></div>
                    <div style={{ fontSize: 11, padding: '5px 8px', cursor: 'pointer', borderRadius: 4 }}>💼 Meta · SPM <span style={{ fontSize: 9, opacity: 0.5, float: 'right' }}>昨天</span></div>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: '#6b7280', cursor: 'pointer', padding: '3px 8px', borderRadius: 4 }}>＋ 新建文件夹</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {[
                  { type: 'jd', label: 'JD 拆解', title: 'Google · AI PM', time: '2小时前', color: '#dbeafe' },
                  { type: 'resume', label: '简历拆解', title: 'Meta · SRE', time: '昨天', color: '#dcfce7' },
                  { type: 'review', label: '面试复盘', title: 'Byte · DSA轮', time: '3天前', color: '#fef3c7' },
                  { type: 'jd', label: 'JD 拆解', title: 'Apple · PM', time: '1周前', color: '#dbeafe' },
                ].map((item) => (
                  <div key={item.title} style={{ background: '#f5f6fa', border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, cursor: 'pointer' }}>
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: item.color, color: '#1a2744', display: 'inline-block', marginBottom: 4 }}>{item.label}</span>
                    <div style={{ fontSize: 11, marginBottom: 3 }}>{item.title}</div>
                    <div style={{ fontSize: 9, color: '#6b7280' }}>{item.time}</div>
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

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen, setExpandedSection, inviteDialogOpen, closeInviteDialog } = useSidebar();

  return (
    <>
      <Drawer
        open={sidebarOpen}
        onClose={() => { setSidebarOpen(false); setExpandedSection(null); }}
        placement="left"
        width={240}
        styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' }, header: { display: 'none' } }}
        closeIcon={null}
        maskClosable
      >
        {/* Header */}
        <div style={{ height: 52, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg, #1a2744, #2d4a7a)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c9a44c', fontWeight: 800, fontSize: 11, cursor: 'pointer' }} onClick={() => { setSidebarOpen(false); }}>OP</div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>OfferPilot</span>
        </div>

        {/* Section 1: 基础配置 */}
        <div style={{ padding: '16px 8px 8px' }}>
          <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, padding: '0 4px' }}>基础配置</div>
          <div style={{ padding: '0 4px' }}>
            <IdentityRow />
            <ModelRow />
            <InviteRow />
            <AdvancedFeatureRow />
          </div>
        </div>

        {/* Section 2: 管理会话 */}
        <div style={{ padding: '0 8px 8px' }}>
          <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, padding: '0 4px' }}>管理会话</div>
          <div style={{ padding: '0 4px' }}>
            <SessionsNav />
          </div>
        </div>

        {/* Expanded area */}
        <ExpandedArea />

        {/* Footer */}
        <div style={{ padding: 8, borderTop: '1px solid #e5e7eb', textAlign: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 9, color: '#6b7280' }}>v1.0.0 · Gillian-2024/OfferPilot</span>
        </div>
      </Drawer>

      {/* Trigger modals/dialogs */}
      {inviteDialogOpen && <InviteDialog open={inviteDialogOpen} onClose={closeInviteDialog} />}
    </>
  );
}
