import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Alert, Button, Space, Spin, Tag, Typography, message } from 'antd';
import { CrownOutlined, ThunderboltOutlined, RocketOutlined } from '@ant-design/icons';
import { api } from '../../api/client';
import { Sku } from '../../types';
import { usePricing } from '../../contexts/PricingContext';
import { track } from '../../utils/analytics';

// 阶段一承接：支付未接入前，用户点「购买」引导加微信预约。
// 微信号走 client/.env 的 VITE_RESERVE_WECHAT（已 gitignore，避免真实号进公开仓）。
// 微信二维码图放 client/public/wechat-qr.png（已 gitignore），没放图时自动隐藏。
const RESERVE_WECHAT = import.meta.env.VITE_RESERVE_WECHAT ?? '';

function formatPrice(cents: number): string {
  const yuan = cents / 100;
  return Number.isInteger(yuan) ? `¥${yuan}` : `¥${yuan.toFixed(2)}`;
}

// SKU 补充说明（seed 只存 code/name/price/capability，营销文案放前端）
const SKU_META: Record<string, { desc: string; icon: ReactNode; highlight?: boolean }> = {
  single: { desc: '1 次完整分析，适合先试水', icon: <ThunderboltOutlined /> },
  monthly: { desc: '30 天无限次，求职冲刺期首选', icon: <CrownOutlined />, highlight: true },
  jobpass: { desc: '绑应届届别至 6 月，求职季全程无限次（阶梯价 199/149/99/69）', icon: <RocketOutlined /> },
};

export default function PaywallModal() {
  const { paywallOpen, closePaywall, credits, isSubscribed } = usePricing();
  const [skus, setSkus] = useState<Sku[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!paywallOpen) return;
    setLoading(true);
    api.getSkus()
      .then((r) => setSkus(r.skus))
      .catch(() => message.error('获取商品列表失败'))
      .finally(() => setLoading(false));
  }, [paywallOpen]);

  const buy = (sku: Sku) => {
    track('paywall_buy_click', { sku: sku.code, sku_name: sku.name, price_cents: sku.priceCents });
    // 支付未接入（阶段一）：记录意愿并引导加微信预约；阶段二接支付后替换为下单跳转
    const wechat = RESERVE_WECHAT.trim();
    Modal.confirm({
      title: '支付内测中 · 预约优先开通',
      content: (
        <div>
          <p>
            你选择了「{sku.name}」（{formatPrice(sku.priceCents)}）。支付即将开放，加微信预约可锁定早鸟价。
          </p>
          <div style={{ textAlign: 'center', margin: '12px 0' }}>
            <img
              src="/wechat-qr.png"
              alt="微信二维码"
              style={{ width: 168, height: 168, objectFit: 'contain', borderRadius: 8 }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          {wechat ? (
            <p style={{ textAlign: 'center' }}>
              或直接添加微信号：<Typography.Text copyable={{ text: wechat }}>{wechat}</Typography.Text>
            </p>
          ) : (
            <p style={{ textAlign: 'center' }}>预约已记录，微信号公布后我们会第一时间通知你。</p>
          )}
        </div>
      ),
      okText: '已预约',
      cancelText: '再想想',
      onOk: () => {
        track('paywall_reserve_confirm', { sku: sku.code });
        message.success('预约成功，我们会尽快联系你');
      },
    });
  };

  return (
    <Modal open={paywallOpen} onCancel={closePaywall} footer={null} width={600} centered destroyOnClose title="升级 OfferPilot 领航员">
      {isSubscribed ? (
        <Alert type="success" showIcon message="你已订阅，无需重复购买" className="mb-16" />
      ) : (
        <Alert
          type="warning"
          showIcon
          message={`当前剩余免费额度 ${credits} 次`}
          description="额度用完即需升级或按次购买。月卡 / 求职通订阅期内不限次。"
          className="mb-16"
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {skus.map((sku) => {
            const meta = SKU_META[sku.code] || { desc: '', icon: null };
            return (
              <div
                key={sku.code}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '12px 16px', borderRadius: 10,
                  border: meta.highlight ? '1px solid var(--color-gold)' : '1px solid #e5e7eb',
                  background: meta.highlight ? 'var(--color-gold-light)' : '#fff',
                }}
              >
                <span style={{ fontSize: 22, color: 'var(--color-gold)' }}>{meta.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Typography.Text strong>{sku.name}</Typography.Text>
                    {meta.highlight && <Tag color="gold">推荐</Tag>}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{meta.desc}</div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#14273f', whiteSpace: 'nowrap' }}>{formatPrice(sku.priceCents)}</div>
                <Button type={meta.highlight ? 'primary' : 'default'} onClick={() => buy(sku)}>购买</Button>
              </div>
            );
          })}
        </Space>
      )}

    </Modal>
  );
}
