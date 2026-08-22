import { useEffect } from 'react';
import { Drawer, Form, Select, Input, Button, Space, Alert, Typography } from 'antd';
import { Settings, Provider } from '../../types';

const PROVIDERS: { value: Provider; label: string; hint: { baseUrl: string; model: string } }[] = [
  {
    value: 'openai',
    label: 'OpenAI（gpt-4o / gpt-4o-mini）',
    hint: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  },
  {
    value: 'claude',
    label: 'Claude（Anthropic 官方 / 兼容网关）',
    hint: { baseUrl: 'https://api.anthropic.com', model: 'claude-3-5-haiku-20241022' },
  },
  {
    value: 'domestic',
    label: '国内模型（智谱/通义/DeepSeek，OpenAI 兼容协议）',
    hint: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  },
  {
    value: 'gateway',
    label: '自建 LLM 网关（glm-5.2）',
    hint: { baseUrl: 'https://llm-gateway.example.com/anthropic', model: 'tencent/glm-5.2' },
  },
];

export default function SettingsPanel({
  open,
  onClose,
  settings,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onSave: (s: Settings) => void;
}) {
  const [form] = Form.useForm<Settings>();

  useEffect(() => {
    if (open) form.setFieldsValue(settings);
  }, [open, settings, form]);

  const onProviderChange = (v: Provider) => {
    const hint = PROVIDERS.find((p) => p.value === v)?.hint;
    if (hint) form.setFieldsValue({ baseUrl: hint.baseUrl, model: hint.model });
  };

  return (
    <Drawer open={open} onClose={onClose} title="模型设置" width={440} destroyOnClose>
      <Alert
        type="info"
        showIcon
        message="双轨制：留空读服务端 .env；填写则覆盖（存 localStorage，随请求透传）"
        className="mb-16"
      />
      <Typography.Paragraph type="secondary" className="fs-13">
        选定 Provider 后会预填默认 Base URL / Model，可自行修改。API Key 仅存本机浏览器。
      </Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={onSave} initialValues={settings}>
        <Form.Item label="Provider" name="provider">
          <Select options={PROVIDERS.map((p) => ({ value: p.value, label: p.label }))} onChange={onProviderChange} />
        </Form.Item>
        <Form.Item label="API Key（覆盖服务端 .env）" name="apiKey">
          <Input.Password placeholder="留空 = 用服务端 .env 配置" autoComplete="off" />
        </Form.Item>
        <Form.Item label="Base URL（覆盖）" name="baseUrl">
          <Input placeholder="留空 = 用服务端 .env" />
        </Form.Item>
        <Form.Item label="Model（覆盖）" name="model">
          <Input placeholder="留空 = 用服务端 .env" />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit">
            保存
          </Button>
          <Button onClick={onClose}>取消</Button>
        </Space>
      </Form>
    </Drawer>
  );
}
