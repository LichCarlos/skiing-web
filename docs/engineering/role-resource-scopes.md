# 角色授权资源范围编辑

2026-10-29，D-23 / ADM-08，消费本仓 OpenAPI 1.33.0。无新增依赖。

角色授权页并行读取授权快照、权限树与 `GET /admin/authorization/resources`。资源目录来自后端，仅包含当前已接入范围控制的 article、asset、resort、role、user。各资源仍有自己的范围语义与操作限制，目录不代表授权。

`features/roles/role-resource-scope-editor.tsx` 提供“添加资源范围”、目录下拉选择、范围类型与 selected ID 输入、移除。新增行初始为空资源/self，选择资源后才可保存；目录为空禁用添加。重复资源、非法或重复 ID 在提交前明确报错，后端独立校验。

`role-resource-scopes.ts` 从本仓生成的 DTO/VO 构造完整 dataScopes。selected ID 使用正安全整数，提交前排序。历史未知资源显示只读键和提示，类型与 ID 禁改，可以保留或移除；构造函数再次与已加载原快照比较。服务端还会以事务内快照校验，客户端校验不能绕过授权。

功能权限、资源范围、字段策略仍以同一个 PUT 全量替换。仅当前有效 system_admin 且目标不是 system_admin 时开放编辑和保存；有获准读取能力的其他账号为只读。后端继续检查管理入口、动作权限、role 范围与事务内管理员状态。保存失败保留当前输入供处理；409应重新读取快照再决定修改，不能盲目重放。

`pnpm test:admin-roles` 包含3文件/20项：原角色表单3项，新增范围请求体13项与真实Ant Design SSR控件4项。覆盖目录资源、重复/非法ID、历史键原样保留/改动拒绝、空目录及只读/保护目标。已纳入 pnpm check；SSR与纯函数测试不能替代浏览器交互或真实API验收。

本轮快照、锁和生成类型同步到1.33.0；三仓哈希为 `818f760493a4a4354fb7dbbb943a34bf2b499c156aaa2fec8bd13d3cd783b25b`。独立冻结安装、完整pnpm check（132项）与官网/Admin production build通过。实际浏览器点击与后端API联调仍待验。
