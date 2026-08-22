import { useState } from 'react';
import { Modal, Tabs, Form, Input, Button, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AuthModal({ open, onClose }: Props) {
  const { login, register } = useAuth();
  const [activeTab, setActiveTab] = useState('login');
  const [submitting, setSubmitting] = useState(false);
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();

  const handleLogin = async (values: { username: string; password: string }) => {
    setSubmitting(true);
    try {
      await login(values.username, values.password);
      message.success('登录成功，历史记录已开启云同步');
      loginForm.resetFields();
      onClose();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (values: { username: string; password: string; nickname?: string }) => {
    setSubmitting(true);
    try {
      await register(values.username, values.password, values.nickname);
      message.success('注册成功，欢迎使用校招教练！');
      registerForm.resetFields();
      onClose();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={400}
      centered
      destroyOnClose
      title={null}
    >
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>校招教练</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: '4px 0 0' }}>
          登录后历史记录云端同步，换设备不丢失
        </p>
      </div>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        centered
        items={[
          {
            key: 'login',
            label: '登录',
            children: (
              <Form form={loginForm} onFinish={handleLogin} layout="vertical" size="large">
                <Form.Item
                  name="username"
                  rules={[{ required: true, message: '请输入用户名' }]}
                >
                  <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
                </Form.Item>
                <Form.Item
                  name="password"
                  rules={[{ required: true, message: '请输入密码' }]}
                >
                  <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
                </Form.Item>
                <Form.Item style={{ marginBottom: 0 }}>
                  <Button type="primary" htmlType="submit" loading={submitting} block style={{ borderRadius: 10, height: 44 }}>
                    登录
                  </Button>
                </Form.Item>
              </Form>
            ),
          },
          {
            key: 'register',
            label: '注册',
            children: (
              <Form form={registerForm} onFinish={handleRegister} layout="vertical" size="large">
                <Form.Item
                  name="username"
                  rules={[
                    { required: true, message: '请输入用户名' },
                    { min: 2, max: 20, message: '用户名 2-20 个字符' },
                    { pattern: /^[a-zA-Z0-9_一-龥]+$/, message: '仅字母、数字、下划线和中文' },
                  ]}
                >
                  <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
                </Form.Item>
                <Form.Item
                  name="nickname"
                >
                  <Input prefix={<UserOutlined />} placeholder="昵称（选填，默认同用户名）" />
                </Form.Item>
                <Form.Item
                  name="password"
                  rules={[
                    { required: true, message: '请输入密码' },
                    { min: 6, message: '密码至少 6 个字符' },
                  ]}
                >
                  <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="new-password" />
                </Form.Item>
                <Form.Item
                  name="confirm"
                  dependencies={['password']}
                  rules={[
                    { required: true, message: '请确认密码' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('password') === value) return Promise.resolve();
                        return Promise.reject(new Error('两次密码不一致'));
                      },
                    }),
                  ]}
                >
                  <Input.Password prefix={<LockOutlined />} placeholder="确认密码" autoComplete="new-password" />
                </Form.Item>
                <Form.Item style={{ marginBottom: 0 }}>
                  <Button type="primary" htmlType="submit" loading={submitting} block style={{ borderRadius: 10, height: 44 }}>
                    注册
                  </Button>
                </Form.Item>
              </Form>
            ),
          },
        ]}
      />
    </Modal>
  );
}
