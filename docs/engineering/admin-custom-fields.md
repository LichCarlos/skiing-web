# 管理端字段配置

2026-10-31 后端事务授权更新：七类字段/分组写入在数据库事务内复核当前有效角色、入口和动作授权，显式启用公开字段另需受保护系统管理员身份。前端提交前身份检查与后端最终授权同时保留；事务快照前已经提交的撤权返回 403。客户端接口与 OpenAPI 1.44.0 不变，本阶段 Web 完整 check 422 项、官网/Admin 构建通过。浏览器在途交互仍需验收。

日期：2026-10-31。负责人：Web 管理端负责人。状态：代码与完整三仓回归已通过；浏览器交互验收待完成。基线是本仓 contracts/openapi.json，页面为 `/admin/system/fields`。

## 页面与权限

路由保留小型 Server Component，交互移入 `apps/admin/src/features/custom-fields/field-console.tsx`。入口先等待会话恢复，再检查管理入口与 system:field:list；业务身份通过 grants 决定，不使用商家角色键。按账号 ID、有效权限、角色键和实体生成工作区 key，账号、授权或实体变化会替换工作区，关闭表单并丢弃旧请求。

字段列表、分组列表与编辑详情各有独立 RequestLane。新请求和卸载同时取消旧 signal，并屏蔽迟到的成功、失败与 finally；仅传 AbortSignal 不足以保护忽略 signal 的后续回调。通用实现位于本端 platform/api/request-lane.ts，字典页复用同一实现并保留原导出，现有字典竞争测试继续覆盖它。

字段列表不再依赖分组查询成功。没有 system:field-group:list 时不请求分组接口，显示权限提示；仍有字段写权限的账号可以输入已知的有效分组键。字段与分组查询失败各自显示错误和重试。编辑字段先读既有 GET /admin/custom-fields/:id；编辑分组使用上一阶段补齐的 GET /admin/custom-field-groups/:entityType/:groupKey，读取当前实体和最新资料后才打开表单。

## 表单与提交

表单与提交体直接派生自生成 DTO；更新白名单不发送 fieldKey、entityType、dataType 或 status。编辑使用最近读取的 schemaVersion；后端仍独立校验版本、类型、分组、字典引用和公开字段授权。创建和编辑均重置表单，防止上次字典、默认值或校验规则残留。

空白默认值和校验规则会显式提交 null 清除；空白选项字典同样为 null。JSON 的 0、false、空字符串、数组保持原值；非法 JSON、非对象校验规则以及溢出为非有限数字的 JSON 在提交前阻止。仅内置 system_admin 可设置公开字段，自定义角色更新不提交 isPublic，创建默认 false。空白清除语义已由既有应用/仓储支持，本轮修正前端省略属性导致无法清除的问题。

所有变更共用本工作区 FieldWriteGate，校验之前同步加锁，防止连续点击在异步校验期间发送两次请求。准备完提交体后读取 /auth/me，核对同一账号、管理入口、字段列表与动作权限，以及内置公开字段能力是否变化；前端核对用于隔离陈旧表单，后端授权仍是最终边界。卸载后取消在途信号、丢弃回调。不会自动重试变更。

请求已发送但遇到网络错误、HTTP408或5xx时，结果可能已经提交。页面关闭表单、暂停后续变更，允许读取当前实体的其他状态和分页，刷新列表并由操作者核对后显式继续。没有分组查询权限的账号无法仅凭字段列表刷新解除分组写入的不确定状态。该机制不替代服务端幂等，也不宣称跨页面、跨设备或网络故障下只执行一次。

## 契约修正

后端 Swagger 对具有默认值的数字/布尔属性、可空字典字符串和 unknown JSON 默认值推断不准确，生成客户端出现 Record<string, never>。OpenAPI1.44.0 为字段创建的 sortOrder/布尔项、分组 sortOrder 和字段列表 page/pageSize 显式注明类型；创建/更新 optionsDictType 为可空 string，默认值沿用 VO 的 JSON oneOf。运行时协议、端点集合与数据库没有改变，不新增依赖或迁移。

三仓同步相同快照并独立生成类型，SHA-256：`98baf03cc01588729adc9581fce4980a7eca8855b91e03fc37a9aa8a51d99cc2`。逐项比较确认差异只涉及这些类型元数据与版本，不把类型修正描述为新增业务接口。

## 验证范围

字段专项目前49项：DTO白名单与JSON/空值、权限入口、迟到响应/独立失败、同步提交锁、实时身份核对、结果不确定阻塞、卸载和StrictMode重新激活；入口使用SSR验证，不证明挂载后的真实浏览器网络或点击行为。后端新增真实HTTP/PostgreSQL测试验证数字0、布尔false和省略/显式null的持久化差异。全量回归通过：Backend 118文件/851单测、3文件/88 HTTP、26文件/542数据库测试（字段配置26项），lint/typecheck/build通过；Web完整check398项与官网/Admin构建通过；App check183项、Doctor20/20与三平台导出通过。三仓独立冻结安装、验证库前后db:verify通过，20项迁移不变。最终Web检查覆盖全部49项字段专项及共用请求通道的68项字典测试。

仍待完成：完整类型/字典组合与数据规模、真实浏览器新增/编辑/停用/撤权流程、全项目工作台/AI管理及设备/供应商验收；实体独立路由的实现与本阶段验证见下节。日志 field-console-*.log 和 App dist-field-console-validation/ 保留。

## 实体独立页面（2026-10-31）

`/admin/system/fields/[entityType]` 已补齐，URL只接受 ski_resort、article、dynamic、merchant_profile。Server Component等待params并对白名单外实体调用notFound；Client Component以URL实体为准，不保留上一个实体选择。工作区key包含账号、权限、角色、实体和页面模式，切换URL会替换表单、分页与请求通道。

列表页保留实体筛选并新增“打开实体配置”的原生Next Link；详情提供“返回字段管理”和四类实体导航，当前项aria-current=page。提交、读取详情或结果不确定期间，页内跳转入口不提供可点击链接。字段状态筛选、分页、分组维护和上一阶段的写门禁共用同一实现，分组读取仍需独立grant。只复用现有查询API，不新增业务协议、依赖或migration。

路由常量和URL工厂归属features/custom-fields/routes.ts，由config/routes统一导出。直达权限检查沿用management:portal:enter与system:field:list，按实体白名单解析路径、只解码一次，非法、嵌套和重复编码路径不作为有效详情入口。所有物理管理页的权限扫描已覆盖[entityType]。自定义业务角色通过grants获得入口，未硬编码商家身份。

新增24项路由/参数/权限/SSR测试，字段专项现73项；此前49项仍包含默认值/竞争/写门禁验收。SSR不证明挂载后的请求或真实浏览器点击。三仓完整回归通过：Backend118文件/851单测、3文件/88 HTTP、26文件/542数据库测试、lint/typecheck/build及前后db:verify通过（20迁移）；Web完整check422项及官网/Admin构建通过，构建明确包含该动态路由；App check183项、Doctor20/20和三平台导出通过。三仓分别冻结安装，原进程和验证库保留，无测试动态/评论/操作日志残留。OpenAPI保持1.44.0，端点和schema不变。仍需浏览器/API工作流、完整字段类型/字典组合与真实设备/供应商验收。
