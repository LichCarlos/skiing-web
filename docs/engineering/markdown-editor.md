# Tiptap 知识编辑器与 Markdown 阅读

2026-11-06，本地实现，未部署。

## 管理端操作

知识文章新建默认排版笔记；旧稿保持纯文本，可以明确确认转换。支持标题、列表、引用、粗体/斜体、代码、表格、撤销重做；写作/源文/阅读预览切换。上传图片复用扫描资产流程，插入asset:ID，不将15分钟签名URL保存到正文。MD导入预检及确认替换，导出仅源文，不含图片文件。

插入链接：HTTP(S)外链、article:文章ID、resort:雪场ID。管理预览由NEXT_PUBLIC_WEB_SITE_ORIGIN与NEXT_PUBLIC_WEB_BASE_PATH装配，不能误用管理端basePath；未配置官网origin时保留显示文字，不捏造地址。

先保存，再按原流程发布/撤回。版本冲突重新读取并核对，未知结果不重放。没有自动保存、多用户协作、斜杠菜单或#雪场搜索。

## 工程边界

Tiptap3.33.0（MIT）仅在apps/admin；官网不引入编辑器运行时。编辑使用@tiptap/markdown内部marked；后端/native使用remark AST；官网和审核预览使用react-markdown+remark-gfm，默认禁用HTML。通用UI只接source、format、图片映射和resolveLink，不访问会话/API。三个代码仓库不共享workspace源码。

新增ContentFormat/bodyAssets等来自本仓contracts快照，版本1.53.0。旧响应无新字段按plain_text处理。新增Tiptap包版本固定，pnpm在工作区写入相应minimumReleaseAgeExclude，不是全局关闭供应链策略。

## 验证

全管理端2706/官网375用例通过后又补充2个编辑专项（最终专项21项）；两端生产构建、lint/typecheck与9工作区边界通过。Chrome合成API隔离7项点击包括浏览器File上传动作、编辑、保存CAS、MD导入导出、表格/链接预览、窄屏。它不连接真实服务，不能证明后端扫描端到端。

最终复建按两应用串行完成并生成各自standalone包。中途默认15个静态页面worker耗尽本机内存；管理端采用PowerShell临时进程环境 `$env:NODE_OPTIONS='--max-old-space-size=1536'; $env:CIRCLE_NODE_TOTAL='3'; pnpm build:admin --env-mode=loose --force`，Next使用2个页面worker后通过。`CIRCLE_NODE_TOTAL`来自当前Next版本的默认CPU数配置逻辑；Turbo严格环境默认会过滤它，故本次显式透传环境并强制执行，不作为缓存命中证据。没有修改Next配置、关闭类型检查、结束其他项目服务或部署产物。

[Chrome记录](../validation/markdown-editor-20261106/report.json)、[本轮记录](../validation/markdown-20261106.json)。截图是标注合成内容，不是线上文章。中途失败记录保留，最终以report.json为准。

复现Chrome：在本仓独立启动本地管理端3301，并配置NEXT_PUBLIC_ADMIN_API_BASE_URL=http://127.0.0.1:18080/api/v1、NEXT_PUBLIC_WEB_SITE_ORIGIN=http://127.0.0.1:3300，无basePath；随后运行 `node scripts/markdown-editor-browser.mjs`。18080所有API请求由脚本拦截，不应启动真实业务服务接收合成写入。
