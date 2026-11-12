# 官网独立登录与注册页 · 2026-11-06

## 当前状态

**最新：2026-11-06 20:59已恢复桌面左右切换。** 按用户最新澄清，照片40%、表单60%平移互换，指定双箭头固定整张卡片中央，注册增加确认密码；下方20:04固定左右布局为历史状态。见[最新实现与验收](home-grid-auth-swap-20261106.md)。

**最新：2026-11-06 20:04固定卡片版本已上线。** 下方早期“注册时左右换位”为历史实现；本轮采用照片固定左侧、表单固定右侧，保证切换按钮屏幕位置不变。详见文末最新记录。

**后续发布更新：2026-11-06 17:55已上线。** 见[官网部署报告](public-auth-release-20261106.md)，含真实HTTPS登录/会话恢复/退出与响应式结果。原始实现阶段仅本地验证，以下本地fixture证据仍保持原边界；APK未变。

## 实现与操作

- `/login`独立页面；PublicSessionProvider不再注入顶部details/form，导航只展示登录／注册入口、昵称、退出与异常核对。游客文章收藏链接也跳到该页。
- 按最终确认：电脑端一张白色黑框圆角卡，**登录左图右表单，注册左表单右图**；≥850px网格换位，小屏隐藏照片。切换聚焦新标题、清空密码、关闭密码显示；摄影裁切揭幕与表单有限淡入，不循环闪烁。最终不用交叉平移，避免过渡中输入框与照片叠压。
- 实际React Bits Waves：蓝底红线、鼠标响应、暂停控制、减少动画与资源清理。无WebGL2保留蓝底；无JS可返回公开内容，登录需要JS。
- Webwizzard的CC BY-SA4.0霞慕尼滑雪摄影，本地资源与可见署名；不是入驻雪场实拍。手机picture不选择摄影资源。
- 账号密码登录、普通用户注册/昵称、密码显隐；注册成功回登录，不自动登录。不添加虚假的OAuth、短信、扫码或自助找回密码。

## 安全与契约

继续使用官网PublicSessionRun/Fence和apiRequest：HttpOnly Cookie、CSRF、账号规范化、响应校验、结果未知时手动核对、路由隔离与注销。无localStorage凭证。

注册复用**已有**POST /auth/register及RegisterUserDto/RegisteredUserVO。RegistrationRun阻止重复提交、校验UTF-8字节/trim昵称和响应身份；卸载后忽略迟到结果、不自动重复结果未知的注册。没有新增后端协议或赋权。

回跳仅接受既有公开路由白名单，拒绝外域/双斜杠/反斜杠/控制字符/编码路径/登录及后台路径，失败回首页。Link/router处理basePath，不写死域名或/snow。

## 研究和取舍

