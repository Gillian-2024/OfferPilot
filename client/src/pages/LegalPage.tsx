import { useNavigate } from 'react-router-dom';
import { Button, Space } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import XMarkdown from '@ant-design/x-markdown';
import privacyMd from './legal/privacy-policy.md?raw';
import termsMd from './legal/user-agreement.md?raw';

interface LegalPageProps {
  kind: 'privacy' | 'terms';
}

const DOCS = {
  privacy: privacyMd,
  terms: termsMd,
};

export default function LegalPage({ kind }: LegalPageProps) {
  const navigate = useNavigate();

  return (
    <div className="legal-page">
      <header className="app-header">
        <Space>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
            返回
          </Button>
        </Space>
      </header>
      <div className="legal-body">
        <XMarkdown content={DOCS[kind]} />
      </div>
    </div>
  );
}
