import { lazy, Suspense, useMemo } from 'react';
import { Card, Empty, Alert, Tooltip, Spin } from 'antd';
import { ScoreBadge } from './ScoreBadge';
import { JDResult, ResumeResult } from '../../types';

// 图表库体积大且只在有结果时渲染，拆异步 chunk 不进首屏
const Radar = lazy(() =>
  import('@ant-design/charts').then((m) => ({ default: m.Radar }))
);

/* ── 状态色约定（过 dataviz 校验：色盲可分 + 永不单独用色，必带文字/图标）──
   满足 ok=#1f7a4d · 部分 part=#d97706 · 缺失 miss=#a61b1b */

const rvTitle = (text: string, note?: string) => (
  <span className="rv-title">
    {text}
    {note && <span className="rv-title-note">{note}</span>}
  </span>
);

/* 雷达图数据：由 requirement_gaps 状态聚合（服务端无维度子分，客户端派生）
   口径：满足=1 · 部分=0.5 · 缺失=0，按维度分桶归一为百分制 */
const DIM_ORDER = ['硬性要求', '软性素质', '筛选优先级', '关键词', '其他'];
function bucketOf(dim: string) {
  if (dim.includes('硬')) return '硬性要求';
  if (dim.includes('软')) return '软性素质';
  if (dim.includes('优先')) return '筛选优先级';
  if (dim.includes('关键')) return '关键词';
  return '其他';
}
function buildRadar(gaps: ResumeResult['requirement_gaps']) {
  const buckets = new Map<string, { met: number; part: number; miss: number }>();
  for (const g of gaps || []) {
    const key = bucketOf(g.dimension || '');
    const b = buckets.get(key) || { met: 0, part: 0, miss: 0 };
    if (g.status.includes('缺失')) b.miss += 1;
    else if (g.status.includes('部分')) b.part += 1;
    else if (g.status.includes('满足')) b.met += 1;
    else b.part += 1; // 未知措辞按中间态计
    buckets.set(key, b);
  }
  return DIM_ORDER.filter((d) => buckets.has(d)).map((d) => {
    const b = buckets.get(d)!;
    const total = b.met + b.part + b.miss;
    const score = Math.round(((b.met + 0.5 * b.part) / total) * 100);
    return { dimension: d, score, detail: `满足度 ${score}% · ${b.met} 满足 / ${b.part} 部分 / ${b.miss} 缺失` };
  });
}

const REDUCE_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ────────────────────────── JD 拆解视图 ────────────────────────── */

const tierKind = (t: string) => (t.toLowerCase().includes('must') ? 'must' : 'nice');
const probKind = (p: string) => (p.includes('高') ? 'miss' : p.includes('低') ? 'neutral' : 'part');