- 实际查看[Discord登录](https://discord.com/login)：清晰标题/标签、单一主行动、注册切换和品牌背景；采用任务结构，不照搬二维码/暗色。
- [Discourse](https://meta.discourse.org/login)遇浏览器检查，未绕过，不声称完整研究或给社区产品做过“最优”排名。
- 人工查看用户指定[Waves](https://www.reactbits.dev/tools/background-studio?bg=waves)并使用实际源码。其**MIT+Commons Clause**许可与本地改动保留在vendor目录。

## 验证边界

[结构化验证记录](../validation/public-auth-page-20261106.json)。

- 官网类型检查、ESLint、9workspace边界；官网单元/SSR测试410项通过，覆盖新页面/注册/白名单/生命周期及既有会话与收藏。
- 本地浏览器：Next Webpack开发服务127.0.0.1:3210/snow/login，API为127.0.0.1:3211内存fixture，**不是生产端到端**。检查桌面换位、手机隐藏照片、密码显隐清除、错误/核对、注册后手动登录、退出、首页零登录表单和部署前缀。
- 源码支持减少动画；实际OS偏好/低端GPU/原生设备未验。不把官网浏览器等同于App验收。
- 原始素材、fixture与截图：D:/linji-local/20261106/login-ui。阶段性上游严格类型适配/测试定位失败不掩盖为首次即成功。

## 发布/回滚

部署需独立官网Linux生产构建，固化真实API/站点地址/basePath；不能部署本机fixture地址。上线再验真实Cookie域/Origin、CSRF、限流、注册不自动登录与回跳。

无schema迁移，可独立回退前端包；不覆盖其他功能。管理员端、Expo App及其他服务不在修改范围。

## 2026-11-06 视口高度修复（已上线）

北京时间18:13更新至`/opt/linji/releases/20261106-auth-viewport/web`。只调整`apps/web/src/features/auth/auth-page.module.css`，未改认证、接口或数据；后台/API及其他预先运行服务PID保持不变。

根因：1366×768的原页面约885.2px高，照片`min-height:650px`与页头/页脚/留白叠加，`min-height:100svh`不能约束内容。现使用`height:100vh; height:100dvh`和三行Grid（auto/minmax(0,1fr)/auto）；主区域、卡片、图片、表单允许收缩，去掉固定照片高度，≤900px高时减少留白。不通过全局`overflow:hidden`裁切表单，不缩小输入/按钮的点击区域。

[完整报告](../validation/auth-viewport-20261106.json)：Linux冻结构建、430项官网测试、ESLint、边界、生产构建内TypeScript、2169文件/21链接standalone校验通过。真实HTTPS检查6组登录尺寸和5组注册尺寸：1366×768、1280×720等桌面登录的页面高度等于视口，表单自身无溢出；390×844手机登录同样无滚动。320×568、横屏844×390及部分注册场景内容较长时，仅表单内部滚动；320px注册页用键盘到达协议链接后，内部滚动313.6px、文档滚动仍为0，未裁切核心操作。

11组尺寸的文档高度/宽度均未超视口；844×390的页面有约0.4px子像素舍入，不构成文档滚动。没有声称实际软键盘、手机浏览器地址栏变化、OS缩放或原生设备已验。最初尺寸矩阵误测非当前标签，发现视口未变化后弃用，改为单一测试标签并逐组校验实际尺寸。临时localhost生产预览的跨域认证恢复提示不算真实登录验收；本轮线上仅只读布局检查，没有提交登录或注册。

截图：[1366×768登录](../validation/auth-viewport-20261106/login-1366x768.png)、[390×844登录](../validation/auth-viewport-20261106/login-390x844.png)。原始构建/发布/回归证据`D:/linji-local/20261106/auth-viewport-release`。Build ID `ouxw1WisBM6iEmccbJ7Z8`，公开数据仍为5个雪场/8篇知识/20条故事，OpenAPI1.53.0。

仅官网回滚：`python3 /opt/linji/releases/20261106-auth-viewport/rollback-website.py`，回到上一版`/opt/linji/releases/20261106-public-auth/web`；本轮未执行回滚。旧备份与归档保留，候选和专用WSL验证进程已结束，Nginx无需重启。

## 2026-11-06 固定卡片与单图标切换（已上线）

北京时间20:04:46仅更新官网至`/opt/linji/releases/20261106-auth-card/web`。本轮修改`auth-page.tsx`、`auth-page.module.css`及既有页面测试断言；保留其他已有改动。后台、API、数据库、Nginx和APK未改。

卡片宽度上限1080px、高度上限680px，受可用视口约束；同一视口下登录、注册、会话加载阶段使用完全相同尺寸。电脑端图片区域与表单区域为2:3，照片保持左侧，去掉模式切换导致的照片重挂载与左右换位。单个48px图标按钮固定在表单区域顶部水平中央，登录蓝底、注册白底，有明确可访问名称、焦点和忙碌状态。注册表单桌面账号/昵称并排；手机隐藏图片并使用单列表单。保留表单淡入，卡片不随内容改变尺寸。

注册成功沿用已有回调：返回登录、保留注册账号、清除密码显示并提示手动登录，不自动创建登录会话。登录/注册认证、Cookie/CSRF、回跳和权限契约未改。极短屏仅表单正文允许内部滚动，切换按钮不随其滚动；不裁切核心操作，也不缩小输入和按钮点击区域。

[结构化验收记录](../validation/auth-card-20261106.json)：9个workspace边界、28文件430项官网测试、ESLint、完整Linux生产构建及TypeScript通过；standalone2169文件/21链接校验通过。真实HTTPS在1366×768、1280×720、1024×768、850×650、1440×900、390×844六组尺寸验证登录/注册卡片和图标坐标一致，文档无横纵溢出，表单正文均无需内部滚动。1366×768加载禁用状态到会话恢复结束，卡片始终1080×624，图标坐标不变；浏览器无警告/错误。

注册成功回登录另用本地Next服务及内存fixture实际验证；线上没有提交测试注册或其他业务写入。320×568等极短屏仍保留内部滚动降级，未声称所有窗口高度无滚动。未实际验证真机软键盘、OS缩放或原生App。独立候选端口13200已停止、失败状态清理，专用WSL与本轮本地开发/fixture服务已结束。

真实HTTPS首页、登录/注册、雪场/知识/社区列表与详情、后台登录、17个登录静态资源及API健康检查通过；公开数据仍为5雪场/8知识文章/20故事，OpenAPI1.53.0。31个预先运行服务中仅官网服务变更；后台/API进程保持运行。

截图：[桌面登录](../validation/auth-card-20261106/login-1366x768.png)、[桌面注册](../validation/auth-card-20261106/register-1366x768.png)、[手机登录](../validation/auth-card-20261106/login-390x844.png)。Build ID `DAjT0OocqHj2ydsxIq8HC`，原始证据`D:/linji-local/20261106/auth-card-release`。

仅官网回滚：`python3 /opt/linji/releases/20261106-auth-card/rollback-website.py`，回到`/opt/linji/releases/20261106-auth-viewport/web`。备份`/opt/linji/private/backups/20261106-auth-card/linji-web.service`保留，本轮未执行回滚。
