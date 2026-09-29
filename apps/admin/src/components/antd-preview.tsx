"use client";
import { App, Button, Card, Space } from "antd";
export function AntdPreview() {
  const { message, modal } = App.useApp();
  return (
    <Card title="管理端基础组件" variant="outlined">
      <p style={{ marginBottom: 16 }}>
        Ant Design 6 已接入；业务页面由所属小组实现。
      </p>
      <Space wrap>
        <Button
          onClick={() => message.success("反馈消息正常，已继承本端主题。")}
        >
          验证消息
        </Button>
        <Button
          onClick={() =>
            modal.info({
              title: "弹窗预览",
              content: "验证主题、焦点与关闭交互。",
              okText: "关闭",
            })
          }
        >
          验证弹窗
        </Button>
      </Space>
    </Card>
  );
}
