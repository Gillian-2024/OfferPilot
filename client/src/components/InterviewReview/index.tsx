import { useState, useMemo, useCallback, useRef } from 'react';
import {
  Button, Space, Card, Typography, message, Alert, Tag, Collapse, Empty,
  Segmented, Tooltip, Dropdown, Badge,
} from 'antd';
import {
  ShareAltOutlined, ClearOutlined, LinkOutlined, RightOutlined,
  BulbOutlined, RocketOutlined, AimOutlined, SwapOutlined,
  MessageOutlined, UserOutlined, QuestionCircleOutlined,
  SmileOutlined, SafetyCertificateOutlined, DollarOutlined,
  CopyOutlined, RedoOutlined, MoreOutlined, DeleteOutlined,
  HistoryOutlined, SendOutlined, ThunderboltOutlined,
  CheckCircleOutlined, FireOutlined, BookOutlined,
} from '@ant-design/icons';
import { Bubble, Sender, Welcome, Prompts, Actions, Suggestion, Conversations } from '@ant-design/x';
import type { ActionItem } from '@ant-design/x/es/actions/interface';
import XMarkdown from '@ant-design/x-markdown';
import { api } from '../../api/client';
import { Settings, SSEMessage } from '../../types';
import { getJDProfile, getResumeSummary, getJDKeywords, getJDResult, getHistory, clearHistory } from '../../store/local';
import { JDResultView } from '../shared/ResultViews';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

type Mode = 'review' | 'prep';

