# 2026-11-09 个人中心写作区优化与知识库流程核对

用户截图中的正文内蓝色矩形来自 Tiptap 的独立 focus outline，与编辑器圆角边框叠加。现在正文、Markdown 源文共用外框反馈焦点，正文及源文内部不再增加边框；保持键盘操作按钮的可见焦点。空正文依据编辑器实际 isEmpty 显示提示，避免原 CSS :empty 无法匹配带换行节点的段落。排版工具在一行内横向滚动，小屏保留正文空间，触控和键盘可达全部功能。

雪场搜索与原生选择器放入一个圆角边框，内部细线分隔；焦点由外框与当前文字下划线共同表示。保留可选、不自动选中、已选雪场在过滤后仍保留、搜索防抖、错误重试、禁用及账号生命周期规则。未改变发表、审核、权限、图片、Markdown 校验及提交协议。

本地验收脚本 `scripts/member-writing-browser.mjs` 检查输入、标题、撤销/重做、源文/预览/富文本往返、雪场键盘选择/清空、空搜索/错误重试、390px 与320px无横向溢出。仅填写浏览器内存正文，不提交真实内容。记录见 [本地验收](../validation/member-writing-20261109/report.json)；正式环境验收另记。

北京时间11:46已部署到 [写笔记](https://lichcarlos.top/snow/me/new)。生产构建 `42cEiKzHW9fLrPbbggJlh`，官网服务 PID 1527715、NRestarts 0，运行目录 `/opt/linji/releases/20261109-member-writing/web`。与上一正式版本比对，运行源码仅变更 member.module.css、note-editor.tsx、resort-picker.tsx。

Windows 与隔离 Linux 构建均通过483项官网测试、类型、lint和边界检查；OpenAPI 1.54.0契约校验通过。2203文件/21链接校验、10个候选页面与24个静态资源检查通过。真实 HTTPS 登录后完成6组浏览器检查，覆盖1440×1000、390×844、320×844；正文输入、模式往返、键盘雪场选择及清空通过，页面脚本错误0、内容写请求0，验收后退出会话。[正式验收](../validation/member-writing-live-20261109/report.json)、[桌面截图](../validation/member-writing-live-20261109/desktop-writing.png)、[手机截图](../validation/member-writing-live-20261109/mobile-390-writing.png)、[发布汇总](../validation/member-writing-release-20261109.json)。手机为浏览器视口仿真，未验证真实软键盘硬件。

仅切换并重启 linji-web，其余运行服务 PID/状态和 API、后台、Nginx 配置哈希一致，无数据库迁移。运行包 SHA256 `58ddee56050bfa08e0aed72c860a87a656db6ec90d11ebf3a6aa70b5c2e79b3c`；源码导出 SHA256 `c4528cb90dcad62fe72994a6480fa070062891fb6afa13b7dd8202b81b212800`。正式包在独立 WSL 构建，服务器只校验并启动。

回滚：`python3 /opt/linji/releases/20261109-member-writing/rollback-website.py`，恢复上一正式 AI 视窗版本；脚本先核对当前官网运行目录，防止覆盖后续部署。部署前原单元保存在 `/opt/linji/private/backups/20261109-member-writing/linji-web.service`。

## 当前内容与知识库权限

- 个人中心调用动态接口，提交为待审核笔记；管理员审核公开后展示在“雪友动态”。目前无直接发布到“滑雪知识”或一键转为知识文章的入口。
- “滑雪知识”后台入口 `/snow-admin/admin/content/articles`。服务端要求管理端访问及 `content:article:manage`，并按角色的数据范围校验；并非只有内置系统管理员能编辑文章，可配置其他角色的文章管理权限。
- AI 知识来源包括公开文章和公开动态等。“知识库”不是文章必填标签。`DynamicRagEventHandler` 消费 `dynamic.changed.v1`：公开且未删除、作者有效、所关联雪场有效时触发索引；成功索引且未手动停用后才可被 AI 检索。发布和索引异步，不承诺刚审核完立即可引用。撤下、删除或来源不再公开会使检索失效。
- AI 管理入口 `/snow-admin/admin/ai/sources`（RAG 来源运维）。来源列表/重建/启停分别需要 `ai:knowledge:list/reindex/disable`，同时要求内置 `system_admin` 身份；不是普通作者自选标签或打勾控制。
- 来源运维页仅显示已发现的索引记录。新发布的业务事件可触发索引；历史未发现来源通过既有受控 `rag:reindex` CLI 补建。后台重建操作针对已有来源，不替代历史来源发现。

以上结论来自当前仓库的文章管理控制器、动态事件处理器、来源写入与检索可见性校验，未在本轮修改后端规则，也未对真实文章或索引进行写操作。
