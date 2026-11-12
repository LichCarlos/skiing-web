# 字典、字段与实体可视化管理

入口：管理端 → 系统设置 → 数据字典 → **实体关系图**。采用按需加载，原列表和分类下拉入口继续可用。

## 开源库选型

2026-11-09 查阅官方文档及 npm 元数据：

| 库                                                                       | 许可 | 适用点                                                          | 本次选择                                             |
| ------------------------------------------------------------------------ | ---- | --------------------------------------------------------------- | ---------------------------------------------------- |
| [React Flow / @xyflow/react](https://reactflow.dev/learn) 12.12.1        | MIT  | React/DOM 自定义节点、连线、画布缩放、键盘支持；支持 React >=17 | 实体、分组、字段、字典关系图，兼容现有 React 19      |
| [Ant Design Tree](https://ant.design/components/tree) / TreeSelect 6.6.5 | MIT  | DOM 树、展开收起、可访问控件；项目已有依赖                      | 字典项层级管理和父级选择                             |
| [AntV X6](https://x6.antv.antgroup.com/en/) 3.1.8                        | MIT  | 通用图编辑、HTML 节点                                           | 本项目已有 React，选用 React 原生节点集成，未引入 X6 |

React Flow 的[自定义节点](https://reactflow.dev/learn/customization/custom-nodes)直接使用 React 组件；保留画布官方归属链接，并在管理端 public/third-party 提供许可证。

## 真实关系映射

映射依据 backend/prisma/schema.prisma 及现有 API，不通过字典名称或前缀猜测绑定：

| 数据关系                                                                     | 画布关系                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------- |
| CustomFieldGroup.EntityType                                                  | 实体 → 分组                                 |
| CustomFieldDefinition.(EntityType, GroupKey) → CustomFieldGroup 复合主键     | 同一实体的分组 → 字段                       |
| CustomFieldDefinition.OptionsDictType → DictionaryType.DictType              | 字段 → 选项字典，共享字典只保留一个节点     |
| DictionaryItem.DictType → DictionaryType.DictType                            | 字典详情的层级树                            |
| DictionaryItem.(DictType, ParentId) → DictionaryItem.(DictType, ItemId)      | 同一字典的父子项目                          |
| Article.(CategoryDictType, CategoryValue) → DictionaryItem.(DictType, Value) | 文章分类固定绑定 knowledge.article_category |
| ResortFitTag.(DictType, ItemId) → DictionaryItem.(DictType, ItemId)          | 雪场适合标签固定绑定 resort.fit_tag         |

DictionaryType.GroupKey 只是归类，不能当作业务实体或字段分组的外键。字段配置扩展现有实体，不创建数据库表或物理列。实体实例中的具体扩展值继续由现有业务接口管理，此画布管理结构和配置。

## 操作

- 按业务筛选，或选择“全部实体与字典”查看未引用字典；默认聚焦已绑定字典的扩展字段，开启“显示全部字段”查看普通字段。搜索节点后定位画布，显示所属实体以区分同名分组。拖动画布移动、左下角放大/缩小/显示全部；手机端使用可点选、展开收起的 DOM 关系树。
- 点实体管理其字段；点分组编辑分组；点扩展字段打开对应实体的精确字段编辑表单，在下拉框调整字典绑定。
- 点字典或固定字段进入字典层级树，可搜索、展开收起、从节点新增子项、编辑项目；父级使用 TreeSelect 树选择，排除自身及其全部后代，调整父级在保存后生效。
- 图线表示读取到的真实引用，不能拖线任意创建数据库关系。固定字段绑定不可更换。字段绑定变更走现有版本校验、身份复核及写入恢复流程，关闭配置抽屉后重新读取图线。
- 草稿/停用字段保留状态；缺失字典显示虚线警示。没有读取权限的字段或分组不发起请求，并在图中说明。缺失数据不会伪造为正常节点。

## 验证与发布

2026-11-09 **17:15 已部署**至[数据字典](https://lichcarlos.top/snow-admin/admin/system/dictionaries)。

- 新增12项关系模型测试，覆盖跨页完整性、实体复合键、共享字典、固定关系、缺失引用、草稿/停用、禁止按前缀推断关联、受限权限、账号变更及取消请求。全部2735项管理端测试、依赖边界、ESLint、TypeScript 和 Linux 生产构建通过。
- 最终包浏览器验收30项：隔离数据16项、真实数据本地7项、正式HTTPS7项；覆盖1440/768/390/320屏宽、搜索/点选、手机关系树、缩放、普通字段开关、跨页共享字典、精确分组编辑、字段版本化保存后连线刷新、新增子项、父级排除后代、搜索展开收起、加载失败清空及权限限制。
- 隔离数据的2次写入由本地 Playwright 路由模拟回执；未写正式业务配置。正式验收仅读取和打开已有管理入口，0页面错误。
- 构建 `IsBikSr8YW90Lj6AX45Nj`；发布包SHA256 `7210773c213ce697c6ca2bdf2fe2c5ece8bb9adef160c4f551bdf4e85314a4f6`；源码快照SHA256 `fec445a156c5c0141537e228d0728f5e5d457e9e08ca921a8b675158a161349e`。
- 2501文件/21链接完整性校验；候选服务12页面及43静态资源通过；仅切换linji-admin，PID1534420，active/NRestarts0，其他服务PID及官网/API/Nginx配置指纹一致。保留此前生产工作台样式。
- 发布目录 `/opt/linji/releases/20261109-admin-dictionary-graph/admin`；回滚：`python3 /opt/linji/releases/20261109-admin-dictionary-graph/rollback-admin.py`，恢复上一版分类下拉发布。

[发布汇总](../validation/admin-dictionary-graph-release-20261109.json)、[本地隔离交互](../validation/admin-dictionary-graph-local-fixtures-20261109/report.json)、[正式浏览器](../validation/admin-dictionary-graph-live-20261109/report.json)。

仅管理端变更，沿用现有 API；无数据库迁移。
