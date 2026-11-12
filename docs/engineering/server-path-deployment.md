# 同域子路径服务器部署

2026-11-05 用户授权的Linux部署已运行：官网`https://lichcarlos.top/snow`，后台`https://lichcarlos.top/snow-admin/login`，API前缀`https://lichcarlos.top/snow-api/api/v1`。源码未提交/推送；保留原有业务。

构建变量：`NEXT_PUBLIC_WEB_BASE_PATH=/snow`、`NEXT_PUBLIC_ADMIN_BASE_PATH=/snow-admin`，API使用上述HTTPS前缀。变量经`@common/config`读取；Next Link/Router自动处理basePath，window.location整页跳转使用后台platform/config的getPageHref，公开详情canonical包含官网前缀。根路径部署仍支持空前缀；修改公开变量必须重建。

服务器两应用顺序生产构建通过，使用各自standalone包，由`linji-web`和`linji-admin` systemd服务以linji账号运行，回环13100/13101。目录`/opt/linji/releases/20261105/web`；Nginx精确`/snow`直接代理，避免尾斜杠重定向循环。

API网关将Cookie Path重写至`/snow-api/api/v1`，保留Secure/HttpOnly。仅为same-origin且缺Origin的GET/HEAD补本站Origin，写请求继续Origin/CSRF校验。真实Chromium登录、reload恢复会话、官网catalog通过；6项HTTPS认证检查通过。未宣称所有页面完整点击验收。

本轮lint、全仓typecheck、双Linux构建和子路径/metadata专项通过。日志与截图在本机`D:/linji-local/20261105`，包括`web-lint.log`、`web-typecheck.log`、`web-deployment-tests.log`、`web-metadata-tests.log`、final专项日志、`browser-live-results.json`、`admin-live.png`和`catalog-live.png`。首次按钮选择器失败日志保留，不包含明文密码。

账号admin的随机密码通过本机私有文件`D:/linji-local/20261105/private/admin-initial.txt`交付。不要放进仓库、构建变量或下载目录。该2GB共存部署尚未做生产容量/灾备验收。
