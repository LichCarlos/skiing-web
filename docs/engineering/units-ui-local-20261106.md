# 官网参考站风格本地实现 · 2026-11-06

## 范围与授权

用户确认：“按上述方案执行”，本轮落实桌面常驻侧栏+展开目录、手机简化导航、首页纵滚驱动横向卡片，并合并更新官网 DESIGN.md。蓝主体、红黄橙紫、白底、黑框、圆角和像素几何沿用明确要求。

**这是本地源码与生产包验证，不是线上发布。**没有修改 backend/app、数据库、权限、OpenAPI、依赖版本或服务器。Markdown内容业务协议、地图供应商/Key/DEM仍未确认；不能把本轮UI授权解释为批准这些候选接口或迁移。

## 已实现

| 部位     | 变化                                                                                   | 保持不变                                                      |
| -------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 官网导航 | ≥1100px 的156px固定侧栏；窄屏完整导航行；原生dialog目录，遮罩/Escape/焦点循环和归还    | 三个内容栏目和本端routes；不编造地区、商家或权限入口          |
| 首屏     | 蓝色大面、黄色标题、白底黑框圆角；本地像素雪花；有限渐入，支持的浏览器滚动渐出营销标题 | 平台名/标语读取现有配置；雪景仍标“非雪场实拍”，普通正文不渐隐 |
| 雪场推荐 | 真实公开卡片；桌面sticky纵滚映射横移；前后控制按钮；键盘聚焦卡片自动移入视口           | 请求仍为现有pageSize=3，只表示推荐，不假称全库地图/全部商家   |
| 降级     | 触摸/减少动画原生横滑；窗口高度不足不启用sticky；无JS为普通网格                        | 原有详情链接、公开筛选及数据失败/空态                         |
| 内容区域 | 紫色知识章节、橙色社区章节、黑框卡片；列表筛选/卡片和页脚统一轮廓                      | 文章/动态内容、日期、演示标识、收藏/会话业务逻辑与独立接口    |
| 工程资料 | DESIGN.md合并、PRODUCT.md、设计sidecar、计划状态表/阅读顺序和验证脚本                  | 三仓独立；未将业务状态塞进公共组件包                          |

新增组件：`src/components/site-symbol.tsx`（SVG方向/关闭图标）、`snow-mark.tsx`、导航CSS Module、`features/home/scroll-rail.tsx`与首页CSS Module。动画不依赖新增库；scroll监听passive，RAF合并，ResizeObserver重新测量，卸载清理监听。

### 没有做的部分

- 未接地图SDK，不用装饰Canvas/随机等高线伪装地图；真实地址入口仍沿用雪场目录/详情。地图需后续选择服务商、预算、Key、坐标系及授权DEM。
- 未实现Markdown解析、编辑器、正文多雪场关系、格式字段或正文Asset关系。
- 后台、App本轮未改版/构建；没有APK、原生iOS/Android或线上HTTPS验收。
- 不是对UNITS全部设备/全部时序的逐像素复刻；借鉴导航和滚动机制，不复制商标、源码或照片。

## 验证与复现

结果与截图：[浏览器报告](../validation/units-ui-20261106/report.json)、[首屏](../validation/units-ui-20261106/desktop-home.png)、[导航](../validation/units-ui-20261106/desktop-navigation.png)、[横向段落](../validation/units-ui-20261106/desktop-horizontal.png)、[手机全页](../validation/units-ui-20261106/mobile-home.png)。最终执行结果以报告中的时间和逐条状态为准。

