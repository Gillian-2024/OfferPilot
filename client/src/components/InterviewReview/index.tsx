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
  ProfileOutlined, ExclamationCircleOutlined, ShopOutlined, CrownOutlined, TeamOutlined, MailOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import { Bubble, Sender, Prompts, Actions, Suggestion, Conversations } from '@ant-design/x';
import type { ActionItem } from '@ant-design/x/es/actions/interface';
import XMarkdown from '@ant-design/x-markdown';
import { api } from '../../api/client';
import { fetchHistory, syncHistoryBatch, deleteHistoryItem, getToken } from '../../api/auth';
import { useAuth } from '../../contexts/AuthContext';
import { Settings, SSEMessage } from '../../types';
import FileUpload from '../shared/FileUpload';
import { getJDProfile, getResumeSummary, getJDKeywords, getJDResult, getActiveJob, getGrowthPlan, setGrowthPlan, clearGrowthPlan, getUserMemory, clearUserMemory, accumulateMemory, getHistory, clearHistory, upsertHistory, deleteHistoryItemLocal, genId } from '../../store/local';
import { recordModelResult } from '../../store/local';
import type { GrowthPlan } from '../../store/local';
import { JDResultBrief } from '../shared/ResultViews';
import { exportNodeToPdf, reportFilename } from '../../utils/exportPdf';
import { useSidebar } from '../../contexts/SidebarContext';
import { track } from '../../utils/analytics';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

// P2-3 成长档案导出体：结构化纯文本（html2canvas 不吃 markdown 高亮，全用标签 + pre-wrap）
function GrowthPlanPdfBody({ plan }: { plan: GrowthPlan }) {
  return (
    <div className="pdf-growth">
      <h3 className="pdf-report-title">我的成长档案</h3>
      <div className="pdf-report-meta">
        <span>来源岗位：{plan.sourceJob || '—'}</span>
        <span>更新时间：{new Date(plan.updatedAt).toLocaleDateString('zh-CN')}</span>
      </div>
      {plan.weakest_link && <p><b>最该先解决：</b>{plan.weakest_link}</p>}
      {plan.knowledge_gaps?.length > 0 && <p><b>知识缺口：</b>{plan.knowledge_gaps.join('；')}</p>}
      {plan.practice_items?.length > 0 && <p><b>待练项：</b>{plan.practice_items.join('；')}</p>}
      {plan.next_strategy && <p><b>下轮策略：</b>{plan.next_strategy}</p>}
      {plan.summary && <p><b>复盘结论：</b>{plan.summary}</p>}
    </div>
  );
}

