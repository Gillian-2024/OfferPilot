import { useState } from 'react';
import { Modal, Tabs, Form, Input, Button, message, Alert } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
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

  const handleLogin = async (values: { email: string; password: string }) => {
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      message.success('登录成功，历史记录已开启云同步');
      loginForm.resetFields();
      onClose();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (values: { email: string; password: string; nickname?: string }) => {
    setSubmitting(true);
    try {
      await register(values.email, values.password, values.nickname);
      message.success('注册成功，欢迎使用 OfferPilot 领航员！');
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
      <div className="am-head">
        <h2 className="am-title">OfferPilot 领航员</h2>
        <p className="am-sub">
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
                  name="email"
                  rules={[
                    { required: true, message: '请输入邮箱' },
                    { type: 'email', message: '邮箱格式不正确' },
                  ]}
                >
                  <Input prefix={<MailOutlined />} placeholder="邮箱" autoComplete="email" />
                </Form.Item>
                <Form.Item
                  name="password"
                  rules={[{ required: true, message: '请输入密码' }]}
                >
                  <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
                </Form.Item>
                <Form.Item className="am-submit-item">
                  <Button type="primary" htmlType="submit" loading={submitting} block className="am-submit-btn">
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
                {/* 邮箱当前只作账号名：注册未发验证邮件、users 表无 email_verified，
                    也没有找回密码端点。不写明会让用户误以为忘密码可以找回。 */}
                <Alert
                  className="am-notice"
                  type="info"
                  showIcon
                  message="邮箱仅作为账号名使用"
                  description="当前暂不支持通过邮箱找回密码，请妥善保管你的密码。"
                />
                <Form.Item
                  name="email"
                  rules={[
                    { required: true, message: '请输入邮箱' },
                    { type: 'email', message: '邮箱格式不正确' },
                  ]}
                >
                  <Input prefix={<MailOutlined />} placeholder="邮箱" autoComplete="email" />
                </Form.Item>
                <Form.Item
                  name="nickname"
                >
                  <Input prefix={<UserOutlined />} placeholder="昵称（选填，默认取邮箱前缀）" />
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
                <Form.Item className="am-submit-item">
                  <Button type="primary" htmlType="submit" loading={submitting} block className="am-submit-btn">
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
