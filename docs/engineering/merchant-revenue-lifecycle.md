# 商家收益明细读取与恢复

日期：2026-11-03。负责人：Web。页面 ADM-25 `/admin/merchant/revenue`，沿用 API-R03 的列表与汇总接口、DTO/VO 和权限，不新增接口或数据库迁移。

明细页此前仅比较页码、日期和雪场元数据，未校验收益记录、录入人、备注、金额及每日趋势，额外响应字段直接保留在页面状态。现将概览中的收益校验提取到本应用 `features/revenue/revenue-response.ts`，两页共用生成 VO 的显式投影，支持各自分页大小。列表校验正 int4、分页、总数、hasNext、重复记录、日期与已选雪场；汇总校验日期区间、雪场及每日日期去重。金额保留非负、两位小数的字符串，大额汇总不转为浮点数；无效数据整组拒绝，不将单页记录之和作为总收益。

`readMerchantRevenue` 发请求前先验证本地身份和筛选；`/auth/me` 响应通过现有 CurrentUserVO 解析器校验，读取前后复核账号、用户 ID、商家关联、角色键和权限集合。错误统一为固定文案，避免把空对象、null 或畸形权限数组的 JavaScript 异常显示给用户。入口按有效商家资料和 `management:portal:enter`、`revenue:merchant:list` 判断，不要求商家角色键或 `merchant:dashboard:read`。会话读取沿用 `account:profile:read`，不自动补权。

`createMerchantRevenueRun` 使用本应用 RequestLane：新查询取消旧查询，清空时取消并隐藏旧数据，销毁后禁止发布。页面接入 `visibilitychange` 和 `pagehide`，隐藏后清空表格与汇总，返回后显式刷新；“重新读取身份”先清空，再使用既有会话恢复逻辑。刷新回调同时核对当前筛选对象和操作人，避免旧回调读取已替换的条件。表单切换及分页仍使用已应用条件，后续空页保留“返回第一页”入口。

收益列表/count 使用后端既有事务，列表和汇总请求之间仍是独立快照；前后身份比较不是授权租约，也不包含所有字段策略或数据范围版本。每个请求继续由后端授权并限制商家归属；前端不发送 merchantId 或 userId，不参与结算。

验证入口为 `pnpm test:admin-revenue`、`pnpm test:merchant-dashboard` 以及显式启用的 `pnpm test:admin-authorization-http`。先新增 34 条边界用例复现 30 条失败，再实现投影/身份修复；另新增 10 条控制器/分页/精度回归。收益与工作台联合 332 项通过。真实 HTTP 新增四条，核对本人的 123.45 与另一商家的 678.90、第一页/后续空页、日期空区间、外部雪场 404、读取期间实际撤权及数据范围冲突 403；后置夹具核对返回归属、原始收益未改、拒绝操作无成功审计及会话撤销。

完整命令、结果及日志摘要见[本轮验证记录](../validation/merchant-revenue-20261103.json)。SSR、控制器和 Node Cookie transport 不替代真实浏览器可见性/BFCache、Cookie/CORS、设备、实际存储或供应商验收。本轮不重跑完整数据库或 Kafka 集成；现存 Windows Kafka 目录错误、D-49/D-50/D-09 仍待解决，Docker 未启动或重启。
