# 环境配置与接入层

## 唯一配置来源

开发时复制根 `.env.example` 到根 `.env`。默认支持根 `.env` 与进程环境变量，进程变量优先；不自动读取 `.env.local`、`.env.production` 等额外文件。各端禁止新增 .env 文件，避免 Next 自动加载出另一份配置。

根 scripts/run.mjs 在 Turbo 启动前加载 .env。开发、构建、生产启动均从根脚本执行，不通过 `cd apps/web && next dev` 绕开环境启动器。

| 变量                             | 用途                                                      |
| -------------------------------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_WEB_API_BASE_URL`   | Web 可公开的后端基址                                      |
| `NEXT_PUBLIC_ADMIN_API_BASE_URL` | Admin 可公开的后端基址                                    |
| `NEXT_PUBLIC_WEB_SITE_ORIGIN`    | 可选官网公开 origin，用于详情 canonical 与 Open Graph URL |

地址集中由 `@common/config/public` 读取，应用通过 `src/platform/config` 暴露自己的 getApiBaseUrl。按调用惰性校验：单独构建一个端不要求另一个端的地址，空白页面也无需后端运行。开始请求前调用函数，缺失或无效配置会明确报错，不静默退回真实服务。

NEXT_PUBLIC 变量会进入浏览器构建产物，禁止填密码、私有 Token 或内部凭据。修改后需重启开发服务或重新构建发布。Turbo 已将 NEXT_PUBLIC_* 与根 .env 纳入缓存输入。

`NEXT_PUBLIC_WEB_SITE_ORIGIN` 示例为 `https://snow.example`，只允许 HTTP(S) origin，不含凭据、路径、查询或片段；缺省时详情不生成 canonical/og:url，不从请求头推断域名。配置在构建时固化，独立部署时应在构建前设置实际官网域名。详见[公开详情分享说明](../engineering/public-detail-metadata.md)。

## 服务端配置

需要服务端地址或密钥时，在 `packages/config/src/server.ts` 添加具名读取与校验函数；此入口已有 server-only 保护。只能由 Server Component、Route Handler 等服务端模块导入，不能从公共 client 入口重导出，也不能传入客户端 props。

同时更新 .env.example、本文及 turbo.json：构建需要的变量写入任务 env 参与缓存哈希；仅运行时需要的变量写入对应任务 passThroughEnv 并由部署平台注入。不要宽泛传递整个环境变量集合，也不要在校验错误中回显秘密值。

本模板不预设真实服务端密钥名称或认证协议。

## 本端 platform 的统一管理

| 目录          | 扩展时需要完成的内容                               |
| ------------- | -------------------------------------------------- |
| `config`      | 从公共配置读取并装配本端地址，按域登记实际接口路径 |
| `request`     | 请求库选择、序列化、超时、取消、响应校验及重试策略 |
| `auth`        | 与后端确认的登录、会话、续期和退出协议             |
| `permissions` | 本端能力映射、页面守卫及服务端权限校验对接         |
| `errors`      | 后端错误码、本端展示、请求追踪与日志脱敏           |

集中在一个父目录方便查找，但模块保持明确职责；不做一个同时保存地址、凭据、角色和通知状态的全局大对象。真实业务路径在本端维护，公共 config 只提供地址来源，不持有请求实例。
