import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Spin, Card, Typography, Result } from 'antd';
import XMarkdown from '@ant-design/x-markdown';
import { api } from '../api/client';
import { JDResultView, ResumeResultView } from '../components/shared/ResultViews';

export default function SharePage() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    api
      .getShare(id!)
      .then((d) => setData(d))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="sp-loading">
        <Spin tip="加载分享…" />
      </div>
    );
  }
  if (err) {
    return <Result status="404" title="分享不存在或已过期" extra={<Link to="/">返回首页</Link>} />;
  }

  let content;
  try {
    const obj = JSON.parse(data.content);
    content =
      data.type === 'jd' ? (
        <JDResultView data={obj} />
      ) : data.type === 'resume' ? (
        <ResumeResultView data={obj} />
      ) : (
        <pre className="sp-raw">{data.content}</pre>
      );
  } catch {
    content = <XMarkdown>{data.content}</XMarkdown>;
  }

  return (
    <div className="sp-body">
      <div className="sp-brand">
        <img src="/logo.svg" alt="" className="sp-brand-logo" />
        <span className="sp-brand-name">OfferPilot 领航员</span>
        <span className="sp-brand-sub">只读分享</span>
      </div>
      <Typography.Title level={4}>{data.title}</Typography.Title>
      <Typography.Text type="secondary" className="sp-meta">
        OfferPilot 领航员 · 只读分享 · {new Date(data.createdAt).toLocaleString('zh-CN')}
      </Typography.Text>
      <Card>{content}</Card>
      <div className="sp-footer">
        <Link to="/">自己也试试 →</Link>
      </div>
    </div>
  );
}
