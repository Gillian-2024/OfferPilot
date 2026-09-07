import express from 'express';
import { getStatement } from '../db/index.js';
import { parseCapabilities } from '../utils/entitlements.js';

const router = express.Router();

// 列出可用 SKU(active=1,按 sort_order),供前端付费墙展示;不返回成本敏感字段
router.get('/skus', (req, res) => {
  try {
    const rows = getStatement(
      'SELECT code, name, price_cents, credits, capabilities, duration_days FROM skus WHERE active = 1 ORDER BY sort_order'
    ).all();
    res.json({
      skus: rows.map((r) => ({
        code: r.code,
        name: r.name,
        priceCents: r.price_cents,
        credits: r.credits,
        capabilities: parseCapabilities(r.capabilities),
        durationDays: r.duration_days,
      })),
    });
  } catch (e) {
    console.error('[billing/skus]', e);
    res.status(500).json({ error: '获取商品列表失败' });
  }
});

export default router;