export default function InterviewReview({ settings, onGotoJD }: { settings: Settings; onGotoJD?: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [mode, setMode] = useState<Mode>('prep');
  const [inputValue, setInputValue] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const jdResult = getJDResult();
  const context = {
    jobProfile: getJDProfile(),
    resumeSummary: getResumeSummary(),
    jdKeywords: getJDKeywords(),
  };
  const hasContext = !!(context.jobProfile || context.resumeSummary);

  // 历史记录 → Conversations items
  const historyItems = useMemo(() => {
    const list = getHistory('interview');
    return list.map((h) => ({
      key: h.id,
      label: h.title || `对话 ${new Date(h.ts).toLocaleDateString('zh-CN')}`,
    }));
  }, [messages.length]); // refresh after new messages

  // 复制消息
  const copyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content).then(
      () => message.success('已复制'),
      () => message.error('复制失败')
    );
  }, []);

  // 重试上一条（重新发送最后一条 user 消息）
  const retryLast = useCallback(async () => {
    const lastUserIdx = messages.map((m, i) => ({ m, i })).reverse().find(({ m }) => m.role === 'user');
    if (!lastUserIdx) return;
    // 截断到该 user 消息之前
    const truncMsgs = messages.slice(0, lastUserIdx.i);
    setMessages(truncMsgs);
    // 重新发送
    const userMsg = messages[lastUserIdx.i];
    const newMsgs = [...truncMsgs, userMsg];
    setMessages([...newMsgs, { role: 'assistant', content: '', streaming: true }]);
    setLoading(true);
    try {
      let acc = '';
      for await (const msg of api.chat(
        newMsgs.map((m) => ({ role: m.role, content: m.content })),
        context, settings, mode,
      ) as AsyncGenerator<SSEMessage>) {
        if (msg.type === 'token') {
          acc += msg.text;
          setMessages((s) => {
            const c = [...s];
            c[c.length - 1] = { role: 'assistant', content: acc, streaming: true };
            return c;
          });
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
  }, [messages, context, settings, mode]);

  // Bubble roles 配置 — 深度利用 @ant-design/x
  const roles = useMemo(
    () => ({
      user: {
        placement: 'end' as const,
        variant: 'filled' as const,
        shape: 'round' as const,
        avatar: {
          icon: <UserOutlined />,
          style: { background: 'linear-gradient(135deg, #1677ff 0%, #4096ff 100%)' },
        },
        styles: {
          content: { borderRadius: 16, maxWidth: '85%' },
        },
      },
      assistant: {
        placement: 'start' as const,
        variant: 'shadow' as const,
        avatar: {
          icon: <BulbOutlined />,
          style: { background: 'linear-gradient(135deg, #f0f5ff 0%, #e6f4ff 100%)' },
        },
        header: (
          <Space size={4}>
            <Typography.Text strong style={{ fontSize: 13 }}>校招教练</Typography.Text>
            <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>AI策略PM</Tag>
          </Space>
        ),
        messageRender: (content: string) => (
          <div className="chat-markdown">
            <XMarkdown>{content}</XMarkdown>
          </div>
        ),
        footer: (content: string, info: { key?: string | number }) => {
          // 只在非流式消息显示 actions
          const msgIdx = typeof info.key === 'number' ? info.key : -1;
          const msg = messages[msgIdx];
          if (!msg || msg.streaming || !content) return null;
          return (
            <Actions
              items={[
                {
                  key: 'copy',
                  icon: <CopyOutlined />,
                  label: '复制',
                  onItemClick: () => copyMessage(content),
                },
                {
                  key: 'retry',
                  icon: <RedoOutlined />,
                  label: '重试',
                  onItemClick: () => retryLast(),
                },
                {
                  key: 'more',
                  icon: <MoreOutlined />,
                  children: [
                    {
                      key: 'share-msg',
                      label: '分享这条消息',
                      icon: <ShareAltOutlined />,
                      onItemClick: async () => {
                        const r = await api.createShare({
                          type: 'interview',
                          title: '教练回答片段',
                          content: `**Q**: ${messages[msgIdx - 1]?.content || '—'}\n\n**A**: ${content}`,
                        });
                        const url = `${location.origin}/share/${r.id}`;
                        navigator.clipboard.writeText(url);
                        message.success('已复制到剪贴板');
                      },
                    },
                  ],
                },
              ]}
            />
          );
        },
      },
    }),
    [messages, copyMessage, retryLast]
  );

  // 将消息转换为 Bubble.List items
  const bubbleItems = useMemo(
    () =>
      messages.map((m, i) => ({
        key: i,
        role: m.role,
        content: m.content,
        loading: m.streaming && !m.content,
        typing: m.streaming ? { step: 3, interval: 30, suffix: <span className="typing-cursor" /> } : undefined,
      })),
    [messages]
  );

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
    setInputValue('');
    setLoading(true);
    try {
      let acc = '';
      for await (const msg of api.chat(
        newMsgs.map((m) => ({ role: m.role, content: m.content })),
        context, settings, mode,
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

  // Prompts — 按模式切换，更丰富的图标和描述
  const reviewPrompts = [
    { key: 'simulate', icon: <FireOutlined style={{ color: '#f5222d' }} />, label: '模拟追问', description: '面试官还会问什么' },
    { key: 'satisfaction', icon: <SmileOutlined style={{ color: '#52c41a' }} />, label: '判断满意度', description: '面试官信号分析' },
    { key: 'summary', icon: <BookOutlined style={{ color: '#1677ff' }} />, label: '总结表现', description: '亮点与不足' },
    { key: 'failure', icon: <AimOutlined style={{ color: '#fa8c16' }} />, label: '失败归因', description: '可能的顾虑' },
    { key: 'deep', icon: <RocketOutlined style={{ color: '#722ed1' }} />, label: '关键深挖', description: '最有深度的题' },
  ];

  const prepPrompts = [
    { key: 'predict', icon: <RocketOutlined style={{ color: '#1677ff' }} />, label: '预测面试题', description: '含参考答案框架' },
    { key: 'company', icon: <AimOutlined style={{ color: '#f5222d' }} />, label: '公司定向', description: '定向准备' },
    { key: 'concept', icon: <SwapOutlined style={{ color: '#722ed1' }} />, label: '概念辨析', description: '对比题练习' },
    { key: 'scenario', icon: <QuestionCircleOutlined style={{ color: '#fa8c16' }} />, label: '场景分析', description: '产品sense' },
    { key: 'ask-back', icon: <MessageOutlined style={{ color: '#52c41a' }} />, label: '反问技巧', description: '景别法' },
    { key: 'intro', icon: <UserOutlined style={{ color: '#13c2c2' }} />, label: '自我介绍', description: '三段式框架' },
    { key: 'hr', icon: <SafetyCertificateOutlined style={{ color: '#eb2f96' }} />, label: 'HR面准备', description: '六维度覆盖' },
    { key: 'salary', icon: <DollarOutlined style={{ color: '#faad14' }} />, label: '薪资谈判', description: '策略话术' },
  ];

  const handlePromptClick = (info: { data: { key: string } }) => {
    const { key } = info.data;
    const promptMap: Record<string, string> = {
      simulate: '帮我想想还会问什么，基于我的岗位和简历出 3-5 个可能的追问题目（带考察点），不要给标准答案。',
      satisfaction: '请判断面试官对我的满意度，分析正面和负面信号。',
      summary: '请总结我这场面试做得好的地方和不足之处。',
      failure: '如果我没有通过面试，请分析面试官可能出于哪些顾虑，我在哪些方面有所欠缺。',
      deep: '请从已复盘的题目中挑出最有深度和挑战的问题，给出有深度、有框架的改进版回答。',
      predict: '请基于我的岗位画像和简历，预测 5-8 个最可能的面试题目（按概率排序），每题给出考察点、参考答案框架和简历锚点。',
      company: '我想做公司定向面试准备，请先问我目标公司和业务方向。',
      concept: '我想练习概念辨析题，请出一道和这个岗位相关的概念对比题（如 xx vs xx），给出回答框架和示范。',
      scenario: '我想练习场景分析题（产品 sense / 热点舆情 / 业务拆解），请出一道和这个岗位相关的场景题，给出分析框架和示范回答。',
      'ask-back': '面试最后面试官问我"你有什么想问我的"，请帮我准备 3-5 个高质量的反问问题，用虚实适中→聚焦→拉远的景别法组织。',
      intro: '我想准备面试自我介绍，请帮我基于岗位画像和简历设计一个 1 分钟版本的自我介绍框架，按三段式（你是谁/为什么胜任/为什么选这家）组织。',
      hr: '我想准备 HR 面，请帮我预测 HR 最可能问的问题（覆盖动机/自我认知/稳定性/薪资/压力五类），给出回答框架和避坑指南。',
      salary: '我想了解校招薪资谈判策略，请教我谈薪的核心原则、话术模板和 offer 比较方法。',
    };
    const text = promptMap[key];
    if (text) send(text);
  };

  // Suggestion items — 输入框上方的快捷建议
  const suggestionItems = useMemo(() => {
    if (messages.length > 0) return []; // 有对话时不显示
    if (mode === 'review') {
      return [
        { label: '📝 我刚面完字节一面，岗位是内容运营', value: '我刚面完字节一面，岗位是内容运营。面试官主要问了三个问题：1) 你觉得什么样的内容能吸引年轻用户 2) 如何衡量一个内容策略的效果 3) 如果让你负责一个新栏目，你会怎么冷启动。我的回答分别是…' },
        { label: '📝 昨天面了产品实习，感觉不错', value: '昨天面了产品实习，感觉不错。面试官问了我对用户增长的理解，我讲了 AARRR 模型但面试官追问了具体案例我没答好。帮我复盘一下。' },
        { label: '📝 群面被淘汰了', value: '群面被淘汰了，题目是关于如何提升一个短视频 app 的 DAU。我在群面中主要扮演了记录者和推进者的角色，最后没有被选为代表。帮我分析哪里可以做得更好。' },
      ];
    }
    return [
      { label: '🚀 我明天面试字节内容运营一面', value: '我明天面试字节内容运营岗一面，请帮我做面试前准备。' },
      { label: '🚀 下周有个产品实习的终面', value: '下周有个产品实习的终面（总监面），请帮我准备。' },
      { label: '🚀 我想准备群面', value: '我想准备群面（无领导小组讨论），请教我技巧和常见题型。' },
    ];
  }, [messages.length, mode]);

  return (
    <div className="tab-content">
      <div className="interview-layout">
        {/* 左：对照 JD + 简历摘要（只读钉住） */}
        <aside className="interview-sidebar">
          {hasContext ? (
            <>
              {jdResult ? (
                <Collapse
                  defaultActiveKey={['jd']}
                  ghost
                  className="sidebar-collapse"
                  items={[
                    {
                      key: 'jd',
                      label: (
                        <Space>
                          <ThunderboltOutlined style={{ color: '#1677ff' }} />
                          对照 JD
                          <Tag color="success" bordered={false}>已联动</Tag>
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
                <Card size="small" className="sidebar-card" title={
                  <Space>
                    <UserOutlined style={{ color: '#722ed1' }} />
                    对照简历摘要
                    <Tag color="processing" bordered={false}>已联动</Tag>
                  </Space>
                }>
                  <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }} ellipsis={{ rows: 6, expandable: true, symbol: '展开' }}>
                    {context.resumeSummary}
                  </Typography.Paragraph>
                </Card>
              ) : null}
            </>
          ) : (
            <Card size="small" className="sidebar-card sidebar-empty" title={
              <Space>
                <HistoryOutlined />
                对照上下文
                <Tag color="warning" bordered={false}>未联动</Tag>
              </Space>
            }>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="先拆解 JD 和简历，面试对话将自动关联上下文">
                {onGotoJD && (
                  <Button type="primary" size="small" onClick={onGotoJD} icon={<ThunderboltOutlined />}>
                    先去拆 JD
                  </Button>
                )}
              </Empty>
            </Card>
          )}
        </aside>

        {/* 右：面试对话区 */}
        <main className="interview-chat">
          {/* 模式切换 — 更精致 */}
          <div className="mode-switch">
            <Segmented
              value={mode}
              onChange={switchMode}
              options={[
                { label: <Space><RocketOutlined />面前准备</Space>, value: 'prep' },
                { label: <Space><BookOutlined />面后复盘</Space>, value: 'review' },
              ]}
              block
            />
            <Tooltip title="历史对话">
              <Button
                type="text"
                icon={<Badge count={historyItems.length} size="small" offset={[-2, 2]}><HistoryOutlined style={{ fontSize: 18 }} /></Badge>}
                onClick={() => setShowHistory(!showHistory)}
              />
            </Tooltip>
          </div>

          {/* 历史面板（可收起） */}
          {showHistory && historyItems.length > 0 && (
            <Card size="small" className="history-panel" title="历史对话" extra={
              <Button type="text" size="small" danger onClick={() => { clearHistory('interview'); setShowHistory(false); message.success('已清空'); }}>
                <DeleteOutlined /> 清空
              </Button>
            }>
              <Conversations
                items={historyItems}
                onActiveChange={() => {
                  message.info('历史记录仅供查看，暂不支持恢复');
                }}
                styles={{ item: { borderRadius: 8 } }}
              />
            </Card>
          )}

          {/* 对话区 */}
          <Card
            size="small"
            className="chat-card"
            styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 8px' } }}
          >
            {messages.length === 0 ? (
              <div className="welcome-container">
                <Welcome
                  icon={
                    <div className="welcome-icon">
                      {mode === 'prep' ? <RocketOutlined /> : <BookOutlined />}
                    </div>
                  }
                  title={mode === 'prep' ? '面前准备' : '面后复盘'}
                  description={
                    mode === 'prep'
                      ? '说明你的准备需求（目标公司 / 面试轮次 / 想练的题型），教练基于岗位画像 + 简历定制准备方案。'
                      : '描述面试基本情况（公司 / 岗位 / 第几轮），教练判定面试类型后逐题复盘。'
                  }
                  variant="borderless"
                  extra={
                    <div className="welcome-tips">
                      <Tag icon={<CheckCircleOutlined />} color="success">自动关联 JD + 简历</Tag>
                      <Tag icon={<FireOutlined />} color="processing">实时流式回答</Tag>
                      <Tag icon={<ShareAltOutlined />} color="default">一键分享对话</Tag>
                    </div>
                  }
                />
              </div>
            ) : (
              <Bubble.List
                autoScroll
                roles={roles}
                items={bubbleItems}
                style={{ flex: 1 }}
              />
            )}
          </Card>

          {/* 快捷 Prompts — 更紧凑的卡片 */}
          <div className="prompts-wrapper">
            <Prompts
              items={mode === 'review' ? reviewPrompts : prepPrompts}
              onItemClick={handlePromptClick}
              wrap
              styles={{
                item: {
                  flex: 'none',
                  width: 'calc(33.33% - 8px)',
                  minWidth: 130,
                  backgroundImage: 'linear-gradient(137deg, #e5f4ff 0%, #efe7ff 100%)',
                  border: 'none',
                  borderRadius: 12,
                  transition: 'all 0.2s',
                },
              }}
            />
          </div>

          {/* 工具按钮 */}
          <div className="chat-toolbar">
            <Space size={4}>
              <Button size="small" type="text" icon={<ShareAltOutlined />} onClick={share} disabled={!messages.length}>
                分享
              </Button>
              <Button size="small" type="text" icon={<ClearOutlined />} onClick={() => { setMessages([]); setShareUrl(''); }} disabled={!messages.length}>
                清空
              </Button>
            </Space>
            {messages.length > 0 && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {messages.filter((m) => m.role === 'user').length} 轮对话
              </Typography.Text>
            )}
          </div>

          {/* Suggestion + Sender — 输入框带建议 */}
          <Suggestion
            items={suggestionItems}
            onSelect={(value) => send(value)}
            block
          >
            {({ onTrigger, onKeyDown }) => (
              <Sender
                value={inputValue}
                onChange={(val) => {
                  setInputValue(val);
                  onTrigger(val === '/' ? undefined : false);
                }}
                onSubmit={send}
                loading={loading}
                onCancel={() => setLoading(false)}
                onKeyDown={onKeyDown}
                placeholder={
                  mode === 'prep'
                    ? '说说你的准备需求… 输入 / 查看建议'
                    : '描述面试题目 + 你的回答… 输入 / 查看建议'
                }
              />
            )}
          </Suggestion>

          {shareUrl && (
            <Alert
              type="success"
              showIcon
              icon={<LinkOutlined />}
              closable
              style={{ marginTop: 8, borderRadius: 8 }}
              message={
                <a href={shareUrl} target="_blank" rel="noreferrer">
                  {shareUrl}
                </a>
              }
            />
          )}
        </main>
      </div>
    </div>
  );
}
