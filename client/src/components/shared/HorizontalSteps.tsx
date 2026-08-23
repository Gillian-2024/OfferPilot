import { CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons';

interface Step { label: string; done: boolean; active?: boolean };

export default function Steps({ steps }: { steps: Step[] }) {
  const activeIdx = steps.findIndex(s => s.active);

  return (
    <div className="hsteps">
      {steps.map((s, i) => (
        <div key={i} className={`hstep ${s.done ? 'hstep--done' : ''} ${s.active ? 'hstep--active' : ''}`}>
          <div className="hstep-icon">
            {s.done ? (
              <CheckCircleOutlined />
            ) : s.active ? (
              <LoadingOutlined />
            ) : (
              <span className="hstep-icon-wait">{i + 1}</span>
            )}
          </div>
          <div className="hstep-body">
            <div className="hstep-label">{s.label}</div>
            <div className={`hstep-desc ${s.active ? 'hstep-desc--active' : ''}`}>
              {s.done ? '已完成' : s.active ? '处理中…' : `第${i + 1}步`}
            </div>
          </div>
          {/* 连线到下一步 */}
          {i < steps.length - 1 && (
            <div className={`hstep-line ${s.done ? 'hstep-line--done' : s.active ? 'hstep-line--active' : ''}`} />
          )}
        </div>
      ))}
    </div>
  );
}
