import { useState } from 'react';
import { Upload, Input, message, Typography, Space, Button } from 'antd';
import { InboxOutlined, DeleteOutlined } from '@ant-design/icons';
import { uploadFile } from '../../api/client';
import { Settings } from '../../types';

const { Dragger } = Upload;
const { TextArea } = Input;

interface Props {
  settings: Settings;
  onText: (t: string) => void;
  label?: string;
  accept?: string;
}

export default function FileUpload({ settings, onText, label, accept }: Props) {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUpload = async (file: File) => {
    setLoading(true);
    try {
      const res = await uploadFile(file, settings);
      setText(res.text);
      setName(res.name);
      onText(res.text);
      message.success(`解析成功：${res.chars} 字`);
    } catch (e: any) {
      message.error(e.message || '解析失败');
    }
    setLoading(false);
    return false; // 阻止 antd 自动上传
  };

  return (
    <div>
      <Dragger
        accept={accept || '.pdf,.docx,.html,.htm,.txt'}
        showUploadList={false}
        beforeUpload={handleUpload}
        disabled={loading}
        style={{ marginBottom: 8 }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">{loading ? '解析中…' : label || '点击或拖拽上传（PDF / Word / HTML / TXT）'}</p>
      </Dragger>
      {name && (
        <Space style={{ marginBottom: 8 }}>
          <Typography.Text type="secondary">已解析：{name}</Typography.Text>
          <Button
            type="link"
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => {
              setText('');
              setName('');
              onText('');
            }}
          >
            清空
          </Button>
        </Space>
      )}
      <TextArea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onText(e.target.value);
        }}
        rows={6}
        placeholder="或直接粘贴文本"
      />
    </div>
  );
}
