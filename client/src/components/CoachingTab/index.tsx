import { RobotOutlined, RocketOutlined, BellOutlined } from '@ant-design/icons';
import { Button, Tag, message } from 'antd';
import { track } from '../../utils/analytics';

/**
 * 第五 tab · 专属陪练占位。
 * 陪练产品线（模板 / 定价）尚未定稿，先立入口 + 价值主张，
 * 下分两个子方向：① 1v1 求职陪练 ② AI 全栈产品项目落地陪练。
 * CTA 仅收集意愿，不引导到未包含陪练 SKU 的付费墙。
 */
export default function CoachingTab() {
  const remind = (type: string, label: string) => {
    track('coaching_remind_click', { type });
    message.success(`已记录，${label}上线后第一时间通知你`);
  };

  return (
    <div className="coaching-placeholder">
      <div className="coaching-grid">
        <div className="coaching-card">
          <div className="coaching-head">
            <span className="coaching-badge">
              <RobotOutlined />
            </span>
            <Tag color="gold" bordered={false} className="coaching-tag">
              即将上线
            </Tag>
          </div>
          <h2 className="coaching-title">1v1 求职陪练</h2>
          <p className="coaching-desc">
            像请了一位贴身教练，陪你走完从投递到谈薪的每一步。
          </p>
          <ul className="coaching-points">
            <li>模拟面试 · 逐题复盘你的回答</li>
            <li>投递节奏 · 该投哪家、什么时候投</li>
            <li>谈薪话术 · 不让自己吃亏</li>
          </ul>
          <Button type="primary" icon={<BellOutlined />} onClick={() => remind('career', '求职陪练')} className="coaching-cta">
            上线提醒我
          </Button>
        </div>

        <div className="coaching-card">
          <div className="coaching-head">
            <span className="coaching-badge">
              <RocketOutlined />
            </span>
            <Tag color="gold" bordered={false} className="coaching-tag">
              即将上线
            </Tag>
          </div>
          <h2 className="coaching-title">AI 全栈产品 · 项目落地陪练</h2>
          <p className="coaching-desc">
            从想法到上线，陪你把一个 AI 产品真正做出来、跑起来。
          </p>
          <ul className="coaching-points">
            <li>选题定方向 · 该做什么、护城河在哪</li>
            <li>全栈落地 · 前后端 + AI 能力串起来</li>
            <li>上线增长 · 备案、支付、引流闭环</li>
          </ul>
          <Button type="primary" icon={<BellOutlined />} onClick={() => remind('fullstack', 'AI 全栈陪练')} className="coaching-cta">
            上线提醒我
          </Button>
        </div>
      </div>
    </div>
  );
}
