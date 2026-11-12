# 管理端权限导航与表单说明

2026-11-09。依据桌面管理端使用要求优化，不新增手机适配流程。

## 导航映射

`features/auth/management-modules.ts` 是前端已实现模块的路由、名称、分组和用途映射。菜单、工作台卡片均取自这一映射，按授权结果过滤；后端自定义权限目录不会自动生成一个尚未实现的前端页面。

`canAccessManagementPage` 在现有页面权限校验基础上补充商家绑定条件。商家经营概览、我的雪场及商家收益数据要求有效商家ID；系统管理员即使具备全部权限，没有商家绑定也不展示这些专属入口。全局雪场、收益维护等系统操作继续按对应功能授权开放。不以角色名称猜测权限，也不在前端授予权限；接口保持服务端鉴权。

左侧采用 Ant Design Menu 分组展开、收起，路由切换自动展开所在分组并高亮最接近的已授权模块。桌面侧栏保持固定展示，内容独立滚动；替换原先无折叠的长列表。权限变化后重新计算可见项，空分组不展示。

## 文字与填写规则

- 描述段落通过 `AdminParagraph` 保留段落及状态语义，内部使用 Typography.Text。工作台模块用途、导航说明也使用 Text。
- Form.Item 规则统一通过 `FormHint`（13px Typography.Text）放入 extra，保持原生说明关联。覆盖账号、角色、权限、雪场、文章、项目知识、字典、字段和查询表单。
- 无 Form.Item 的筛选与策略控件使用 `ControlHint`，保留值及事件处理并关联 `aria-describedby`；收益、密码重置、系统配置、索引及审计原因等独立填写区域均提供规则说明。
- 说明依据当前校验给出是否必填、单位、上下限、长度、选项来源和业务影响。账号与昵称控件统一为实际50字上限；密码明确8–72个UTF-8字节及空格处理。
- 有效扩展字段通过 `customFieldHint` 读取数据类型、读写许可和校验配置，说明数值/长度/格式限制；不臆造缺失约束，不改变字段读写授权。
- 错误页在 Provider 异常时的独立渲染保持原有结构。本文文字组件不代替错误和提交校验。

与本次[节点拖拽创建](admin-node-drag-20261109.md)一起构建、验证和部署。浏览器验收仅读取及打开/取消正式表单；拖拽保存用隔离数据模拟接口回执。

## 正式发布

2026-11-12 **15:38 已部署**至[管理端](https://lichcarlos.top/snow-admin/admin)。140个测试文件、2751项测试通过，依赖边界、ESLint、TypeScript和Linux生产构建通过。最终包浏览器检查共41项，包含本地三种身份菜单、7类正式表单的Text小字、1280/1440/1600桌面检查及拖拽创建、父级移动、取消/保存/失败重试。正式环境未写业务配置，0页面错误。

构建 `nnY1pK1tMinX5A-G0HQJO`，2500文件及21链接校验，候选12页面及42静态资源通过。仅更新linji-admin，PID1591974，active/NRestarts0；其他服务PID及官网/API/Nginx配置指纹一致。包SHA256 `c046982407d00f64c68c31dc23dc66ed861726e4e3b8f51be6caff9793a25aa8`，源码SHA256 `912bfd935d686f7fc5c676ede642398d4d9e99667efb60a96f9e7605ed248103`；保留原生产工作台CSS。

发布目录 `/opt/linji/releases/20261112-admin-desktop-config/admin`；回滚 `python3 /opt/linji/releases/20261112-admin-desktop-config/rollback-admin.py`，恢复上一版字典关系图管理端。[发布汇总](../validation/admin-desktop-config-release-20261112.json)、[正式表单检查](../validation/admin-navigation-text-live-20261112/report.json)。
