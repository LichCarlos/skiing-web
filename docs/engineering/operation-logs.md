# 操作日志页面

2026-10-29：D-42 已确认，/admin/system/operation-logs 已接 GET /admin/operation-logs，类型由本仓OpenAPI 1.31.0生成，无新依赖。

## 授权与查询

CurrentUserVO 的 system_admin 身份、management:portal:enter 和 system:operation-log:list 缺一不可；页面直达和导航入口用同一策略。后端独立检查所有授权，界面隐藏不替代服务端权限。

筛选支持操作者ID、动作/资源/traceId完整值、成功/失败、起止时间。原生datetime-local使用当前设备时区，发请求前转UTC ISO；两端相等允许，起始晚于结束拒绝。提交/重置从第一页开始；默认20条，可选10/20/50/100。ID是字符串，禁止将日志ID转Number。

页面查询键变化时卸载旧ResultsLoader并Abort旧请求，重试重建请求。ManagementGuard按userId重建子树，切换账号后旧结果不再显示；不持久化日志或凭证。加载/空/401/403/服务错误分开显示，错误只展示安全文案及traceId，不呈现服务端异常原文。

表格显式渲染ID、操作者ID/账号快照、动作、资源、目标、结果、UTC时间、traceId；nullable actor显示账号已移除。禁止渲染任意response JSON。无详情、编辑、删除或导出入口；没有使用动态表达式或HTML渲染日志。

## 组件与验证

features/operation-logs 包含独立route、生成类型的transport/query模型、查询表单/请求生命周期和纯展示Results组件。只存在于Admin，不进入共享UI或官网业务包。test:admin-operation-logs已加入check。

13项模型/transport/真实React与Ant Design SSR测试通过，覆盖参数编码/时区/边界、取消信号、超过安全整数的日志ID不丢失、敏感附加字段不输出、HTML转义、加载/空/错误与身份/权限规则。首次3项断言忽略Ant Design双汉字间距而失败；修正断言后通过。

SSR和transport替身测试不等于浏览器点击/真实API流程；本阶段后端另有真实HTTP/PostgreSQL17项。浏览器验收、分页高并发和性能仍待完成。配置、Outbox和AI管理页面不在本阶段完成范围，全项目仍未完成。

本阶段独立frozen install、完整check115项、官网/Admin生产构建均通过；新页面已出现在构建路由清单。没有提交、推送或部署。

## 字段配置日志（2026-10-29）

后端已为字段/分组所有写入补齐原子OperationLog，可按system:field或system:field-group资源键筛选已有只读列表；响应契约和页面不变，不显示敏感Metadata。本轮Web冻结安装、check115项与官网/Admin build通过；未执行浏览器真实API点击验收。
