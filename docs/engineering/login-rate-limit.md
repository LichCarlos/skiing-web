# 登录限流反馈

2026-11-03，契约1.51.0/143操作，适用官网和Admin。POST /auth/login在账号5次/60秒或可信IP30次/60秒耗尽时返回429，统一消息Login rate limit exceeded和整数Retry-After；全部有效尝试计数，包括成功。后端不返回命中维度或账号是否存在，不改认证Cookie。

官网PublicSessionRun与Admin SessionController将429显示为“登录过于频繁，请稍后手动重试。”。沿用已有单次提交/会话核对机制，拒绝后不自动重放登录、不轮换凭证来绕过限流。前端不猜测账号是否存在，不把服务端原始错误放入提示；现有429参数化回归核对一次请求和通用反馈。首期没有客户端倒计时或自动重试。

存储故障503沿用通用错误和未知结果会话核对；不能据此推测登录成功或自动再发。401仍显示账号或密码错误。阈值由服务端固定管理，不提供字典配置界面。跨站读取Retry-After需API的CORS暴露该响应头，服务端已配置；UI当前仅给通用提示。

契约位于本仓contracts/openapi.json及lock，生成类型位于packages/api-contracts/src/openapi.ts；本轮独立安装/check/双构建结果见[验证摘要](../validation/login-limit-20261103.json)。生产代理、浏览器点击和远程CI验收不由单测或构建结果替代。