/* 图表色渲染时从设计 token 取值，跟随系统明暗切换（字面量为降级兜底） */
const cssToken = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export function JDResultView({ data }: { data: JDResult | null }) {
  if (!data) return <Empty description="暂无拆解结果" />;

  const viable = data.campus_channel?.viable;

  return (
    <div className="rv-stack">
      {/* 岗位画像 hero */}
      <Card size="small" className="rv-card">
        <div className="rv-jd-hero">
          <div className="rv-jd-hero-main">
            <span className="rv-chip rv-chip--navy">{data.job_type}</span>
            <div className="rv-jd-profile">{data.job_profile}</div>
            <div className="rv-jd-viable-text">应届可行性：{data.campus_viable}</div>
          </div>
          {viable !== undefined && (
            <span className={`rv-verdict ${viable ? 'rv-verdict--ok' : 'rv-verdict--miss'}`}>
              {viable ? '✓ 校招可行' : '✕ 校招不可行'}
            </span>
          )}
        </div>
      </Card>

      {/* 预警置顶 */}
      {data.red_flags?.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message="JD 预警信号"
          description={
            <ul className="rv-flag-list">
              {data.red_flags.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          }
        />
      )}

      <div className="rv-duo">
        <Card size="small" className="rv-card" title={rvTitle('硬性门槛')}>
          <div className="rv-def-list">
            <div className="rv-def-row">
              <span className="rv-def-label">学历</span>
              <span>{data.hard_requirements?.education || '—'}</span>
            </div>
            <div className="rv-def-row">
              <span className="rv-def-label">经验</span>
              <span>{data.hard_requirements?.experience || '—'}</span>
            </div>
            <div className="rv-def-row">
              <span className="rv-def-label">行业</span>
              <span>{data.hard_requirements?.industry || '—'}</span>
            </div>
            <div className="rv-def-row">
              <span className="rv-def-label">必备技能</span>
              <span className="rv-chips">
                {(data.hard_requirements?.must_skills || []).map((s) => (
                  <span key={s} className="rv-chip rv-chip--navy">{s}</span>
                ))}
              </span>
            </div>
          </div>
        </Card>

        <Card size="small" className="rv-card" title={rvTitle('筛选优先级')}>
          <div className="rv-prio-list">
            {(data.screening_priority || []).map((p, i) => (
              <div key={i} className="rv-prio-row">
                <span className={`rv-chip ${tierKind(p.tier) === 'must' ? 'rv-chip--must' : 'rv-chip--neutral'}`}>
                  {p.tier}
                </span>
                <span className="rv-prio-item">{p.item}</span>
                <span className="rv-prio-note">{p.note}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="rv-duo">
        <Card size="small" className="rv-card" title={rvTitle('软性素质')}>
          <span className="rv-chips">
            {(data.soft_competencies || []).map((s) => (
              <span key={s} className="rv-chip rv-chip--purple">{s}</span>
            ))}
          </span>
        </Card>
        <Card size="small" className="rv-card" title={rvTitle('简历关键词', '筛简历核心词')}>
          <span className="rv-chips">
            {(data.keyword_list || []).map((k) => (
              <span key={k} className="rv-chip rv-chip--navy">{k}</span>
            ))}
          </span>
        </Card>
      </div>

      <Card size="small" className="rv-card" title={rvTitle('面试考点预测')}>
        <div className="rv-focus-list">
          {(data.interview_focus || []).map((f, i) => (
            <div key={i} className="rv-focus-row">
              <span className={`rv-chip rv-chip--${probKind(f.probability)}`}>{f.probability}</span>
              <div className="rv-focus-main">
                <span className="rv-focus-topic">{f.topic}</span>
                <span className="rv-focus-prep">{f.prep}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card size="small" className="rv-card" title={rvTitle('应届校招校准')}>
        <div className="rv-def-list">
          <div className="rv-def-row">
            <span className="rv-def-label">是否可行</span>
            <span className={`rv-chip ${data.campus_channel?.viable ? 'rv-chip--ok' : 'rv-chip--miss'}`}>
              {data.campus_channel?.viable ? '✓ 可行' : '✕ 不可行'}
            </span>
          </div>
          <div className="rv-def-row">
            <span className="rv-def-label">可放宽</span>
            <span>{data.campus_channel?.loosen || '—'}</span>
          </div>
          <div className="rv-def-row">
            <span className="rv-def-label">硬门槛</span>
            <span>{data.campus_channel?.blocker || '—'}</span>
          </div>
        </div>
      </Card>

      {/* Step 4 深解读：成对双栏，单侧存在时占满宽 */}
      {(data.real_work_scenario || data.industry_workflow) && (
        <div className="rv-duo">
          {data.real_work_scenario && (
            <Card size="small" className="rv-card" title={rvTitle('真实工作场景')}>
              <p className="rv-prose">{data.real_work_scenario}</p>
            </Card>
          )}
          {data.industry_workflow && (
            <Card size="small" className="rv-card" title={rvTitle('行业上下游全景')}>
              <p className="rv-prose">{data.industry_workflow}</p>
            </Card>
          )}
        </div>
      )}
      {(data.career_path || data.kpi_and_barrier) && (
        <div className="rv-duo">
          {data.career_path && (
            <Card size="small" className="rv-card" title={rvTitle('职业路径')}>
              <div className="rv-def-list">
                <div className="rv-def-row">
                  <span className="rv-def-label">未来可转向</span>
                  <span className="rv-chips">
                    {(data.career_path.exits || []).map((e) => (
                      <span key={e} className="rv-chip rv-chip--navy">{e}</span>
                    ))}
                  </span>
                </div>
                <div className="rv-def-row">
                  <span className="rv-def-label">也适合投</span>
                  <span className="rv-chips">
                    {(data.career_path.also_fit || []).map((a) => (
                      <span key={a} className="rv-chip rv-chip--purple">{a}</span>
                    ))}
                  </span>
                </div>
              </div>
            </Card>
          )}
          {data.kpi_and_barrier && (
            <Card size="small" className="rv-card" title={rvTitle('KPI & 壁垒能力')}>
              <div className="rv-def-list">
                <div className="rv-def-row">
                  <span className="rv-def-label">核心 KPI</span>
                  <span className="rv-chips">
                    {(data.kpi_and_barrier.kpis || []).map((k) => (
                      <span key={k} className="rv-chip rv-chip--part">{k}</span>
                    ))}
                  </span>
                </div>
                <div className="rv-def-row">
                  <span className="rv-def-label">壁垒能力</span>
                  <span className="rv-chips">
                    {(data.kpi_and_barrier.barriers || []).map((b) => (
                      <span key={b} className="rv-chip rv-chip--miss">{b}</span>
                    ))}
                  </span>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── 简历拆解视图 ────────────────────────── */

const gapKind = (status: string) =>
  status.includes('缺失') ? 'miss' : status.includes('部分') ? 'part' : 'ok';
const sevKind = (sev: string) => (sev === '高' ? 'miss' : sev === '中' ? 'part' : 'neutral');

export function ResumeResultView({ data }: { data: ResumeResult | null }) {
  const radarData = useMemo(() => buildRadar(data?.requirement_gaps || []), [data]);

  if (!data) return <Empty description="暂无拆解结果" />;

  const matched = data.keyword_hits?.matched || [];
  const missing = data.keyword_hits?.missing || [];
  const showRadar = radarData.length >= 3;

  // 雷达配色取自 token：线/面=藏蓝强调、网格=边框色、轴标签=三级文字色
  const chartLine = cssToken('--color-primary-soft', '#24466e');
  const chartGrid = cssToken('--color-border', '#c9d3e0');
  const chartLabel = cssToken('--color-text-tertiary', '#6b7280');

  const gapCard = (
    <Card
      size="small"
      className="rv-card"
      title={rvTitle('JD 对照 gap 矩阵', '对照基准：JD 拆解结果')}
    >
      <div className="rv-gap-list">
        {(data.requirement_gaps || []).map((g, i) => (
          <div key={i} className="rv-gap-row">
            <span className={`rv-status rv-status--${gapKind(g.status)}`}>
              {gapKind(g.status) === 'ok' ? '✓' : gapKind(g.status) === 'miss' ? '✕' : '◐'} {g.status}
            </span>
            <div className="rv-gap-main">
              <div className="rv-gap-req">
                <span className="rv-gap-dim">{g.dimension}</span>
                {g.requirement}
              </div>
              <div className="rv-gap-evidence">证据：{g.evidence}</div>
              {g.gap && g.gap !== '无' && <div className="rv-gap-miss-text">缺口：{g.gap}</div>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );

  return (
    <div className="rv-stack">
      {/* Hero：校徽徽章 + 定位一句话 */}
      <Card size="small" className="rv-card">
        <div className="rv-hero">
          <ScoreBadge score={data.match_score} size={116} caption="匹配度" />
          <div className="rv-hero-body">
            <div className="rv-hero-kicker">简历 × JD 匹配评估</div>
            <div className="rv-hero-positioning">{data.positioning}</div>
            <div className="rv-hero-basis">评分依据：{data.score_basis}</div>
          </div>
        </div>
        {data.differentiator && (
          <div className="rv-diff">
            <span className="rv-diff-label">最值钱的点</span>
            {data.differentiator}
          </div>
        )}
      </Card>

      {/* 雷达（维度满足度，gap 聚合派生）+ gap 矩阵互为图表与明细 */}
      {showRadar ? (
        <div className="rv-duo rv-duo--radar">
          <Card
            size="small"
            className="rv-card"
            title={rvTitle('维度满足度', '满足=100 · 部分=50 · 缺失=0 聚合')}
          >
            <Suspense fallback={<Spin size="small" className="rv-chart-loading" />}>
              <Radar
                data={radarData}
                xField="dimension"
                yField="score"
                height={300}
                autoFit
                animate={!REDUCE_MOTION}
                scale={{ y: { domainMax: 100, tickCount: 5 } }}
                axis={{
                  x: {
                    grid: true,
                    gridStroke: chartGrid,
                    gridLineDash: [0, 0],
                    line: false,
                    tick: false,
                    label: true,
                    labelAlign: 'horizontal',
                    labelAutoRotate: false,
                    labelFill: chartLabel,
                    labelFontSize: 12,
                  },
                  y: {
                    grid: true,
                    gridStroke: chartGrid,
                    gridLineDash: [0, 0],
                    line: false,
                    tick: false,
                    label: false,
                    zIndex: 1,
                  },
                }}
                style={{ stroke: chartLine, lineWidth: 2 }}
                area={{ style: { fill: chartLine, fillOpacity: 0.14 } }}
                point={{ size: 4, style: { fill: chartLine, stroke: '#ffffff', lineWidth: 2 } }}
                tooltip={{ title: 'dimension', items: [{ field: 'detail', name: '构成' }] }}
              />
            </Suspense>
          </Card>
          {gapCard}
        </div>
      ) : (
        gapCard
      )}

      <div className="rv-duo">
        <Card
          size="small"
          className="rv-card"
          title={rvTitle('关键词命中')}
          extra={<span className="rv-card-extra">命中 {matched.length} · 缺失 {missing.length}</span>}
        >
          {matched.length > 0 && (
            <div className="rv-kw-group">
              <div className="rv-kw-label">已命中</div>
              <span className="rv-chips">
                {matched.map((m) => (
                  <Tooltip key={m.keyword} title={m.evidence}>
                    <span className="rv-chip rv-chip--ok">✓ {m.keyword}</span>
                  </Tooltip>
                ))}
              </span>
            </div>
          )}
          {missing.length > 0 && (
            <div className="rv-kw-group">
              <div className="rv-kw-label">未命中</div>
              <span className="rv-chips">
                {missing.map((k) => (
                  <span key={k} className="rv-chip rv-chip--miss-outline">✕ {k}</span>
                ))}
              </span>
            </div>
          )}
          {matched.length === 0 && missing.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无关键词数据" />}
        </Card>

        <Card size="small" className="rv-card" title={rvTitle('逐模块诊断')}>
          <div className="rv-module-list">
            {(data.module_issues || []).map((m) => (
              <div key={m.module} className="rv-module">
                <div className="rv-module-head">
                  {m.module}
                  <span className="rv-module-count">{m.issues.length} 项</span>
                </div>
                {m.issues.map((iss, i) => (
                  <div key={i} className="rv-issue">
                    <span className={`rv-sev rv-sev--${sevKind(iss.severity)}`}>{iss.severity}</span>
                    <span className="rv-issue-type">{iss.type}</span>
                    <span className="rv-issue-detail">{iss.detail}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card size="small" className="rv-card" title={rvTitle('Quick Wins', '按 ROI 排序，从第 1 条做起')}>
        <ol className="rv-wins">
          {(data.quick_wins || []).map((w, i) => (
            <li key={i} className="rv-win">
              <span className="rv-win-num">{i + 1}</span>
              <span>{w}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
