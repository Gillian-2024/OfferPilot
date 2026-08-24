import { useState, useEffect } from 'react';
import { Modal, Input, Button, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { sidebarApi } from '../../api/client';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function InviteDialog({ open, onClose }: Props) {
  const [invite, setInvite] = useState<{ code: string; click_count: number } | null>(null);
  const [newCode, setNewCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    sidebarApi.getMyInvite().then(setInvite).catch(() => setInvite(null));
  }, [open]);

  const copyCode = () => {
    if (!invite) return;
    navigator.clipboard.writeText(invite.code).then(
      () => message.success('邀请码已复制到剪贴板'),
      () => message.info(`邀请码: ${invite.code}`),
    );
  };

  const updateCode = () => {
    const trimmed = newCode.trim().toUpperCase();
    if (!/^[A-Z0-9_]{3,16}$/.test(trimmed)) {
      message.error('邀请码需 3-16 位大写字母、数字或下划线');
      return;
    }
    setLoading(true);
    sidebarApi.updateInviteCode(trimmed)
      .then((r) => {
        message.success('邀请码已更新');
        setInvite({ code: r.code, click_count: 0 });
        setNewCode('');
      })
      .catch((e) => message.error(e.message || '更新失败'))
      .finally(() => setLoading(false));
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable
      width={380}
      styles={{ body: { padding: '24px 28px' } }}
    >
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>🔗 我的邀请码</div>
        <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6 }}>将邀请码分享给朋友，每成功邀请一位注册，双方各得额外使用次数。</div>
      </div>

      {invite ? (
        <>
          <div style={{ background: 'linear-gradient(135deg, #1a2744, #2d4a7a)', borderRadius: 12, padding: 24, marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#c9a44c', letterSpacing: 4, fontFamily: 'monospace' }}>{invite.code}</div>
            <div style={{ fontSize: 11, color: 'white', marginTop: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={copyCode}>
              <CopyOutlined /> 复制邀请码
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 20 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1a2744' }}>{invite.click_count}</div>
              <div style={{ fontSize: 10, color: '#6b7280' }}>已邀请人数</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1a2744' }}>—</div>
              <div style={{ fontSize: 10, color: '#6b7280' }}>获得次数</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <Button style={{ flex: 1 }} onClick={copyCode}>📋 复制链接</Button>
            <Button>💬 微信</Button>
            <Button>🖼 生成海报</Button>
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>修改邀请码（仅一次机会）</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="输入新邀请码"
                maxLength={16}
                style={{ fontFamily: 'monospace', letterSpacing: 2, textTransform: 'uppercase', flex: 1 }}
              />
              <Button loading={loading} onClick={updateCode}>更新</Button>
            </div>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>注意：一旦设置不可再次修改</div>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', color: '#6b7280', padding: 20 }}>获取邀请信息失败</div>
      )}

      <div style={{ textAlign: 'right', marginTop: 20 }}>
        <Button onClick={onClose}>关闭</Button>
      </div>
    </Modal>
  );
}