- 官网源目录Vitest：**24文件 / 375项**通过，含首页56项。首轮新增导航hook使3个测试文件缺少usePathname mock，21项失败；补齐测试适配后全通过，未删除原断言。
- 官网lint、typecheck、9个workspace边界检查、OpenAPI快照校验均通过；生产build与standalone打包/校验通过，Build ID为`9-do3gYtNyT0qn_4eq4Ni`。OpenAPI仍为`1.52.0`，未修改契约。
- 最终本地生产包Chrome验收：**14项通过，运行时错误0项**；报告时间为`2026-11-06T05:59:32.666Z`，对应北京时间13:59。与375项Vitest分别计数，不合并为真实认证或线上验收。
- 浏览器脚本针对本地standalone生产进程，Chrome真实浏览器；320/390/768/1440/1920布局、目录/焦点、纵滚横移、减少动画动态切换、无JS及公开列表/详情导航。
- 浏览器使用真实公开内容GET；为避免把localhost加入线上CORS，测试脚本对公开读取做GET转发，对会话只给**合成游客响应**。没有把凭证传给线上，没有真正登录或提交写请求。因此这不是认证/CORS生产部署验收。
- `720×450`是200%视口布局等效检查，**不是实际浏览器缩放、屏阅或物理手机验证**。触屏由Chrome设备参数模拟，不能替代Safari/真机。
- 首轮浏览器检查修复了目录Tab边界、sticky总高度和在途读取的测试清理；最终报告以最后一次生产包执行为准。
- 列表跳转专项改为等待目标URL和真实详情，避免将旧列表误当详情；为原本缺少一级标题的动态详情补充“雪友动态”语义标题，不改正文或业务模型。
- Windows本地构建曾因自己的standalone预览进程占用release目录出现EBUSY；停止该预览后重建，不删除源码、不触碰服务器或其他项目进程。
- Impeccable检测执行一次，出现18条token登记建议（圆角/辅助色），无阻断项；按已存在的实际样式补全DESIGN登记，未以扫描通过代替渲染检查。未二次运行扫描，也不声称零建议报告。

在独立Web仓库根目录运行，不需要安装新依赖：

```powershell
pnpm exec vitest run --config apps/web/vitest.config.ts apps/web/src
pnpm --filter @common/web lint
pnpm --filter @common/web typecheck
pnpm check:boundaries
pnpm openapi:verify
```

构建时显式设置本项目公开API地址（只读验收环境也可），不要把私钥或账号密码放入NEXT_PUBLIC变量；本轮未写入.env。启动构建产物：

```powershell
pnpm build:web
$env:PORT='3300'
$env:HOSTNAME='127.0.0.1'
node apps/web/.next/release/start.mjs
```

另开终端：

```powershell
$env:UI_PREVIEW_ORIGIN='http://localhost:3300'
$env:UI_PUBLIC_API_BASE_URL='https://lichcarlos.top/snow-api/api/v1'
node scripts/units-ui-browser.mjs
```

当前浏览器脚本的公开GET数据源是项目既有HTTPS API，仅允许公开配置/雪场/文章/动态读取；不允许把该脚本当作可写认证测试。若需离线/隔离后端验收，应另准备受控fixture服务，不能将生产写权限混入此脚本。

## 尚待验收与上线门禁

1. 目标Safari/Firefox、实际200%浏览器缩放、屏幕阅读器、物理触屏与低端设备性能。
2. 完整真实会话/收藏交互、真实同域子路径与网关/CORS；本轮保留逻辑不等于已完成这些专项。
3. 最终字体/图片及地理数据版权复核、真实地图专项；不以本地组件质量宣称外部奖项认证。
4. 如获发布授权，先冻结独立源码/产物与指纹、保留旧发布目录、候选端口验证再切流；本轮没有执行此步骤。
5. 工作树已有大量原有改动，回退只能针对本轮文件清单做逆向补丁/保留旧发布包，禁止`git reset`或整文件还原抹掉其他改动。

## 文档责任

- 共享[Markdown计划](../../../docs/03-详细设计与接口数据/Markdown内容系统与雪场引用实施计划.md)保留候选协议与C01–C10门禁。
- 共享[视觉/地图计划](../../../docs/04-研发规范/官网视觉导航滚动与真实地图设计计划.md)保留参考证据、V0–V3与地图待决。
- [官网规范](../../apps/web/DESIGN.md)记录本轮已落实的设计系统；历史部署记录不改写为本轮部署。
