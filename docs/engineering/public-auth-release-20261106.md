# 官网独立登录页线上发布 · 2026-11-06

## 结果与范围

北京时间 **2026-11-06 17:55**，新版官网已部署并完成真实 HTTPS 登录、刷新恢复会话和退出验收。

- [官网首页](https://lichcarlos.top/snow)
- [独立登录页](https://lichcarlos.top/snow/login)
- [注册界面](https://lichcarlos.top/snow/login?mode=register)
- [管理端](https://lichcarlos.top/snow-admin/login)：保留此前版本，本轮未重新构建或重启。

本轮只发布官网，包含独立登录/注册、蓝底红线 Waves、桌面摄影与表单换位、手机隐藏摄影，以及冻结时已有的官网首页/目录/相册/社区展示增量。没有发布管理端或 App，APK仍为此前1.0.2；没有迁移、seed、业务内容写入、生产注册、改密、授权调整、Nginx修改或其他项目服务重启。真实登录/退出产生正常认证会话操作，不是完全零数据库写入。

## 构建与切换

| 项目           | 记录                                                               |
| -------------- | ------------------------------------------------------------------ |
| 服务器发布目录 | `/opt/linji/releases/20261106-public-auth/web`                     |
| 官网服务       | `linji-web.service`，127.0.0.1:13100                               |
| Linux构建位置  | 本机专用WSL；服务器未编译或安装依赖                                |
| Source SHA-256 | `121f36b40aadde361b83b9ce816b9f2a5732c51265574ca1dd594c8020a3cc40` |
| Build ID       | `-Z1i--M2RiZTp8JLEYWyu`                                            |
| 框架/目标      | Next16.3.5，Node22，Linux x64 standalone                           |
| OpenAPI        | 1.53.0，未修改                                                     |
| 归档SHA-256    | `b625d4b1816cbacdde7c113a3445f808bb1aff77884e965deb8b582fb427937d` |

冻结独立源码后校验摘要，冻结锁文件安装；9-workspace边界、28文件430项官网测试、官网ESLint及完整Webpack生产构建通过，构建内TypeScript检查通过。Standalone本机复验后上传；服务器逐一校验2169文件及21条内部链接，候选实例只监听127.0.0.1:13200，首页/登录/注册返回200，再切换官网WorkingDirectory。

构建固化真实HTTPS API、站点Origin和`/snow`前缀；没有使用本机fixture地址。只更换官网服务工作目录，保留原启动参数和资源限制。31个预先运行服务的状态/PID对照，唯一变化为`linji-web.service`；后台PID1464533、API PID1464475保持不变，官网新PID1467607。候选实例和专用WSL已停止。

## 实际线上验收

[结构化结果](../validation/public-auth-release-20261106.json)。这是本轮真实服务器/API/浏览器结果，不替换或冒充此前本地fixture验收。

- 电脑1440px：登录左图右表单，注册左表单右图，实际摄影资源加载；登录页不再占用首页顶部。
- 手机390/320px：摄影隐藏，表单无横向溢出；390px首页也无横向溢出，首页零表单。
- 实际Waves画布存在；暂停/播放文字及`aria-pressed`状态切换正常。
- 使用现有账号真实登录回首页；刷新恢复Cookie会话；退出后显示独立登录入口。测试未改账号密码、权限或内容。
- 手机目录展开、Escape关闭和焦点归还通过；浏览器未观察到warning/error日志。
- 首页、登录、注册、雪场/知识/社区列表及各一个详情、管理端登录均返回200；登录页引用的17个静态资源全部读取成功。
- 公开API仍为5个雪场、8篇知识、20条故事；API健康正常、OpenAPI1.53.0。没有读取或改写用户私密资料来凑验收数据。

截图：[电脑登录](../validation/public-auth-release-20261106/login-desktop.png)、[电脑注册](../validation/public-auth-release-20261106/register-desktop.png)、[手机登录](../validation/public-auth-release-20261106/login-mobile.png)、[手机注册](../validation/public-auth-release-20261106/register-mobile.png)、[手机首页](../validation/public-auth-release-20261106/home-mobile.png)。

未提交线上注册，也未实际验收生产相册大图、OS减少动画偏好或低端GPU；Android/iOS不在本轮范围。此前本地注册fixture、相册合成数据测试不能写成生产完整闭环验收。

## 过程记录与回滚

- 首次Vitest误省略`apps/web/src`过滤，导致后台测试被官网别名配置加载；保留失败日志，修正命令后430项官网测试全部通过，无须修改业务代码。
- 一次浏览器暂停控件定位/恢复文字预期不正确；改用实际可见的“暂停背景动效/播放背景动效”后验证通过。
- 候选实例主动SIGTERM停止时，已有`start.mjs`返回143，systemd记录exit-code；已核对MainPID=0、13200端口关闭并清除该临时单元的failed状态，没有把这条记录当作线上服务崩溃。
- 原始日志、源码冻结、归档、脚本：`D:/linji-local/20261106/public-auth-release`，不含账号凭证明文；服务器旧版本保留。

仅官网回滚入口（本轮未执行）：

```sh
python3 /opt/linji/releases/20261106-public-auth/rollback-website.py
```

脚本要求当前官网仍指向本轮目录，恢复备份unit到`/opt/linji/releases/20261106-markdown/web`后仅重启官网。备份为`/opt/linji/private/backups/20261106-public-auth/linji-web.service`。回退后必须重新检查首页HTTPS和官网服务状态；不会回退后端schema、管理端或业务数据。无需重启Nginx。
