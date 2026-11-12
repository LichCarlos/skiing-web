# 管理端文章动态字段表单

> 2026-11-01：文章列表/编辑的身份复核、同步写锁、最新版本/字段目录校验及结果核对已完善，见 [文章页面工程说明](admin-articles.md)。当前 OpenAPI 1.45.0；以下版本与检查数量为历史阶段记录，字段读写规则保持。

实施日期：2026-10-29。D-40 已确认并实现。管理端使用 Backend OpenAPI `1.29.0` 生成的 ArticleFieldSchemaVO、DTO/VO，本仓不复制字段类型定义，也不按角色名称推断业务权限。

## 数据与页面

`GET /admin/articles/custom-fields` 返回当前账号可读或可写的活动分组/字段；文章表单按目录渲染 text、textarea、integer、decimal、boolean、date、single_select、multi_select 和 url。只读字段禁用；只读选择字段显示原始值。只写字段编辑时不填原值、不应用默认值，提示“仅可写；未编辑则保留原值”。

创建只应用支持且可写的默认值。required 提示对可写字段生效，编辑时不强求填写已存但不可读的只写值；服务端仍独立校验完整合并结果。提交仅包含目录内可写、已提供且发生变化的键，显式 null 表示请求清空，省略键由后端保留原值，避免将裁剪后的 JSONB 覆盖回数据库。

可写选择字段所需的选项字典去重加载，复用分类字典及既有受保护的字典 API；只读字段不额外申请选项读取权限。目录、分类或必要字典加载失败时展示错误和重试，加载期间禁止提交；请求支持取消，不能使用部分加载的数据生成表单。目录读取权限不会自动赋予字典读取权限，缺少既有字典权限时由操作员联系管理员配置。

## 工程位置

| 文件                                                      | 职责                                         |
| --------------------------------------------------------- | -------------------------------------------- |
| `apps/admin/src/features/articles/admin-article-form.tsx` | 页面加载、错误/重试、初值和提交              |
| `article-custom-fields.tsx`                               | 按类型和 canRead/canWrite 渲染控件           |
| `article-field-model.ts`                                  | 生成类型、初值、required、字典依赖和可写变化 |
| `article-field-changes.ts`                                | 变化键计算                                   |
| `article-form-loader.ts`                                  | 分类/字段/必要选项加载与取消                 |

业务实现留在 Admin features 内，应用内部统一 `@/` 导入；公共包只提供契约和通用能力。

## 验证与边界

`pnpm test:admin-articles` 已加入 `pnpm check`：15 项通过，覆盖变化提交、默认值、只写保留、只读控件、required、字典去重、加载失败/停用字典和取消。其中组件使用真实 Ant Design Form 做 SSR 断言，loader 使用 API 替身；尚无浏览器点击及真实 API 成功流程验收。

D-40 当时 Web check 79 项与双应用 build 通过；后续图片库阶段达到 102 项。三仓契约 SHA-256 为 `51eaa6e1a4a46f855859b2caa400238cccd756c60c2f11a02da1377f967e8cf9`。前端可见性不代替服务端授权；当前用户 VO 尚无有效数据范围投影，selected 创建及 merchant 文章入口仍由 API 拒绝。封面已完成 [图片库与上传接入](asset-library.md)，RAG 管理视图及其他未完成页面继续按追踪矩阵处理。
