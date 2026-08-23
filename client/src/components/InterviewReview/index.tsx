import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Button, Space, Card, Typography, message, Alert, Tag, Collapse, Empty,
  Badge, Radio, Divider,
} from 'antd';
import {
  ShareAltOutlined, ClearOutlined, LinkOutlined, RightOutlined,
  BulbOutlined, RocketOutlined, AimOutlined, SwapOutlined,
  MessageOutlined, UserOutlined, QuestionCircleOutlined,
  SmileOutlined, SafetyCertificateOutlined, DollarOutlined,
  CopyOutlined, RedoOutlined, MoreOutlined, DeleteOutlined,
  HistoryOutlined, SendOutlined, ThunderboltOutlined,
  CheckCircleOutlined, FireOutlined, BookOutlined,
  AudioMutedOutlined, InboxOutlined,
} from '@ant-design/icons';
import { Bubble, Sender, Prompts, Actions, Suggestion, Conversations } from '@ant-design/x';
import type { ActionItem } from '@ant-design/x/es/actions/interface';
import XMarkdown from '@ant-design/x-markdown';
import { api } from '../../api/client';
import { fetchHistory } from '../../api/auth';
import { useAuth } from '../../contexts/AuthContext';
import { Settings, SSEMessage } from '../../types';
import FileUpload from '../shared/FileUpload';
import { getJDProfile, getResumeSummary, getJDKeywords, getJDResult, getHistory, clearHistory } from '../../store/local';
import { JDResultView } from '../shared/ResultViews';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

