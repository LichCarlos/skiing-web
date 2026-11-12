# 2026-11-09 管理端原生链接部署前缀修复

管理端部署于 `/snow-admin`。Next Link/Router 会自动添加 basePath，而 Ant Design Button 的 href 是普通锚点。原“新建全局雪场”指向 `/admin/content/resorts/new`，浏览器离开管理端，落入 Nginx 的其他路径规则。正式环境复现时该错误路径响应404，并非业务接口重定向。

本轮将管理端原生页面链接统一经本端 `getPageHref` 装配：全局雪场新建及编辑、文章和项目知识新建、雪场/文章/项目知识表单取消或返回、商家雪场返回，以及错误恢复页返回工作台。Next Link/Router 保留应用相对路径，不重复前缀；API 地址、权限、按钮禁用和提交逻辑不变。

新增回归测试验证空前缀、`/snow-admin` 和多段前缀下的链接装配，并渲染真实全局雪场编辑按钮、404恢复链接。浏览器脚本 `scripts/admin-navigation-browser.mjs` 对新建雪场/文章/项目知识逐个点击，再取消返回列表，检查导航地址；有实际雪场时附加编辑返回检查。仅进行登录/退出和业务GET，不保存或发布内容。

上线前正式站复现见 [before报告](../validation/admin-navigation-before-20261109/report.json)。本地浏览器通过代理将正式域名下的管理端页面替换为本地构建，以实际账号读取生产数据，避免跨域Cookie影响；业务写请求应为0。

北京时间12:28已部署。构建 `VOV-11ZVLsUJqF4sxyii0`，管理端运行目录 `/opt/linji/releases/20261109-admin-navigation/admin`，PID1528600、NRestarts0。运行源码与11月6日正式后台比对，仅8个链接调用文件变化；本地已有的 dashboard.module.css 无关修改保留在工作区，发布副本沿用原正式文件。

验证：Windows 与隔离 Linux 均通过136文件2714项管理端测试；类型、lint、边界、格式和OpenAPI1.54.0校验通过。候选包校验2505文件及21链接、9个页面与42个静态资源成功。生产构建浏览器与正式HTTPS登录后的三类新建/取消返回、404恢复共4组通过，所有实际导航位于 `/snow-admin/`，页面脚本错误0、业务写请求0，验收后退出。[本地生产构建验收](../validation/admin-navigation-local-20261109/report.json)、[正式验收](../validation/admin-navigation-live-20261109/report.json)、[新建雪场截图](../validation/admin-navigation-live-20261109/resorts-new.png)、[发布汇总](../validation/admin-navigation-release-20261109.json)。本次列表没有可验收的雪场编辑入口，编辑链接由真实组件渲染回归测试覆盖；未为验收创建雪场。

本地 Turbopack 开发缓存异常及类型生成并发冲突后，停止开发服务，保留缓存备份，改用独立 Linux 生产构建完成浏览器验收；未将开发故障当作生产验收结果。测试脚本对 Ant Design 自动插入的中文按钮空格使用可访问名称匹配。

只切换并重启 `linji-admin`；其他服务PID/状态及官网、API、Nginx配置哈希不变，无数据库迁移。运行包SHA256 `f139b394e350b303ce8e93ec20bbefba32a0e9236b6de53713eb47d98b62d771`，发布源码指纹 `6afcc2f253b755ef47f8cc2f49cf86ac460e1a92ab53f632f9b4cd5e66c51169`，原始本地导出指纹 `0d1f836863dbbd8dc1b760a2f3941c3307a31cfa478022b7a5285d4841072480`；两者仅上述排除的后台CSS不同。

回滚命令：`python3 /opt/linji/releases/20261109-admin-navigation/rollback-admin.py`。先确认当前仍为本次版本，再恢复 `/opt/linji/releases/20261106-markdown/admin` 的管理端单元。备份 `/opt/linji/private/backups/20261109-admin-navigation/linji-admin.service`。
