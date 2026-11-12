# 蓝色与红黄橙主题生产部署

2026-11-05，官网和管理端以蓝 `#2455F5` 为主体，搭配红 `#DC2F43`、亮黄 `#EFFF46`、橙 `#FF9A3C`。正文、表格和表单保留浅蓝/白底，当前规范见 [官网](../../apps/web/DESIGN.md)和[管理端](../../apps/admin/DESIGN.md)。本轮替代此前仅在本地验证的冰蓝/白主题。

## 线上入口与发布目录

- [官网](https://lichcarlos.top/snow)
- [管理端登录](https://lichcarlos.top/snow-admin/login)
- API：`https://lichcarlos.top/snow-api/api/v1`
- 新发布目录：`/opt/linji/releases/20261105-dopamine/web`。
- 仅切换 `linji-web`、`linji-admin` 的 WorkingDirectory 并重启这两个服务；API、数据库、其他项目和本机 embedding 隧道保持原配置。

独立导出源码 SHA-256：`32ddbdb46840e1f7a2a1c74400efa2f6b068e7d0e69159f1065c7e30c9f5d395`。导出后仅新增交付文档与报告，运行源码已再次核对无差异。

## 构建方式与资源限制

官网完成标准 Linux Next.js 16.3.5 构建和 standalone 打包，Build ID 为 `mszYt4tZRJeziN1VJ565S`。管理端 Linux Turbopack 编译成功耗时约 16.4 分钟，随后重复的 TypeScript 检查遭遇严重换页；同一源码的本地生产构建及其类型检查已经通过，因此中止服务器重复检查。

保留管理端已编译产物备份，从实际 `.next/static/TQrU08t3kCfPoDIg2OsNj` 恢复相同 BUILD_ID，使用 Next 自带 `next build --experimental-build-mode generate` 完成页面生成，随后执行仓库 standalone 打包工具。没有修改业务代码、编译器依赖或类型规则。该步骤没有再次执行 Linux TypeScript 检查，不应记作服务器全流程检查通过。

两端最终 Linux standalone 包分别包含 1382、1969 个文件，构建记录分别保存在 `server-build-full-attempt.log`、`server-admin-generate.log`。这台服务器内存约 1.8 GiB，并运行多个其他项目；后续宜在独立 Linux CI 构建完整产物后上传，以避免在线机器重复编译。

## 验证与回滚

本地官网 365、管理端 2687 项测试通过；两端 lint、9 个 workspace 依赖边界及本地生产构建通过。官网 22、后台 13 项隔离浏览器页面/状态检查通过，15 组前景/背景配色对比度达到 4.5:1。

发布脚本保存两个服务的原始 unit 文件至 `/opt/linji/releases/20261105-dopamine/service-backup`，失败时恢复并重启旧服务。新旧源码和产物均保留。应用部署不涉及数据库迁移或网关配置变更。

本轮真实线上浏览器检查与限制见[验证报告](../validation/dopamine-release-20261105.json)。它覆盖公开官网及手机布局、后台登录、工作台和刷新恢复会话、公开目录；不代替所有业务写入、角色授权和外部模型链路的完整回归。
