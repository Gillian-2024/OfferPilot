import { useState, useRef, useEffect } from 'react';
import { Button, Input, Space, Card, Typography, message, Alert, Tag } from 'antd';
import {
  SendOutlined,
  BulbOutlined,
  ShareAltOutlined,
  ClearOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { api } from '../../api/client';
import { Settings, SSEMessage } from '../../types';
import { getJDProfile, getResumeSummary, getJDKeywords } from '../../store/local';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

export default function InterviewReview({ settings }: { settings: Settings }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

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
      {hasContext ? (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <span>
              已联动上下文：
              {context.jobProfile && <Tag color="blue">{context.jobProfile.slice(0, 20)}</Tag>}
              {context.resumeSummary && <Tag color="purple">简历摘要</Tag>}
              {context.jdKeywords.length > 0 && <Tag>关键词 {context.jdKeywords.length}</Tag>}
            </span>
          }
        />
      ) : (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="未联动岗位/简历，复盘将缺乏针对性"
          description="建议先做 JD 拆解 + 简历拆解，再回到这里复盘——上下文会自动带过来"
        />
      )}

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
  );
}
