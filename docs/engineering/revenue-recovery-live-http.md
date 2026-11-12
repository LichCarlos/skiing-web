# 管理员收益核对与 CSV 任务联调

日期：2026-11-03。页面 ADM-24，接口 API-R04。沿用已确认协议及 OpenAPI 1.51.1，不新增接口、权限或迁移。执行入口为 `pnpm test:revenue-recovery-http`，仅显式指定隔离 API、合成凭证、夹具和输出目录时运行。

本轮修复 CSV 任务只验证部分计数的问题：`admin-revenue-response.ts` 现在校验 UUID、状态、时间、5000 行限制、非负进度、终态与逐行结果的对应关系、唯一行号、成功记录编号和失败说明，并仅投影生成 VO 字段。异常响应不覆盖原文件/请求键或解锁清理。单条已提交结果同样投影，不把意外的备注、录入人或其他额外字段放进结果记录；原请求 DTO 的备注仍按既有恢复协议保留。

系统收益身份检查复用既有 CurrentUserVO 解析，缺失或畸形本地身份在请求前拒绝，服务端响应再次校验。此改动不增加商家技术角色判断，也不将前端身份比较视为服务端授权租约。

新增 18 项边界测试先全部失败；修复后收益专项共 194 项。真实 HTTP 使用生产 RevenueRecovery、RevenueImportRecovery 和 API 客户端，连接编译 Nest 与 PostgreSQL。验证单条/CSV 成功提交后的响应丢失、同键恢复、旧键不覆盖后续金额、异内容冲突、任务归属、CSV 部分成功，以及首批提交 25 行后实际撤权拒绝第 26 行。最后再次恢复不产生重复收益/审计。

HTTP 测试的恢复存储为明确的内存适配，并未实际运行浏览器 sessionStorage 或 IndexedDB；Cookie jar 也不证明浏览器策略。导入由受限测试控制触发原应用服务，不经过 Kafka，不证明其投递、重平衡或定时 worker。后端精确持久断言和运行入口见[后端联调说明](../../../backend/docs/engineering/revenue-recovery-live-http.md)，本仓结果见[验证记录](../validation/revenue-recovery-http-20261103.json)。

同轮既有 42 项管理 HTTP 单独回归。浏览器页面、设备、生产供应商、Kafka、容器/签名包及远程 CI 仍待验收；未改 D-49/D-50/D-09，未启动或重启 Docker。
