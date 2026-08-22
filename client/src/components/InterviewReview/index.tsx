import { useState, useRef, useEffect } from 'react';
import { Button, Input, Space, Card, Typography, message, Alert, Tag, Collapse, Empty, Segmented } from 'antd';
import {
  SendOutlined,
  BulbOutlined,
  ShareAltOutlined,
  ClearOutlined,
  LinkOutlined,
  RightOutlined,
  RocketOutlined,
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

type Mode = 'review' | 'prep';

export default function InterviewReview({ settings, onGotoJD }: { settings: Settings; onGotoJD?: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [mode, setMode] = useState<Mode>('review');
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

  const switchMode = (newMode: string | number) => {
    setMode(newMode as Mode);
    setMessages([]);
    setShareUrl('');
  };

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
        settings,
        mode
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
    const title = mode === 'prep' ? '面试准备对话' : '面试复盘对话';
    const r = await api.createShare({ type: 'interview', title, content: md });
    setShareUrl(`${location.origin}/share/${r.id}`);
    message.success('分享链接已生成');
  };

  const placeholder = mode === 'prep'
    ? '说说你的准备需求：目标公司 / 面试轮次 / 想练什么类型的题。Enter 发送，Shift+Enter 换行'
    : '描述面试题目 + 你的回答；或直接提问。Enter 发送，Shift+Enter 换行';

  const emptyHint = mode === 'prep'
    ? '先说明准备需求（如"我明天面试字节内容运营岗一面，帮我预测面试题"），教练基于岗位画像 + 简历给你定制准备方案。'
    : '先描述面试基本情况（公司 / 岗位 / 第几轮 / 面试官角色），教练判定面试类型后开始逐题复盘。';

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

        {/* 右:面试对话 */}
        <div style={{ flex: 1, minWidth: 320 }}>
          {/* 模式切换 */}
          <Segmented
            value={mode}
            onChange={switchMode}
            options={[
              { label: '📝 面试复盘', value: 'review' },
              { label: '🚀 面试前准备', value: 'prep' },
            ]}
            block
            style={{ marginBottom: 12 }}
          />

          <Card size="small" styles={{ body: { minHeight: 320 } }} style={{ marginBottom: 16 }}>
            {messages.length === 0 ? (
              <Typography.Text type="secondary">{emptyHint}</Typography.Text>
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

          {/* 快捷按钮：按模式切换 */}
          {mode === 'review' ? (
            <Space style={{ marginBottom: 8 }} wrap>
              <Button icon={<BulbOutlined />} onClick={simulateQuestion} disabled={loading}>
                帮我想想还会问什么（模拟追问）
              </Button>
              <Button onClick={() => send('请判断面试官对我的满意度，分析正面和负面信号。')} disabled={loading || !messages.length}>
                判断满意度
              </Button>
              <Button onClick={() => send('请总结我这场面试做得好的地方和不足之处。')} disabled={loading || !messages.length}>
                总结表现
              </Button>
              <Button onClick={() => send('如果我没有通过面试，请分析面试官可能出于哪些顾虑，我在哪些方面有所欠缺。')} disabled={loading || !messages.length}>
                失败归因
              </Button>
              <Button onClick={() => send('请从已复盘的题目中挑出最有深度和挑战的问题，给出有深度、有框架的改进版回答。')} disabled={loading || !messages.length}>
                关键深挖
              </Button>
              <Button icon={<ShareAltOutlined />} onClick={share} disabled={!messages.length}>
                分享对话
              </Button>
              <Button icon={<ClearOutlined />} onClick={() => setMessages([])} disabled={!messages.length}>
                清空
              </Button>
            </Space>
          ) : (
            <Space style={{ marginBottom: 8 }} wrap>
              <Button icon={<RocketOutlined />} onClick={() => send('请基于我的岗位画像和简历，预测 5-8 个最可能的面试题目（按概率排序），每题给出考察点、参考答案框架和简历锚点。')} disabled={loading}>
                预测面试题 + 参考答案
              </Button>
              <Button onClick={() => send('我想做公司定向面试准备，请先问我目标公司和业务方向。')} disabled={loading}>
                公司定向准备
              </Button>
              <Button onClick={() => send('我想练习概念辨析题，请出一道和这个岗位相关的概念对比题（如 xx vs xx），给出回答框架和示范。')} disabled={loading}>
                概念辨析题练习
              </Button>
              <Button onClick={() => send('我想练习场景分析题（产品 sense / 热点舆情 / 业务拆解），请出一道和这个岗位相关的场景题，给出分析框架和示范回答。')} disabled={loading}>
                场景分析题练习
              </Button>
              <Button onClick={() => send('面试最后面试官问我"你有什么想问我的"，请帮我准备 3-5 个高质量的反问问题，用虚实适中→聚焦→拉远的景别法组织。')} disabled={loading}>
                反问技巧指导
              </Button>
              <Button onClick={() => send('我想准备面试自我介绍，请帮我基于岗位画像和简历设计一个 1 分钟版本的自我介绍框架，按三段式（你是谁/为什么胜任/为什么选这家）组织。')} disabled={loading}>
                自我介绍准备
              </Button>
              <Button onClick={() => send('我想准备 HR 面，请帮我预测 HR 最可能问的问题（覆盖动机/自我认知/稳定性/薪资/压力五类），给出回答框架和避坑指南。')} disabled={loading}>
                HR 面准备
              </Button>
              <Button onClick={() => send('我想了解校招薪资谈判策略，请教我谈薪的核心原则、话术模板和 offer 比较方法。')} disabled={loading}>
                薪资谈判策略
              </Button>
              <Button onClick={() => send('我面试完了，请帮我判断是否需要发感谢信/跟进，并给出具体的话术建议。')} disabled={loading}>
                面试后跟进
              </Button>
              <Button icon={<ShareAltOutlined />} onClick={share} disabled={!messages.length}>
                分享对话
              </Button>
              <Button icon={<ClearOutlined />} onClick={() => setMessages([])} disabled={!messages.length}>
                清空
              </Button>
            </Space>
          )}

          <Input.TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            placeholder={placeholder}
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
