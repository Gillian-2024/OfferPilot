import { RobotOutlined, BellOutlined } from '@ant-design/icons';
import { Button, Tag, message } from 'antd';
import { track } from '../../utils/analytics';

/**
 * 第五 tab · 陪练占位。
 * 陪练产品线（模板 / 定价）尚未定稿，先立入口 + 价值主张，
 * CTA 仅收集意愿，不引导到未包含陪练 SKU 的付费墙。
 */
export default function CoachingTab() {
  const remind = () => {
    track('coaching_remind_click');
    message.success('已记录，陪练上线后第一时间通知你');
  };

  return (
    <div className="coaching-placeholder">
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
        <Button type="primary" icon={<BellOutlined />} onClick={remind} className="coaching-cta">
          上线提醒我
        </Button>
      </div>
    </div>
  );
}
