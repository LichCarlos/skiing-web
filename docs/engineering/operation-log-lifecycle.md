# 操作日志读取、身份隔离与响应校验

负责人：Web。基线：用户已确认的 D-42 / API-M11，只读元数据接口；OpenAPI 1.51.0 / 143 操作保持。当前验证结果见[本阶段证据](../validation/operation-log-lifecycle-20261103.json)。

操作日志入口仍要求 system_admin、management:portal:enter 和 system:operation-log:list。页面使用本端会话解析器校验身份；加载、匿名、不可用、格式异常或缺少授权时不挂载筛选表单和日志。账号 ID、账号、角色键、权限键组成稳定的组件 key；集合排序去重，角色或权限改变后重新挂载表单，清空旧筛选、分页和结果。

生产读取器 readOperationLogPage 在日志查询之前和之后分别读取 /auth/me，逐字段解析并比较当前账号、角色和权限。三个 GET 均使用同一 AbortSignal 和 cache:no-store。每次等待结束后检查取消；组件清理时取消本次读取，忽略迟到成功或失败。筛选、翻页、重试各自挂载新的结果组件。读取失败只显示固定错误和可选 traceId，不保留日志；允许手动重试查询或重新读取身份。客户端复核结束后仍可能发生授权变化，API 服务端继续负责最终授权。

operation-log-model.ts 构造严格的 OperationLogPageVO/OperationLogVO 投影，只保存已批准字段。校验请求与响应页码/大小、整数 total、hasNext、精确条数、重复日志 ID、可空 int4 操作者 ID、success/failure、时间和所有字符串。日志 ID 保留十进制字符串并校验 PostgreSQL 正 bigint 范围，不转为 JavaScript number。额外 reason、metadata、IP、UserAgent 等字段被裁剪，不进入页面状态。客户端不重排日志，服务端继续按 PostgreSQL 的 createdAt DESC、operationLogId DESC 排序；毫秒时间投影不能用于推断数据库微秒的完整顺序。

测试入口为 pnpm test:admin-operation-logs，现有 15 项加新增 53 项，共 68 项。覆盖请求前/后身份改变、最终身份读取失败、每次等待处取消后仍返回的响应、异常分页/行、BigInt 精度、字段投影、SSR 禁止未授权表单和会话 key。SSR 与直接组件边界检查不证明真实浏览器卸载、焦点、React hydration 或跨标签页行为。

独立 pnpm test:admin-authorization-http 新增只读生产日志读取器一项，现为 12 项。连接实际编译 Nest 与临时 PostgreSQL，核对分页、操作者及全部已支持筛选条件、只读投影和普通账号 403；执行方式见[管理端真实 HTTP 联调](admin-authorization-live-http.md)。夹具通过已有角色/授权写入形成日志，不添加业务接口或数据库迁移。该套件不启动 Next，不计浏览器验收，也不替代全部数据库套件。

没有增加日志详情、正文、编辑、删除、导出或新的日志数据权限。三端完整检查、构建、HTTP 服务停止状态及尚未完成范围以本阶段证据和共享交付记录为准。