export default function InterviewReview({ settings, onGotoJD, viewMode = 'prep' }: { settings: Settings; onGotoJD?: () => void; viewMode?: 'prep' | 'review' }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [uploadText, setUploadText] = useState(''); // 文件上传提取的文本
  const [showHistory, setShowHistory] = useState(false);
  const [serverHistory, setServerHistory] = useState<Array<{ id: string; title: string; created_at?: string }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  // viewMode 为只读 prop（由 Layout Tab 控制），不暴露切换入口
  const [round, setRound] = useState('');
  const [duration, setDuration] = useState('');

  const { isLoggedIn } = useAuth();

  const jdResult = getJDResult();
  const context = {
    jobProfile: getJDProfile(),
    resumeSummary: getResumeSummary(),
    jdKeywords: getJDKeywords(),
  };
  const hasContext = !!(context.jobProfile || context.resumeSummary);

  // 从服务端或 localStorage 拉取历史记录
  useEffect(() => {
    let cancelled = false;
    const loadHistory = async () => {
      setHistoryLoading(true);
      try {
        if (isLoggedIn) {
          const items = await fetchHistory('interview');
          if (!cancelled) {
            setServerHistory(items.map((h: any) => ({
              id: h.id,
              title: h.title || `对话 ${new Date(h.created_at).toLocaleDateString('zh-CN')}`,
            })));
          }
        } else {
          if (!cancelled) setServerHistory([]);
        }
      } catch {
        // fallback silently
        if (!cancelled) setServerHistory([]);
      }
      if (!cancelled) setHistoryLoading(false);
    };
    loadHistory();
    return () => { cancelled = true; };
  }, [isLoggedIn, messages.length]);

  // 历史记录 → Conversations items（登录用服务端，未登录用 localStorage）
  const historyItems = useMemo(() => {
    if (isLoggedIn && serverHistory.length > 0) {
      return serverHistory.map((h) => ({
        key: h.id,
        label: h.title,
      }));
    }
    const list = getHistory('interview');
    return list.map((h) => ({
      key: h.id,
      label: h.title || `对话 ${new Date(h.ts).toLocaleDateString('zh-CN')}`,
    }));
  }, [isLoggedIn, serverHistory, messages.length]);

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
        { ...context, interviewRound: round, interviewDuration: duration }, settings, viewMode,
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
  }, [messages, context, settings, viewMode, round, duration]);

  // Bubble roles 配置 — 深度利用 @ant-design/x
  const roles = useMemo(
    () => ({
      user: {
        placement: 'end' as const,
        variant: 'filled' as const,
        shape: 'round' as const,
        avatar: { icon: <UserOutlined /> },
      },
      assistant: {
        placement: 'start' as const,
        variant: 'shadow' as const,
        avatar: { icon: <BulbOutlined /> },
        header: (
          <Space size={4}>
            <Typography.Text strong className="fs-13">OfferPilot 领航员</Typography.Text>
            <Tag className="ir-role-tag">AI策略PM</Tag>
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
                          title: '领航员回答片段',
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


  const send = async (content: string) => {
    // 合并上传区文本：如果有未发送的上传内容，前置追加
    const uploadPart = uploadText ? `${uploadText}\n\n` : '';
    // 拼接面试筛选上下文
    const filterHints = [
      round ? `面试轮次：${round}` : '',
      duration ? `面试时长：${duration}` : '',
    ].filter(Boolean).join('；');
    const filterPart = filterHints ? `\n\n${filterHints}` : '';
    const finalContent = `${uploadPart}${content}${filterPart}`;
    if (!finalContent.trim() || loading) return;
    const userMsg: Msg = { role: 'user', content: finalContent };
    const newMsgs = [...messages, userMsg];
    setMessages([...newMsgs, { role: 'assistant', content: '', streaming: true }]);
    setInputValue('');
    setUploadText(''); // 发送后清空上传区
    setLoading(true);
    try {
      let acc = '';
      for await (const msg of api.chat(
        newMsgs.map((m) => ({ role: m.role, content: m.content })),
        { ...context, interviewRound: round, interviewDuration: duration }, settings, viewMode,
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
      .map((m) => `**${m.role === 'user' ? '我' : '领航员'}**：\n\n${m.content}`)
      .join('\n\n---\n\n');
    const title = viewMode === 'prep' ? '面试准备对话' : '面试复盘对话';
    const r = await api.createShare({ type: 'interview', title, content: md });
    setShareUrl(`${location.origin}/share/${r.id}`);
    message.success('分享链接已生成');
  };

  // Prompts — 按模式切换，更丰富的图标和描述
  const reviewPrompts = [
    { key: 'simulate', icon: <FireOutlined className="icon-primary" />, label: '模拟追问', description: '面试官还会问什么' },
    { key: 'summary', icon: <BookOutlined className="icon-primary" />, label: '总结表现', description: '亮点与不足' },
    { key: 'failure', icon: <AimOutlined className="icon-primary" />, label: '失败归因', description: '可能的顾虑' },
    { key: 'deep', icon: <RocketOutlined className="icon-primary" />, label: '关键深挖', description: '最有深度的题' },
    { key: 'satisfaction', icon: <SmileOutlined className="icon-primary" />, label: '判断满意度', description: '面试官信号分析' },
  ];

  const prepPrompts = [
    { key: 'intro', icon: <UserOutlined className="icon-primary" />, label: '自我介绍', description: '三段式框架' },
    { key: 'predict', icon: <RocketOutlined className="icon-primary" />, label: '预测面试题', description: '含参考答案框架' },
    { key: 'company', icon: <AimOutlined className="icon-primary" />, label: '公司定向', description: '定向准备' },
    { key: 'concept', icon: <SwapOutlined className="icon-primary" />, label: '概念辨析', description: '对比题练习' },
    { key: 'scenario', icon: <QuestionCircleOutlined className="icon-primary" />, label: '场景分析', description: '产品sense' },
    { key: 'ask-back', icon: <MessageOutlined className="icon-primary" />, label: '反问技巧', description: '景别法' },
    { key: 'hr', icon: <SafetyCertificateOutlined className="icon-primary" />, label: 'HR面准备', description: '六维度覆盖' },
    { key: 'salary', icon: <DollarOutlined className="icon-primary" />, label: '薪资谈判', description: '策略话术' },
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
    if (viewMode === 'review') {
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
  }, [messages.length, viewMode]);

  return (
    <div className="tab-content">
      <div className="interview-layout">
        {/* 左：对照 JD + 简历摘要（只读钉住，手机端默认折叠） */}
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
                          <ThunderboltOutlined className="icon-primary" />
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
                    <UserOutlined className="icon-purple" />
                    对照简历摘要
                    <Tag color="processing" bordered={false}>已联动</Tag>
                  </Space>
                }>
                  <Typography.Paragraph type="secondary" className="ir-sidebar-summary" ellipsis={{ rows: 6, expandable: true, symbol: '展开' }}>
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
          {/* 顶部栏：Welcome 左对齐 + 功能按钮右对齐（同一行） */}
          <div className="ir-top-bar">
            <Typography.Text type="secondary" className="ir-welcome-hint">
              {viewMode === 'prep' ? '描述你的面试需求，领航员帮你定制准备方案' : '描述你的面试情况和题目，逐题复盘分析'}
            </Typography.Text>
            <Space size={4} className="ir-top-actions">
              <Button size="small" className="btn-share" icon={<ShareAltOutlined />} onClick={share} disabled={!messages.length}>
                一键分享
              </Button>
              <Button size="small" type="text" icon={<ClearOutlined />} onClick={() => { setMessages([]); setShareUrl(''); }} disabled={!messages.length}>
                清空会话
              </Button>
              <Button
                size="small"
                type="text"
                icon={<Badge count={historyItems.length} size="small" offset={[-2, 2]}><HistoryOutlined className="icon-18" /></Badge>}
                onClick={() => setShowHistory(!showHistory)}
              >
                历史会话
              </Button>
            </Space>
          </div>

          {/* 历史面板（可收起） */}
          {showHistory && historyItems.length > 0 && (
            <Card size="small" className="history-panel" title="历史会话" extra={
              <Button type="text" size="small" danger onClick={() => { clearHistory('interview'); setShowHistory(false); message.success('已清空'); }}>
                <DeleteOutlined /> 清空
              </Button>
            }>
              <Conversations
                items={historyItems}
                onActiveChange={() => {
                  message.info('历史记录仅供查看，暂不支持恢复');
                }}
              />
            </Card>
          )}

          {/* 文件上传区 — 先上传，再聊天 */}
          <Card size="small" className="mb-16 ir-upload-card compact-upload-card">
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Space>
                <InboxOutlined className="icon-primary" />
                <Typography.Text strong className="fs-13">上传文件 · 粘贴会议纪要</Typography.Text>
              </Space>
              <FileUpload
                settings={settings}
                onText={setUploadText}
                label="点击或拖拽上传（PDF / Word / HTML / Markdown / TXT）"
              />
            </Space>
          </Card>

          {/* 对话区（含筛选、对话气泡、Prompts、输入框） */}
          <Card
            size="small"
            className="chat-card"
          >
            {/* 筛选栏 — 两行布局：第几面 / 面试时长，融入卡片顶部金色顶线 */}
            <div className="card-filter-bar">
              <div className="card-filter-row">
                <span className="filter-label">第几面</span>
                <Radio.Group value={round} onChange={(e) => setRound(e.target.value)} optionType="button" buttonStyle="outline" size="small">
                  {['第一面', '第二面', '第三面', '第四面', '第五面'].map((r) => (
                    <Radio.Button key={r} value={r}>{r}</Radio.Button>
                  ))}
                </Radio.Group>
              </div>
              <div className="card-filter-row">
                <span className="filter-label">面试时长</span>
                <Radio.Group value={duration} onChange={(e) => setDuration(e.target.value)} optionType="button" buttonStyle="outline" size="small">
                  {['10-20分钟', '20-40分钟', '40分钟以上'].map((d) => (
                    <Radio.Button key={d} value={d}>{d}</Radio.Button>
                  ))}
                </Radio.Group>
              </div>
            </div>

            {messages.length > 0 && (
              <Bubble.List autoScroll roles={roles} items={bubbleItems} />
            )}

            {/* 快捷 Prompts — 对话后的功能选项（8 宫格） */}
            <div className="card-prompts">
              {(viewMode === 'review' ? reviewPrompts : prepPrompts).map((p) => (
                <button
                  key={p.key}
                  className="card-prompt-card"
                  onClick={() => handlePromptClick({ data: { key: p.key } })}
                  type="button"
                >
                  <span className="card-prompt-icon">{p.icon}</span>
                  <span className="card-prompt-label">{p.label}</span>
                  <span className="card-prompt-desc">{p.description}</span>
                </button>
              ))}
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
                    viewMode === 'prep'
                      ? '说说你的准备需求… 输入 / 查看建议'
                      : '描述面试题目 + 你的回答… 输入 / 查看建议'
                  }
                />
              )}
            </Suggestion>
          </Card>

          {shareUrl && (
            <Alert
              type="success"
              showIcon
              icon={<LinkOutlined />}
              closable
              className="ir-share-alert"
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
