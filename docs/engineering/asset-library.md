# 管理端图片选择与上传

最初图片库阶段（2026-10-29）：文章封面和管理员雪场封面/相册已接入图片库，不再要求文章编辑者手填 Asset ID。项目知识模型没有封面字段，未添加新业务字段。管理端使用既有 API-ASSET-01/02 与 OpenAPI 1.29.0，无新增依赖或协议。

## 组件与协议

`apps/admin/src/features/assets/` 保留管理端业务实现，不进入跨应用公共 UI 包。

| 文件                      | 职责                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| asset-library-model.ts    | 生成契约类型、ready 图片/BigInt ID 校验、分页/详情重读与 multipart 上传                   |
| asset-library.tsx         | 按 content:asset:list 展示图片库入口；搜索、服务端分页、关闭/切换取消、选择互斥和重新验证 |
| asset-library-results.tsx | 图片卡片、扫描/格式不可选、重复选择禁用、加载/错误/空状态                                 |
| asset-image-field.tsx     | Ant Design 受控封面字段、单独的 asset:upload 上传能力、预览、清空与重试                   |

列表固定 `status=ready`，page/pageSize=12，关键词 trim 后通过 URLSearchParams 编码。列表中的不支持格式、没有 HTTP(S) URL 或非 ready 图片仍不可选；选择时调用既有详情接口重新检查，不信任旧卡片。ID 始终使用十进制字符串，按 PostgreSQL BigInt 上限校验，不转成 JS Number。

上传使用 POST /assets 的 multipart file，只接受非空 JPEG/PNG/WebP，最大 10 MiB，后端扫描完成且返回 ready 后才关联。前端只提交 AssetId，不提交对象存储键、外部图片 URL、owner 或账号身份。上传与媒体库读取按不同权限展示，不自动赋权；缺少读取权限仍保留旧图片与已有业务详情的预览，允许有权编辑者移除关联。

切换搜索/分页会卸载旧结果区并取消旧请求；关闭对话框、切换账号或离开表单会取消相关请求。选择详情重读期间禁用重复选择，取消后的返回不写入字段。预览失败显示原因与重试，短期 URL 不写入 localStorage。文章及雪场保存会等待图片上传结束，移除只解除业务关联，不删除资产。雪场相册展示已有/新选图片缩略图。

## 服务端范围

D-41 已确认实施，替代此前仅允许 all 的边界。API-ASSET-02 要求对应动作权限与 asset 范围：all 全部，self 按 OwnerUserId，selected 按指定 AssetId；merchant/缺失/冲突拒绝。列表/count/详情/删除同范围，筛选不能扩大范围，范围外目标 404。前端不传身份或范围，不根据角色名推断范围；服务器仅返回可见结果，选择前重读详情，保存文章/雪场时仍独立检查图片资格。

OpenAPI 当前为 1.30.0；本轮仅同步快照与生成类型，无业务组件变化。客户端 CurrentUserVO 暂无有效范围投影，仍按 permissionKeys 展示入口；403/404 保留现有权限/可见性错误，不退回无范围数据接口。ID 始终为字符串，不能为 selected 授权做不安全 Number 转换。后端已有真实数据库范围测试；本页包含独立 Web 仓库使用这些接口所需的规则。

## 验证边界

`pnpm test:admin-assets` 已加入 check，23 项通过：ID 精度/非法值、状态/格式/URL、固定 ready 分页与编码、详情状态变化、取消、multipart 与文件限制，以及真实 React/Ant Design SSR 的空/错误/加载、禁用和权限显示。测试未进行浏览器点击、实际存储上传或扫描器调用。

此前图片库阶段新增 5 项 Controller 与 3 项 HTTP 测试；D-41 阶段已更新其范围预期，并完成后端真实 PostgreSQL 11 文件/78 项（资产 12 项）。实际 ClamAV 的 5 项为上一阶段证据，本轮未重跑。真实 MinIO、浏览器/API 成功流程、上传取消后的孤立对象清理与全域授权事务重读仍需完成。

D-41 本阶段：独立冻结安装、完整 check（102 项）及官网/Admin production build 通过。无业务组件或依赖变化；快照、锁文件和生成类型已同步到 1.30.0。