export default function InterviewReview({ settings, onGotoJD, viewMode = 'prep' }: { settings: Settings; onGotoJD?: () => void; viewMode?: 'prep' | 'review' }) {
  const { isLoggedIn } = useAuth();
  const { activeJobId } = useSidebar();

  // P1-1 会话恢复：当前会话 = 本地历史一条（draftKey 标记 id，debounce upsert），刷新/切岗位回读，历史点击恢复
  const draftKey = `cjc:interviewActiveId:${viewMode}:${activeJobId ?? 'none'}`;
  const readDraft = useCallback(() => {
    const id = localStorage.getItem(draftKey);
    if (!id) return null;
    return getHistory('interview').find((x) => x.id === id) || null;
  }, [draftKey]);
  const activeIdRef = useRef<string | null>(localStorage.getItem(draftKey));
  const [messages, setMessages] = useState<Msg[]>(() => readDraft()?.data?.messages || []);
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  // P2-3 导出 PDF：面试对话走隐藏结构化容器（不截气泡 UI），成长档案独立导出
  const [exporting, setExporting] = useState(false);
  const [growthExporting, setGrowthExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const growthExportRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [uploadText, setUploadText] = useState(''); // 文件上传提取的文本
  const [showHistory, setShowHistory] = useState(false);
  const [serverHistory, setServerHistory] = useState<Array<{ id: string; title: string; created_at?: string; data?: any; jobId?: string }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // P1-1 历史变更 tick：persist/恢复/清空后自增，驱动历史面板刷新（localStorage 变更不触发 messages.length 变化，须显式计数）
  const [histTick, setHistTick] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  // viewMode 为只读 prop（由 Layout Tab 控制），不暴露切换入口
  const [round, setRound] = useState(() => readDraft()?.data?.round || '');
  const [duration, setDuration] = useState(() => readDraft()?.data?.duration || '');

  // P0-2：成长档案沉淀状态 + 展开控制（跨岗位全局一份，来源岗位见 sourceJob）
  const [archiving, setArchiving] = useState(false);
  const [archiveExpanded, setArchiveExpanded] = useState(false);
  const [growthTick, setGrowthTick] = useState(0);
  const growthPlan = useMemo(() => getGrowthPlan(), [growthTick, activeJobId]);

  // P1-2：用户级记忆（跨会话累积），沉淀/清除后经 memTick 重读
  const [memTick, setMemTick] = useState(0);
  const memory = useMemo(() => getUserMemory(), [memTick]);

  // activeJobId 来自 context：切换岗位触发重渲染，重读该岗位上下文 + 成长档案
  const jdResult = activeJobId == null ? null : getJDResult();
  const jobName = getActiveJob()?.name || '';
  const context = {
    jobProfile: getJDProfile(),
    resumeSummary: getResumeSummary(),
    jdKeywords: getJDKeywords(),
    growthPlan,
    memory,
  };
  const hasContext = !!(context.jobProfile || context.resumeSummary);

  // P1-1 持久化当前会话（本地 upsert + 登录态服务端批量 upsert，fire-and-forget）
  const persistSession = useCallback((msgs: Msg[]) => {
    const id = activeIdRef.current;
    if (!id || !msgs.length) return;
    if (msgs[msgs.length - 1].streaming) return; // P1-1 流式半成品不落盘，防刷新恢复出卡死打字气泡
    const title = [...msgs].reverse().find((m) => m.role === 'user')?.content.slice(0, 30) || `对话 ${new Date().toLocaleDateString('zh-CN')}`;
    const data = { messages: msgs, round, duration, mode: viewMode };
    upsertHistory('interview', { id, ts: Date.now(), title, data, jobId: activeJobId ?? undefined });
    localStorage.setItem(draftKey, id);
    setHistTick((t) => t + 1); // P1-1 新会话落盘后刷新历史面板
    if (getToken()) {
      syncHistoryBatch([{ id, type: 'interview', ts: Date.now(), title, data, jobId: activeJobId ?? undefined }]).catch(() => {});
    }
  }, [round, duration, viewMode, activeJobId, draftKey]);

  // P1-1 会话自动持久化：600ms debounce（流式期间每条 token 会重置计时，稳定后落盘）
  useEffect(() => {
    if (!activeIdRef.current || !messages.length) return;
    const timer = setTimeout(() => persistSession(messages), 600);
    return () => clearTimeout(timer);
  }, [messages, persistSession]);

  // P1-1 切岗位 / 切 prep-review Tab：按新 draftKey 回读对应会话（无则空会话）
  useEffect(() => {
    const draft = readDraft();
    activeIdRef.current = localStorage.getItem(draftKey);
    setMessages(draft?.data?.messages || []);
    setRound(draft?.data?.round || '');
    setDuration(draft?.data?.duration || '');
    setShareUrl('');
    setShowHistory(false);
  }, [viewMode, activeJobId, readDraft]);

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
              data: h.data,
              jobId: h.project_id,
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
  }, [isLoggedIn, serverHistory, messages.length, histTick]);

  // P1-1 从历史恢复会话：本地 getHistory / 服务端 serverHistory 双数据源，均需含 data
  const restoreHistory = (key: string) => {
    const remote = isLoggedIn ? serverHistory.find((h) => h.id === key) : null;
    const local = getHistory('interview').find((h) => h.id === key);
    const item = remote?.data ? remote : local;
    if (!item?.data) return message.warning('该历史会话数据缺失，无法恢复');
    const d = item.data;
    if (d.mode && d.mode !== viewMode) {
      message.info(`该会话来自「${d.mode === 'prep' ? '面试准备' : '面试复盘'}」，已按内容恢复`);
    }
    activeIdRef.current = key;
    localStorage.setItem(draftKey, key);
    setMessages(Array.isArray(d.messages) ? d.messages : []);
    setRound(d.round || '');
    setDuration(d.duration || '');
    setShareUrl('');
    setShowHistory(false);
    setHistTick((t) => t + 1);
  };

  // 清空当前会话：删本地该条 + 服务端（登录态），重置 activeId/draftKey
  const clearCurrentSession = () => {
    const id = activeIdRef.current;
    if (id) {
      deleteHistoryItemLocal('interview', id);
      if (getToken()) deleteHistoryItem(id).catch(() => {});
    }
    activeIdRef.current = null;
    localStorage.removeItem(draftKey);
    setMessages([]);
    setShareUrl('');
    setInputValue('');
    setHistTick((t) => t + 1);
  };

  // 清空全部历史：清本地 + 服务端逐条删（登录态），重置 activeId/draftKey
  const clearAllHistory = () => {
    clearHistory('interview');
    if (getToken()) serverHistory.forEach((h) => deleteHistoryItem(h.id).catch(() => {}));
    activeIdRef.current = null;
    localStorage.removeItem(draftKey);
    setMessages([]);
    setShareUrl('');
    setShowHistory(false);
    setHistTick((t) => t + 1);
    message.success('已清空');
  };

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
        activeIdRef.current || undefined,
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
      const finalMsgs: Msg[] = [...truncMsgs, userMsg, { role: 'assistant', content: acc, streaming: false }];
      setMessages(finalMsgs);
      persistSession(finalMsgs); // P1-1 重试后同样立即落盘
    } catch (e: any) {
      message.error(e.message);
      setMessages((s) => s.slice(0, -1));
    }
    setLoading(false);
  }, [messages, context, settings, viewMode, round, duration, persistSession]);

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


  // P2-3 导出 PDF 数据源：user 消息 → 下一条 assistant 消息配成 Q/A 对（跳过流式半成品）
  const qaPairs = useMemo(() => {
    const pairs: { q: string; a: string }[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role !== 'user') continue;
      const a = messages[i + 1];
      if (a?.role === 'assistant' && !a.streaming) pairs.push({ q: messages[i].content, a: a.content });
    }
    return pairs;
  }, [messages]);

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
    if (!activeIdRef.current) activeIdRef.current = genId();
    track(`interview_${viewMode}_message_sent`, { content_length: content.length, has_upload_text: !!uploadText });
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
        activeIdRef.current || undefined,
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
      const finalMsgs: Msg[] = [...messages, userMsg, { role: 'assistant', content: acc, streaming: false }];
      setMessages(finalMsgs);
      persistSession(finalMsgs); // P1-1 完成即落盘，防切页丢尾部
      track(`interview_${viewMode}_message_done`, { output_length: acc.length });
    } catch (e: any) {
      message.error(e.message);
      setMessages((s) => s.slice(0, -1));
    }
    setLoading(false);
  };

  const share = async () => {
    if (!messages.length) return;
    track('interview_share_click');
    const md = messages
      .map((m) => `**${m.role === 'user' ? '我' : '领航员'}**：\n\n${m.content}`)
      .join('\n\n---\n\n');
    const title = viewMode === 'prep' ? '面试准备对话' : '面试复盘对话';
    const r = await api.createShare({ type: 'interview', title, content: md });
    setShareUrl(`${location.origin}/share/${r.id}`);
    message.success('分享链接已生成');
    track('interview_share_done');
  };

  // P0-2：沉淀复盘结论 → 成长档案（一次性收敛，复用 analyze 的绕 tool_use 模式）
  const doArchive = async () => {
    if (!messages.length) return;
    setArchiving(true);
    track('interview_archive_start', { message_count: messages.length });
    try {
      for await (const msg of api.consolidateGrowth(messages, context, settings) as AsyncGenerator<SSEMessage>) {
        if (msg.type === 'result') {
          // P1-2：practiced 从 growthPlan 剥离，仅进用户记忆累积，不污染存档
          const { practiced, ...rest } = msg.data;
          setGrowthPlan({ ...rest, sourceJob: jobName, updatedAt: Date.now() });
          recordModelResult(msg.model || settings.model || '', true);
          accumulateMemory(practiced, rest.summary);
          setGrowthTick((t) => t + 1);
          setMemTick((t) => t + 1);
          setArchiveExpanded(true);
          message.success('已沉淀到成长档案，后续准备 / 复盘会自动参考');
          track('interview_archive_done', { output_length: JSON.stringify(rest).length });
        } else if (msg.type === 'error') {
          message.error(msg.message);
          recordModelResult(settings.model || '', false);
        }
      }
    } catch (e: any) {
      message.error(e.message);
      recordModelResult(settings.model || '', false);
    }
    setArchiving(false);
  };

  // P2-3 导出面试对话摘要 PDF：隐藏容器整块截图（默认渲染器，样式表正常加载）
  const exportPdf = async () => {
    track('interview_pdf_export', { view_mode: viewMode });
    const node = exportRef.current;
    if (!node || !messages.length) return;
    setExporting(true);
    try {
      const filename = reportFilename(jobName || '未命名岗位', viewMode === 'prep' ? '面试准备' : '面试复盘');
      await exportNodeToPdf(node, filename, { exportClass: 'pdf-exporting' });
      message.success('PDF 已导出');
      track('interview_pdf_export_done');
    } catch (e: any) {
      message.error(`导出失败：${e?.message || e}`);
      track('error_client', { context: 'interview_pdf_export', message: e.message || String(e) });
    } finally {
      setExporting(false);
    }
  };

  // P2-3 导出成长档案 PDF（档案卡片独立下载）
  const exportGrowthPdf = async () => {
    track('growth_archive_pdf_export');
    const node = growthExportRef.current;
    if (!node || !growthPlan) return;
    setGrowthExporting(true);
    try {
      const filename = reportFilename(growthPlan.sourceJob || jobName || '未命名岗位', '成长档案');
      await exportNodeToPdf(node, filename, { exportClass: 'pdf-exporting' });
      message.success('成长档案已导出');
      track('growth_archive_pdf_export_done');
    } catch (e: any) {
      message.error(`导出失败：${e?.message || e}`);
      track('error_client', { context: 'growth_archive_pdf_export', message: e.message || String(e) });
    } finally {
      setGrowthExporting(false);
    }
  };

  // 收尾气泡：复盘最后一条 user 消息带结束语时，提示沉淀
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  const showWrapUp = viewMode === 'review' && !!lastUserMsg && /(结束了|没了|就这些|复盘完|差不多了|先这样|就这样)/.test(lastUserMsg.content);

  // Prompts — 按模式切换，更丰富的图标和描述
  // review 快捷卡按「复盘后的增值动作」4 组切（MECE）：整体表现/预判深挖/面试官视角/Offer
  const reviewGroups = [
    {
      title: '整体表现',
      prompts: [
        { key: 'summary', icon: <BookOutlined className="icon-primary" />, label: '总结表现', description: '亮点与不足' },
        { key: 'failure', icon: <AimOutlined className="icon-primary" />, label: '失败归因', description: '可能的顾虑' },
      ],
    },
    {
      title: '预判与深挖',
      prompts: [
        { key: 'simulate', icon: <FireOutlined className="icon-primary" />, label: '模拟追问', description: '面试官还会问什么' },
        { key: 'deep', icon: <RocketOutlined className="icon-primary" />, label: '关键深挖', description: '最有深度的题' },
      ],
    },
    {
      title: '面试官视角',
      prompts: [
        { key: 'satisfaction', icon: <SmileOutlined className="icon-primary" />, label: '判断满意度', description: '面试官信号分析' },
      ],
    },
    {
      title: 'Offer 之后',
      prompts: [
        { key: 'salary', icon: <DollarOutlined className="icon-primary" />, label: '薪资谈判', description: '策略话术' },
        { key: 'follow-up', icon: <MailOutlined className="icon-primary" />, label: '面试后跟进', description: '感谢信/被拒' },
      ],
    },
  ];

  // prep 快捷卡按「面试官会怎么考你」4 组正交切（MECE）：整场/环节/题型/轮次
  const prepGroups = [
    {
      title: '整场准备',
      prompts: [
        { key: 'predict', icon: <RocketOutlined className="icon-primary" />, label: '预测面试题', description: '含参考答案框架' },
        { key: 'company', icon: <AimOutlined className="icon-primary" />, label: '公司定向', description: '定向准备' },
      ],
    },
    {
      title: '环节准备',
      prompts: [
        { key: 'intro', icon: <UserOutlined className="icon-primary" />, label: '自我介绍', description: '三段式框架' },
        { key: 'ask-back', icon: <MessageOutlined className="icon-primary" />, label: '反问技巧', description: '景别法' },
      ],
    },
    {
      title: '题型攻坚',
      prompts: [
        { key: 'concept', icon: <SwapOutlined className="icon-primary" />, label: '概念辨析', description: '对比题练习' },
        { key: 'scenario', icon: <QuestionCircleOutlined className="icon-primary" />, label: '场景分析', description: '产品sense' },
        { key: 'behavior', icon: <ProfileOutlined className="icon-primary" />, label: '行为经历题', description: 'STAR框架' },
        { key: 'pressure', icon: <ExclamationCircleOutlined className="icon-primary" />, label: '压力/质疑题', description: '接住质疑' },
      ],
    },
    {
      title: '轮次定向',
      prompts: [
        { key: 'business', icon: <ShopOutlined className="icon-primary" />, label: '业务面', description: '项目深挖' },
        { key: 'executive', icon: <CrownOutlined className="icon-primary" />, label: '高管面', description: '全局思维' },
        { key: 'hr', icon: <SafetyCertificateOutlined className="icon-primary" />, label: 'HR面', description: '六维度覆盖' },
        { key: 'group', icon: <TeamOutlined className="icon-primary" />, label: '群面', description: '无领导小组' },
      ],
    },
  ];

  const handlePromptClick = (info: { data: { key: string } }) => {
    const { key } = info.data;
    track(`interview_${viewMode}_prompt_click`, { prompt_key: key });
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
      behavior: '我想练习行为经历题（讲一个你…类问题），请出 3-5 个和这个岗位相关的高频行为题，每题给出 STAR 回答框架和简历锚点。',
      pressure: '我想准备压力面和被质疑场景的应对，请先讲接住质疑的思路，再出 3 个常见的压力/质疑场景题让我演练。',
      business: '我想准备业务面（业务负责人/Mentor 轮），请预测可能的问题并给回答框架，重点是项目深挖和场景迁移。',
      executive: '我想准备高管面（总监/Boss 轮），请预测可能的问题并给回答框架，重点是宏观视野和战略判断。',
      group: '我想准备群面（无领导小组讨论），请教我角色分工、四阶段流程和高分行为，并出一道真题示范。',
      'follow-up': '面试结束后应该怎么跟进？包括感谢信、等待结果、被拒后怎么办。',
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
        {/* 右：对照 JD + 简历摘要（只读钉住，手机端默认折叠）—— 视觉位置由 CSS order 控制 */}
        <aside className="interview-sidebar">
          {hasContext ? (
            <>
              {jdResult ? (
                <Collapse
                  ghost
                  className="sidebar-collapse"
                  items={[
                    {
                      key: 'jd',
                      label: (
                        <Space>
                          <ThunderboltOutlined className="icon-primary" />
                          对照 JD{jobName ? ` · ${jobName}` : ''}
                          <Tag color="success" bordered={false}>已联动</Tag>
                        </Space>
                      ),
                      extra: onGotoJD ? (
                        <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); onGotoJD(); }}>
                          去拆解 <RightOutlined />
                        </Button>
                      ) : null,
                      children: <JDResultBrief data={jdResult} />,
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

          {/* 成长档案卡片 — 与是否联动上下文无关，prep/review 都显示 */}
          <Card
            size="small"
            className="sidebar-card ir-archive-card"
            title={
              <Space>
                <BulbOutlined className="icon-gold" />
                我的成长档案
                {growthPlan && <Tag color="gold" bordered={false}>已沉淀</Tag>}
              </Space>
            }
            extra={
              growthPlan ? (
                <Space size={0}>
                  <Button type="text" size="small" icon={<FilePdfOutlined />} loading={growthExporting} disabled={growthExporting} onClick={exportGrowthPdf}>
                    下载
                  </Button>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => { clearGrowthPlan(); setGrowthTick((t) => t + 1); message.success('已清空成长档案'); }}>
                    清除
                  </Button>
                </Space>
              ) : null
            }
          >
            {growthPlan ? (
              <div>
                {growthPlan.sourceJob && (
                  <Typography.Text type="secondary" className="ir-archive-source">
                    来源：{growthPlan.sourceJob} · {new Date(growthPlan.updatedAt).toLocaleDateString('zh-CN')}
                  </Typography.Text>
                )}
                <Collapse
                  ghost
                  activeKey={archiveExpanded ? ['body'] : []}
                  onChange={(k) => setArchiveExpanded(k.includes('body'))}
                  items={[{
                    key: 'body',
                    label: '查看档案内容',
                    children: (
                      <div className="ir-archive-body">
                        {growthPlan.weakest_link && <p><b>最该先解决：</b>{growthPlan.weakest_link}</p>}
                        {growthPlan.knowledge_gaps?.length > 0 && <p><b>知识缺口：</b>{growthPlan.knowledge_gaps.join('；')}</p>}
                        {growthPlan.practice_items?.length > 0 && <p><b>待练项：</b>{growthPlan.practice_items.join('；')}</p>}
                        {growthPlan.next_strategy && <p><b>下轮策略：</b>{growthPlan.next_strategy}</p>}
                      </div>
                    ),
                  }]}
                />
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="复盘后沉淀结论，短板自动带到下一轮">
                {viewMode === 'review' && messages.length > 0 && (
                  <Button size="small" type="primary" ghost icon={<BulbOutlined />} onClick={doArchive} loading={archiving}>
                    沉淀当前复盘
                  </Button>
                )}
              </Empty>
            )}
          </Card>

          {/* 我的记忆卡片 — 跨会话累积（P1-2），prep/review 都显示 */}
          <Card
            size="small"
            className="sidebar-card ir-memory-card"
            title={
              <Space>
                <BookOutlined className="icon-purple" />
                我的记忆
                {memory && memory.sessionCount > 0 && <Tag color="processing" bordered={false}>已沉淀 {memory.sessionCount} 场</Tag>}
              </Space>
            }
            extra={
              memory && (memory.practiced?.length > 0 || memory.conclusions?.length > 0) ? (
                <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => { clearUserMemory(); setMemTick((t) => t + 1); message.success('已清空我的记忆'); }}>
                  清除
                </Button>
              ) : null
            }
          >
            {memory && (memory.practiced?.length > 0 || memory.conclusions?.length > 0) ? (
              <div className="ir-memory-body">
                {memory.practiced?.length > 0 && (
                  <div className="ir-memory-block">
                    <div className="ir-memory-label">练过</div>
                    <div className="ir-memory-chips">
                      {memory.practiced.slice(0, 8).map((p) => (
                        <span key={p.title} className="ir-memory-chip">
                          {p.title}
                          {p.count > 1 ? ` ×${p.count}` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {memory.conclusions?.length > 0 && (
                  <div className="ir-memory-block">
                    <div className="ir-memory-label">复盘结论</div>
                    <ul className="ir-memory-list">
                      {memory.conclusions.slice(0, 5).map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="沉淀复盘后，练过的题与结论会累积记忆" />
            )}
          </Card>
        </aside>

        {/* 中：面试对话区（核心交互，视觉居中） */}
        <main className="interview-chat">
          {/* 顶部栏：Welcome 左对齐 + 功能按钮右对齐（同一行） */}
          <div className="ir-top-bar">
            <Typography.Text type="secondary" className="ir-welcome-hint">
              {viewMode === 'prep' ? '描述你的面试需求，领航员帮你定制准备方案' : '描述你的面试情况和题目，逐题复盘分析'}
            </Typography.Text>
            <Space size={4} className="ir-top-actions">
              {viewMode === 'review' && messages.length > 0 && (
                <Button size="small" type="primary" ghost icon={<BulbOutlined />} onClick={doArchive} loading={archiving}>
                  沉淀复盘结论
                </Button>
              )}
              <Button size="small" className="btn-share" icon={<ShareAltOutlined />} onClick={share} disabled={!messages.length}>
                一键分享
              </Button>
              <Button size="small" className="btn-share" icon={<FilePdfOutlined />} onClick={exportPdf} disabled={!messages.length || exporting} loading={exporting}>
                导出 PDF
              </Button>
              <Button size="small" type="text" icon={<ClearOutlined />} onClick={clearCurrentSession} disabled={!messages.length}>
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

          {/* 一键分享生成的链接 — 紧跟顶部栏，点按钮同屏可见，不沉底 */}
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

          {/* 历史面板（可收起） */}
          {showHistory && historyItems.length > 0 && (
            <Card size="small" className="history-panel" title="历史会话" extra={
              <Button type="text" size="small" danger onClick={clearAllHistory}>
                <DeleteOutlined /> 清空
              </Button>
            }>
              <Conversations
                items={historyItems}
                onActiveChange={(key) => restoreHistory(String(key))}
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
                onUpload={(file) => {
                  const ext = file.name.split('.').pop()?.toLowerCase() || '';
                  track(`interview_${viewMode}_file_upload`, { file_type: ext, file_size_bytes: file.size });
                }}
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

            {showWrapUp && (
              <Alert
                type="info"
                showIcon
                icon={<BulbOutlined />}
                className="ir-wrapup-alert"
                message="这场复盘到一段落了"
                description={
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <span>把结论沉淀进成长档案，下一轮准备 / 复盘会自动带上短板。</span>
                    <Button size="small" type="primary" onClick={doArchive} loading={archiving} icon={<BulbOutlined />}>
                      沉淀复盘结论
                    </Button>
                  </Space>
                }
              />
            )}

            {/* 快捷 Prompts — 按组渲染（MECE 分组，组标题 + 组内卡网格） */}
            <div className="card-prompts">
              {(viewMode === 'review' ? reviewGroups : prepGroups).map((g) => (
                <div key={g.title} className="card-prompt-group">
                  <div className="card-prompt-group-title">{g.title}</div>
                  <div className="card-prompt-group-grid">
                    {g.prompts.map((p) => (
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
                </div>
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

        </main>
      </div>

      {/* P2-3 导出容器：离屏隐藏（默认渲染器截图，不截气泡 UI；Q/A 结构化 + 成长档案附录） */}
      <div className="pdf-export-report" ref={exportRef} aria-hidden>
        <h2 className="pdf-report-title">{viewMode === 'prep' ? '面试准备对话摘要' : '面试复盘对话摘要'}</h2>
        <div className="pdf-report-meta">
          <span>岗位：{jobName || '未命名岗位'}</span>
          <span>日期：{new Date().toLocaleDateString('zh-CN')}</span>
          {round && <span>第几面：{round}</span>}
          {duration && <span>面试时长：{duration}</span>}
          <span>消息数：{qaPairs.length} 组 Q/A</span>
        </div>
        {qaPairs.length > 0 ? (
          qaPairs.map((p, i) => (
            <div key={i} className="pdf-qa">
              <div className="pdf-qa-q">Q{i + 1}. {p.q}</div>
              <div className="pdf-qa-a">{p.a}</div>
            </div>
          ))
        ) : (
          <div className="pdf-qa">暂无有效对话内容（需先完成一轮问答）</div>
        )}
        {growthPlan && (
          <div className="pdf-section pdf-growth">
            <h3 className="pdf-report-title">成长档案附录</h3>
            <div className="pdf-report-meta">
              <span>来源岗位：{growthPlan.sourceJob || '—'}</span>
              <span>更新时间：{new Date(growthPlan.updatedAt).toLocaleDateString('zh-CN')}</span>
            </div>
            {growthPlan.weakest_link && <p><b>最该先解决：</b>{growthPlan.weakest_link}</p>}
            {growthPlan.knowledge_gaps?.length > 0 && <p><b>知识缺口：</b>{growthPlan.knowledge_gaps.join('；')}</p>}
            {growthPlan.practice_items?.length > 0 && <p><b>待练项：</b>{growthPlan.practice_items.join('；')}</p>}
            {growthPlan.next_strategy && <p><b>下轮策略：</b>{growthPlan.next_strategy}</p>}
            {growthPlan.summary && <p><b>复盘结论：</b>{growthPlan.summary}</p>}
          </div>
        )}
      </div>
      {growthPlan && (
        <div className="pdf-export-report" ref={growthExportRef} aria-hidden>
          <GrowthPlanPdfBody plan={growthPlan} />
        </div>
      )}
    </div>
  );
}
