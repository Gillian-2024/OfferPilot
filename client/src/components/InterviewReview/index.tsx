import { useState, useRef, useEffect } from 'react';
import { Button, Input, Space, Card, Typography, message, Alert, Tag, Collapse, Empty } from 'antd';
import {
  SendOutlined,
  BulbOutlined,
  ShareAltOutlined,
  ClearOutlined,
  LinkOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { api } from '../../api/client';
import { Settings, SSEMessage } from '../../types';
import { getJDProfile, getResumeSummary, getJDKeywords, getJDResult } from '../../store/local';
import { JDResultView } from '../shared/ResultViews';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

export default function InterviewReview({ settings, onGotoJD }: { settings: Settings; onGotoJD?: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const jdResult = getJDResult();
  const context = {
    jobProfile: getJDProfile(),
    resumeSummary: getResumeSummary(),
    jdKeywords: getJDKeywords(),
  };
  const hasContext = !!(context.jobProfile || context.resumeSummary);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (content: string) => {
    if (!content.trim() || loading) return;
    const userMsg: Msg = { role: 'user', content };
    const newMsgs = [...messages, userMsg];
    setMessages([...newMsgs, { role: 'assistant', content: '', streaming: true }]);
    setInput('');
    setLoading(true);
    try {
      let acc = '';
      for await (const msg of api.chat(
        newMsgs.map((m) => ({ role: m.role, content: m.content })),
        context,
        settings
      ) as AsyncGenerator<SSEMessage>) {
        if (msg.type === 'token') {
          acc += msg.text;
          setMessages((s) => {
            const c = [...s];
            c[c.length - 1] = { role: 'assistant', content: acc, streaming: true };
            return c;
          });
        } else if (msg.type === 'error') {
          message.error(msg.message);
        }
      }
      setMessages((s) => {
        const c = [...s];
        c[c.length - 1] = { role: 'assistant', content: acc, streaming: false };
        return c;
      });
    } catch (e: any) {
      message.error(e.message);
      setMessages((s) => s.slice(0, -1));
    }
    setLoading(false);
  };

  const simulateQuestion = () =>
    send('帮我想想还会问什么，基于我的岗位和简历出 3-5 个可能的追问题目（带考察点），不要给标准答案。');

  const share = async () => {
    if (!messages.length) return;
    const md = messages
      .map((m) => `**${m.role === 'user' ? '我' : '教练'}**：\n\n${m.content}`)
      .join('\n\n---\n\n');
    const r = await api.createShare({ type: 'interview', title: '面试复盘对话', content: md });
    setShareUrl(`${location.origin}/share/${r.id}`);
    message.success('分享链接已生成');
  };

  return (
    <div className="tab-content">
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* 左:对照 JD + 简历摘要(只读钉住) */}
        <div
          style={{
            width: '38%',
            minWidth: 280,
            position: 'sticky',
            top: 72,
            maxHeight: 'calc(100vh - 96px)',
            overflowY: 'auto',
          }}
        >
          {hasContext ? (
            <>
              {jdResult ? (
                <Collapse
                  defaultActiveKey={['jd']}
                  ghost
                  style={{ marginBottom: 12 }}
                  items={[
                    {
                      key: 'jd',
                      label: (
                        <Space>
                          对照 JD（只读）
                          <Tag color="green">已联动</Tag>
                          <strong>{jdResult.job_profile}</strong>
                        </Space>
                      ),
                      extra: onGotoJD ? (
                        <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); onGotoJD(); }}>
                          去拆解 <RightOutlined />
                        </Button>
                      ) : null,
                      children: <JDResultView data={jdResult} />,
                    },
                  ]}
                />
              ) : null}
              {context.resumeSummary ? (
                <Card size="small" title={<Space>对照简历摘要<Tag color="purple">已联动</Tag></Space>} style={{ marginBottom: 12 }}>
                  <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                    {context.resumeSummary}
                  </Typography.Paragraph>
                </Card>
              ) : null}
            </>
          ) : (
            <Card
              size="small"
              title={
                <Space>
                  对照上下文
                  <Tag color="orange">未联动</Tag>
                </Space>
              }
              extra={
                onGotoJD ? (
                  <Button type="link" size="small" onClick={onGotoJD}>
                    去拆解 <RightOutlined />
                  </Button>
                ) : null
              }
            >
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未拆解 JD / 简历">
                {onGotoJD && (
                  <Button type="primary" size="small" onClick={onGotoJD}>
                    先去拆 JD
                  </Button>
                )}
              </Empty>
            </Card>
          )}
        </div>

        {/* 右:面试复盘对话 */}
        <div style={{ flex: 1, minWidth: 320 }}>
          <Card size="small" styles={{ body: { minHeight: 320 } }} style={{ marginBottom: 16 }}>
            {messages.length === 0 ? (
              <Typography.Text type="secondary">
                先描述面试基本情况（公司 / 岗位 / 第几轮 / 面试官角色），教练判定面试类型后开始逐题复盘。
              </Typography.Text>
            ) : (
              messages.map((m, i) => (
                <div key={i} className="chat-row">
                  <div className={`chat-bubble ${m.role}`}>
                    {m.content}
                    {m.streaming && <span className="cursor" />}
                  </div>
                </div>
              ))
            )}
            <div ref={endRef} />
          </Card>

          <Space style={{ marginBottom: 8 }} wrap>
            <Button icon={<BulbOutlined />} onClick={simulateQuestion} disabled={loading}>
              帮我想想还会问什么（模拟追问）
            </Button>
            <Button icon={<ShareAltOutlined />} onClick={share} disabled={!messages.length}>
              分享对话
            </Button>
            <Button icon={<ClearOutlined />} onClick={() => setMessages([])} disabled={!messages.length}>
              清空
            </Button>
          </Space>

          <Input.TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            placeholder="描述面试题目 + 你的回答；或直接提问。Enter 发送，Shift+Enter 换行"
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={loading}
            onClick={() => send(input)}
            style={{ marginTop: 8 }}
          >
            发送
          </Button>

          {shareUrl && (
            <Alert
              type="success"
              showIcon
              icon={<LinkOutlined />}
              style={{ marginTop: 16 }}
              message={
                <a href={shareUrl} target="_blank" rel="noreferrer">
                  {shareUrl}
                </a>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
