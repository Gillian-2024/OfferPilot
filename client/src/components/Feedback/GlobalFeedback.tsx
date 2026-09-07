import { useState } from 'react';
import { MessageOutlined } from '@ant-design/icons';
import { Button, Drawer, Input, Segmented, message } from 'antd';
import { track } from '../../utils/analytics';

const CATEGORIES = ['功能建议', '使用问题', '其他'];

/**
 * 全局反馈浮层：右下角悬浮入口 + 右侧抽屉。
 * 上报复用 analytics 管线（event = global_feedback）。
 */
export default function GlobalFeedback() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('功能建议');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = () => {
    if (!content.trim()) {
      message.warning('写点什么再提交吧');
      return;
    }
    setSubmitting(true);
    track('global_feedback', {
      category,
      content: content.trim(),
      contact: contact.trim() || null,
    });
    // 轻量假等待，给用户明确的提交回馈（track 本身是异步批量，无需真等待）
    setTimeout(() => {
      setSubmitting(false);
      message.success('已收到，感谢你的反馈');
      setOpen(false);
      setContent('');
      setContact('');
      setCategory('功能建议');
    }, 400);
  };

  return (
    <>
      <button className="gfb-fab" onClick={() => setOpen(true)} aria-label="意见反馈">
        <MessageOutlined />
        <span>反馈</span>
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        className="gfb-drawer"
        title="告诉我们你的想法"
        width={400}
      >
        <div className="gfb-body">
          <p className="gfb-hint">你的反馈会直接帮助领航员变得更好，每一条我们都会看。</p>

          <div className="gfb-field">
            <label>反馈类型</label>
            <Segmented
              block
              options={CATEGORIES}
              value={category}
              onChange={(v) => setCategory(v as string)}
            />
          </div>

          <div className="gfb-field">
            <label>具体说说</label>
            <Input.TextArea
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="比如：希望简历诊断能更具体到某段经历该怎么改……"
              maxLength={1000}
              showCount
            />
          </div>

          <div className="gfb-field">
            <label>联系方式（选填）</label>
            <Input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="微信号 / 邮箱，方便我们回访"
            />
          </div>

          <Button
            type="primary"
            block
            loading={submitting}
            onClick={submit}
            className="gfb-submit"
          >
            提交反馈
          </Button>

          <p className="gfb-foot">你的隐私会被妥善保护，仅用于改进产品。</p>
        </div>
      </Drawer>
    </>
  );
}
