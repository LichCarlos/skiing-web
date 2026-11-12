# 官网文章收藏与用户会话

2026-10-30；消费 OpenAPI 1.37.0。官网首页文章卡片、知识目录和文章详情接入 favoriteByMe；写入复用现有 PUT/DELETE，成功为 204。无需新依赖。管理端继续独立运行，官网会话不导入管理端业务模块。

## 数据与会话边界

Server Component 读取公开文章并保留 SEO 正文；不会转发浏览器 Cookie。PublicSessionProvider 在浏览器恢复 /auth/me，并提供账号密码登录、退出与会话检查。调用既有公共认证 API，浏览器凭证由后端 HttpOnly Secure Cookie 管理，前端不保存 token。CSRF、单飞续期和过期重试复用本仓 transport。官网不检查管理端入口权限。

账号切换、导航和窗口恢复焦点后更新会话版本；每个文章区域按账号/会话版本/请求路径/当页 ID 重建个人状态。会话尚未确认时仅显示待确认，不渲染上个账号的收藏。游客提示登录，不把网络错误当成未收藏。

ArticleFavorites 为整页卡片读取同一个文章列表，详情读取详情接口，不逐卡片请求或下载全部收藏。每次个人读取和写前检查 /auth/me；响应与当前账号不符即停止。ArticleFavoriteController 是页面实例，不使用跨服务端请求的个人状态单例。effect 清理取消请求，generation 拒绝迟到结果，并兼容 StrictMode 的 effect 重放。

## 交互

登录用户可在卡片或详情收藏/取消；同步锁覆盖重复点击与同区域多卡片写入。写后重新读取服务端状态，包括请求响应丢失的情况；核对失败时禁用后续翻转并提供刷新入口。后端仍最终检查账号、权限、目标公开性。没有权限的写入不会显示成功；个人状态读取不代替收藏写入授权。

Backend 的 WEB_ORIGINS 必须包含实际官网 Origin；开发默认 3000，使用既有 3010 服务时应由环境配置允许该 Origin。生产使用 HTTPS，以符合 Secure Cookie；未修改开发者 .env。所有个人状态读取 no-store，后端列表/详情亦返回 private, no-store。

## 检查与边界

`pnpm test:web-article-favorites` 已加入 `pnpm check` 和既有 CI。11 项 controller/SSR 测试覆盖游客、批量读取、账号错配、收藏/取消、同步互斥、写入响应丢失、核对失败、取消/迟到结果、未知字段、StrictMode 重放及安全初始 HTML。首页原 6 项测试继续保留。

同时运行本仓完整 check 和官网/Admin production build。以上不是浏览器 hydration、Cookie/CORS 点击操作、跨标签页并发或设备验收；当前仅在恢复焦点/导航时复查外部会话变化，不提供跨标签页实时推送。

实现前查阅本仓 next@16.3.5 随包文档 use-client、use-pathname；页面样式使用本端 CSS Modules，业务状态均在 apps/web。
