# 2026-11-07 官网筛选路径、雪场配色与隐藏滚动条

最终版本已于北京时间2026-11-07 11:23部署至 https://lichcarlos.top/snow 。

## 修复

知识、雪场、动态使用原生GET表单，原action是`/knowledge`、`/resorts`、`/dynamics`。Next Link与Router会处理basePath，但原生form和a不会，因此筛选提交逃出了官网`/snow`前缀。三处表单改为使用既有本端`getPageHref`，继续保留原生提交、查询编码与无JS可用性。错误/404页的整页“返回首页”链接也使用该函数，根路由直接返回`/snow`，避免额外尾斜杠跳转。普通Next Link和Router继续使用应用相对地址，正文关联链接保持既有前缀装配。

服务器实际检查中，用户提供的两个`/knowledge?...`根路径返回404，无Location头；正确的`/snow/knowledge?...`返回200。Nginx只将`/snow`和`/snow/`转给官网。本轮修复生成错误地址的页面，没有新增域名根目录重写。

雪场卡片原为透明底，旧的灰蓝地区、评分和价格叠在蓝色画布上。现使用系统黄色`#FFDA3D`实底、黑色标题/地区/评分/价格/标签，补齐信息区内边距；状态和序号同样黄底黑字。黄色大标题保留撞色，蓝底小字号说明和统计使用白色。黄黑对比度15.35:1，黄色大标题与蓝底4.16:1（符合大字3:1要求），白色小字与蓝底约5.69:1。

全官网使用独立`scrollbars.css`隐藏轨道和滑块，兼容标准scrollbar-width与WebKit伪元素。全局样式与独立global-error分别加载这份规则，删除首页内容轨和相册的thin覆盖。没有通过overflow:hidden禁用页面阅读；滚轮、键盘、焦点移动和内部滚动继续工作。后台作为独立应用未修改。

## 验证

30个官网测试文件、457项测试通过，新增6项部署前缀回归覆盖根部署、`/snow`及嵌套前缀的三种GET表单和错误恢复。Linux生产构建、TypeScript、ESLint、workspace边界及standalone清单检查通过。2169个发布文件、21个内部链接通过哈希核对。

最终构建47个HTTP路由检查通过：46个有效页面返回200且无重定向，另一个预期404显示站内恢复链接。涵盖全部5个雪场、8篇知识、20条动态详情、三目录、静态页、登录/注册和用户提供的两种筛选查询；未发现根路径逃逸或重复`/snow/snow`。静态资源18项、后台登录和API健康检查通过，公开内容数量保持不变。

真实浏览器验证空条件和中文关键词筛选、清除筛选、雪场回车提交（万龙匹配1条）、动态搜索，地址均保留`/snow`。这些功能检查完成于11:13的同一功能版本；11:23最终版本仅将蓝底小字恢复高对比白色，重新通过全部HTTP检查及真实渲染验收。最终1440×900与390×844检查5张卡片封面正常、DOM文字全黑、信息区系统黄色，无手机横向溢出。短屏390×568的注册表单内部滚动从0到184.8px，滚动容器的scrollbar-width为none，WebKit滑块display为none。知识长页滚动正常且无右侧滚动条。

截图及详细记录见[验收报告](../validation/route-contrast-scrollbars-20261107.json)。使用桌面应用浏览器的响应式视口，未执行实体手机触摸、Firefox或Safari验收。未提交线上账号、修改内容数据或执行回滚。

## 发布与回滚

最终工作目录`/opt/linji/releases/20261107-route-contrast-scrollbars-final/web-reviewed`，构建ID`Ug5ae9V9NAew27LbPDsOG`，官网PID1485419。仅重启`linji-web.service`，其他运行服务PID未变；数据库、API、后台和Nginx未修改。

回滚命令：`python3 /opt/linji/releases/20261107-route-contrast-scrollbars-final/rollback-website.py`。脚本仅在官网仍指向本最终版本时生效，使用本轮首次发布前的备份恢复`/opt/linji/releases/20261107-auth-footer-type/web-reviewed`。

最终源码摘要`e9c17ef012d25b67ab1cc38de5c95a3049a77ec2991840588e1e2a0faa23ef1c`，包摘要`a359ba4bc63da6f7b39c0e5864d4d6cf843d5fe67025e3c3afc5400c97b0fd9d`。发布脚本与日志位于`D:/linji-local/20261107/route-contrast-scrollbars-final`。早期构建在发现标题及独立错误页覆盖问题后停止并重新导出源码；最终构建独立完成全部检查。验收文档在构建后归档，源码未提交或推送。候选服务、SSH转发和WSL构建均已停止，本地3108开发服务保留。
