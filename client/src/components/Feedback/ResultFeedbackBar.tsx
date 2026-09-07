import { useState } from 'react';
import { LikeOutlined, DislikeOutlined } from '@ant-design/icons';
import { Button, Input, Space, Tooltip } from 'antd';
import { track } from '../../utils/analytics';

interface Props {
  resultType: 'jd' | 'resume';
}

/**
 * 结果页反馈条：轻量、不打扰，点 👍/👎 后可补一句原因。
 * 上报复用 analytics 管线（event = result_feedback）。
 */
export default function ResultFeedbackBar({ resultType }: Props) {
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const choose = (next: 'up' | 'down') => {
    // 再点一次同向 = 取消；点反向 = 切换
    setRating((prev) => (prev === next ? null : next));
    setSubmitted(false);
  };

  const submit = () => {
    track('result_feedback', {
      result_type: resultType,
      rating,
      comment: comment.trim() || null,
    });
    setComment('');
    setSubmitted(true);
  };

  return (
    <div className="fb-bar">
      {submitted ? (
        <div className="fb-bar-thanks">感谢你的反馈，我们会据此优化结果。</div>
      ) : (
        <>
          <div className="fb-bar-row">
            <span className="fb-bar-q">这个结果对你有帮助吗？</span>
            <Space size={2}>
              <Tooltip title="有帮助">
                <Button
                  type="text"
                  size="small"
                  className={`fb-btn${rating === 'up' ? ' fb-btn--up' : ''}`}
                  icon={<LikeOutlined />}
                  onClick={() => choose('up')}
                />
              </Tooltip>
              <Tooltip title="没帮到">
                <Button
                  type="text"
                  size="small"
                  className={`fb-btn${rating === 'down' ? ' fb-btn--down' : ''}`}
                  icon={<DislikeOutlined />}
                  onClick={() => choose('down')}
                />
              </Tooltip>
            </Space>
          </div>
          {rating && (
            <div className="fb-bar-comment">
              <Input
                size="small"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  rating === 'up'
                    ? '哪里做得好？说说看（选填）'
                    : '哪里没帮到你？我们据此改进（选填）'
                }
                maxLength={200}
                onPressEnter={submit}
              />
              <Button type="primary" size="small" onClick={submit}>
                提交
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
