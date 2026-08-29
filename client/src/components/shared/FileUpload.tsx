import { useId, useState } from 'react';
import { Input, message, Typography, Space, Button } from 'antd';
import { InboxOutlined, DeleteOutlined } from '@ant-design/icons';
import { uploadFile } from '../../api/client';
import { Settings } from '../../types';

const { TextArea } = Input;

interface Props {
  settings: Settings;
  onText: (t: string) => void;
  label?: string;
  accept?: string;
  /** Called with the File object right before upload (for analytics). Optional. */
  onUpload?: (file: File) => void;
}

// Supported formats shown in the upload button label text.
const FORMAT_LABELS: Record<string, string> = {
  jd: 'PDF / Word / HTML / Markdown',
  resume: 'PDF / Word / HTML / Markdown',
  interview: 'PDF / Word / HTML / Markdown',
};

// 用原生 <label htmlFor> 绑定隐藏 file input，而非 antd Dragger。
// antd Dragger 的点击走 inputRef.click()（程序式 JS 调用），受管浏览器策略/扩展
// 拦截程序式 .click() 时选框不开 → “点不动”。<label> 点击由浏览器在用户手势层
// 触发文件选择器，不走程序式 .click()，绕开该拦截。复用 antd 既有类名保视觉一致。
export default function FileUpload({ settings, onText, label, accept, onUpload }: Props) {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // useId() 生成的 ID 含冒号（如 :r9:），Chrome 下 label[for] 绑定不稳定，
  // sanitize 掉非字母数字字符确保 label-input 关联可靠。
  const inputId = useId().replace(/[^a-zA-Z0-9_-]/g, '-');

  const handleUpload = async (file: File) => {
    setLoading(true);
    try {
      if (onUpload) onUpload(file); // analytics hook, called before upload
      const res = await uploadFile(file, settings);
      setText(res.text);
      setName(res.name);
      onText(res.text);
      message.success(`解析成功：${res.chars} 字`);
    } catch (e: any) {
      message.error(e.message || '解析失败');
    }
    setLoading(false);
  };

  return (
    <div>
      <input
        id={inputId}
        type="file"
        accept={accept || '.pdf,.docx,.html,.htm,.txt,.md'}
        disabled={loading}
        className="fu-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = ''; // 允许重复上传同一文件
        }}
      />
      <label
        htmlFor={inputId}
        className={`fu-label ant-upload ant-upload-drag${dragOver ? ' ant-upload-drag-hover' : ''}${loading ? ' ant-upload-disabled' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleUpload(f);
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">{loading ? '解析中…' : label || `点击或拖拽上传（${FORMAT_LABELS.interview}）`}</p>
      </label>
      {name && (
        <Space className="mb-8">
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
        rows={3}
        placeholder="直接粘贴文本"
      />
    </div>
  );
}
