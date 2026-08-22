import { Card, Descriptions, Tag, Typography, Progress, List, Empty, Space, Alert } from 'antd';
import { JDResult, ResumeResult } from '../../types';

const tierColor = (t: string) => (t.toLowerCase().includes('must') ? 'red' : 'blue');
const probColor = (p: string) => (p.includes('高') ? 'red' : p.includes('低') ? 'green' : 'orange');

export function JDResultView({ data }: { data: JDResult | null }) {
  if (!data) return <Empty description="暂无结果" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card size="small" title={<Space><Tag color="blue">{data.job_type}</Tag>{data.job_profile}</Space>}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="应届可行性">{data.campus_viable}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title="硬性门槛">
        <Descriptions column={1} size="small">
          <Descriptions.Item label="学历">{data.hard_requirements?.education}</Descriptions.Item>
          <Descriptions.Item label="经验">{data.hard_requirements?.experience}</Descriptions.Item>
          <Descriptions.Item label="行业">{data.hard_requirements?.industry}</Descriptions.Item>
          <Descriptions.Item label="必备技能">
            {(data.hard_requirements?.must_skills || []).map((s) => (
              <Tag key={s}>{s}</Tag>
            ))}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title="软性素质">
        <Space wrap>
          {(data.soft_competencies || []).map((s) => (
            <Tag key={s} color="purple">{s}</Tag>
          ))}
        </Space>
      </Card>

      <Card size="small" title="简历关键词（筛简历核心词）">
        <Space wrap>
          {(data.keyword_list || []).map((k) => (
            <Tag key={k} color="geekblue">{k}</Tag>
          ))}
        </Space>
      </Card>

      <Card size="small" title="筛选优先级">
        <List
          size="small"
          dataSource={data.screening_priority || []}
          renderItem={(item) => (
            <List.Item>
              <Space>
                <Tag color={tierColor(item.tier)}>{item.tier}</Tag>
                <span>{item.item}</span>
                <Typography.Text type="secondary">— {item.note}</Typography.Text>
              </Space>
            </List.Item>
          )}
        />
      </Card>

      <Card size="small" title="面试考点预测">
        <List
          size="small"
          dataSource={data.interview_focus || []}
          renderItem={(item) => (
            <List.Item>
              <Space direction="vertical" size={0}>
                <Space>
                  <Tag color={probColor(item.probability)}>{item.probability}</Tag>
                  <strong>{item.topic}</strong>
                </Space>
                <Typography.Text type="secondary">{item.prep}</Typography.Text>
              </Space>
            </List.Item>
          )}
        />
      </Card>

      <Card size="small" title="应届校招校准">
        <Descriptions column={1} size="small">
          <Descriptions.Item label="是否可行">
            {data.campus_channel?.viable ? <Tag color="green">可行</Tag> : <Tag color="red">不可行</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="可放宽">{data.campus_channel?.loosen}</Descriptions.Item>
          <Descriptions.Item label="硬门槛">{data.campus_channel?.blocker}</Descriptions.Item>
        </Descriptions>
      </Card>

      {data.red_flags?.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message="JD 预警信号"
          description={
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {data.red_flags.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          }
        />
      )}

      {/* Step 4: 岗位深解读 */}
      {data.real_work_scenario && (
        <Card size="small" title="🔍 真实工作场景">
          <Typography.Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            {data.real_work_scenario}
          </Typography.Paragraph>
        </Card>
      )}

      {data.industry_workflow && (
        <Card size="small" title="🏭 行业上下游全景">
          <Typography.Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            {data.industry_workflow}
          </Typography.Paragraph>
        </Card>
      )}

      {data.career_path && (
        <Card size="small" title="🛤️ 职业路径">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="未来可转向">
              <Space wrap>
                {(data.career_path.exits || []).map((e) => (
                  <Tag key={e} color="cyan">{e}</Tag>
                ))}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="也适合投">
              <Space wrap>
                {(data.career_path.also_fit || []).map((a) => (
                  <Tag key={a} color="geekblue">{a}</Tag>
                ))}
              </Space>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {data.kpi_and_barrier && (
        <Card size="small" title="📊 KPI & 壁垒能力">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="核心 KPI">
              <Space wrap>
                {(data.kpi_and_barrier.kpis || []).map((k) => (
                  <Tag key={k} color="orange">{k}</Tag>
                ))}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="壁垒能力">
              <Space wrap>
                {(data.kpi_and_barrier.barriers || []).map((b) => (
                  <Tag key={b} color="volcano">{b}</Tag>
                ))}
              </Space>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}
    </div>
  );
}

export function ResumeResultView({ data }: { data: ResumeResult | null }) {
  if (!data) return <Empty description="暂无结果" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card size="small">
        <Space direction="vertical" style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography.Text strong>匹配度评分</Typography.Text>
            <Typography.Text style={{ fontSize: 24, fontWeight: 700, color: '#1677ff' }}>
              {data.match_score}
            </Typography.Text>
          </div>
          <Progress percent={data.match_score} showInfo={false} strokeColor="#1677ff" />
          <Typography.Text type="secondary">{data.score_basis}</Typography.Text>
        </Space>
      </Card>

      {data.requirement_gaps?.length > 0 && (
        <Card size="small" title="JD 对照 gap 分析（对照基准：JD 拆解结果）">
          <List
            size="small"
            dataSource={data.requirement_gaps}
            renderItem={(g) => (
              <List.Item>
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <Space wrap>
                    <Tag color={g.status === '满足' ? 'green' : g.status === '缺失' ? 'red' : 'orange'}>
                      {g.status}
                    </Tag>
                    <Tag>{g.dimension}</Tag>
                    <Typography.Text strong>{g.requirement}</Typography.Text>
                  </Space>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>证据：{g.evidence}</Typography.Text>
                  {g.gap && g.gap !== '无' && (
                    <Typography.Text type="danger" style={{ fontSize: 13 }}>缺口：{g.gap}</Typography.Text>
                  )}
                </Space>
              </List.Item>
            )}
          />
        </Card>
      )}

      <Card size="small" title="定位 & 差异化">
        <Descriptions column={1} size="small">
          <Descriptions.Item label="整体定位">{data.positioning}</Descriptions.Item>
          <Descriptions.Item label="最值钱的点">{data.differentiator}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title="关键词命中">
        <Descriptions column={1} size="small">
          <Descriptions.Item label="已命中">
            {(data.keyword_hits?.matched || []).map((m) => (
              <Tag key={m.keyword} color="green">
                {m.keyword} <Typography.Text type="secondary" style={{ fontSize: 12 }}>: {m.evidence}</Typography.Text>
              </Tag>
            ))}
          </Descriptions.Item>
          <Descriptions.Item label="缺失">
            {(data.keyword_hits?.missing || []).map((k) => (
              <Tag key={k} color="red">{k}</Tag>
            ))}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title="逐模块诊断">
        <List
          size="small"
          dataSource={data.module_issues || []}
          renderItem={(m) => (
            <List.Item>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Typography.Text strong>{m.module}</Typography.Text>
                {m.issues.map((iss, i) => (
                  <Space key={i}>
                    <Tag color={iss.severity === '高' ? 'red' : iss.severity === '中' ? 'orange' : 'default'}>
                      {iss.severity}
                    </Tag>
                    <Tag>{iss.type}</Tag>
                    <Typography.Text>{iss.detail}</Typography.Text>
                  </Space>
                ))}
              </Space>
            </List.Item>
          )}
        />
      </Card>

      <Card size="small" title="Quick Wins（按 ROI 排序）">
        <List
          size="small"
          dataSource={data.quick_wins || []}
          renderItem={(item, i) => (
            <List.Item>
              <Space>
                <Tag color="blue">{i + 1}</Tag>
                <span>{item}</span>
              </Space>
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}
