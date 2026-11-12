# 网页设计方法与 GitHub Skills 研究

核对日期：2026-11-06。不存在可客观验证的“世界最强 UI 设计师排行榜”，这里选择有公开方法、成熟产品和工程实践的代表，不以获奖或 GitHub 星数代替用户体验质量。

## 代表团队遵循的方案

| 代表                                   | 可核对的一手资料                                                                          | 值得采用的方法                                                                                         | 本项目的落点                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Karri Saarinen 与 Linear 设计/工程团队 | [How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui) | 先找导航和视觉层级问题；用真实页面与状态做压力测试；设计师与工程师一起迭代；系统刷新不等于重做业务流程 | 后台保持现有分组和权限，只整理外壳、指标层级与内容密度                         |
| Vercel / Geist 团队                    | [Web Interface Guidelines](https://vercel.com/design/guidelines)                          | 键盘可操作、清晰焦点、明确反馈、表单标签、布局稳定、真实响应式是质量基线，不是上线后的附加工作         | 首页键盘跳转、首屏图片加载优先级、手机和中间尺寸检查                           |
| IBM Carbon 团队                        | [About Carbon](https://carbondesignsystem.com/all-about-carbon/what-is-carbon/)           | 把颜色、字体、间距、组件与状态形成系统，通过 token 维护一致性                                          | 官网章节留白和容器宽度由语义变量维护，后台继续使用 Ant Design 而不混入新组件库 |
| Pentagram                              | [About](https://www.pentagram.com/about)                                                  | 品牌表达来自具体业务和媒介，而不是给所有客户套同一种模板                                               | 保留滑雪场景和已确认的蓝色、红黄橙视觉，不照搬 Linear 的低饱和 SaaS 皮肤       |

最后一行是对公开作品与本项目约束的应用判断，不表示 Pentagram 为本项目提供了方法认证。官网、后台和文章阅读页也不应该使用完全一样的表达强度。

### 共通工作流

1. **任务优先**：先确定访客要探索雪场、阅读知识，还是管理员要查询/维护数据。
2. **建立主次**：每个页面明确主要动作，区分总量、细分状态、解释信息，不让每一块都抢眼。
3. **约束成系统**：颜色有角色，间距有尺度，组件有正常/悬停/聚焦/禁用/加载/失败/空状态。
4. **用真实内容验证**：没有公开雪场就显示真实空状态，不用演示数据伪装运营成果。
5. **设计与工程一起迭代**：查看运行后的页面，检查字体、换行、照片裁切、触控和键盘路径。
6. **分阶段交付**：源码、测试、浏览器检查、上线与真机验收分别记录，不混为“全部完成”。

## GitHub Skill 筛选与安装

先读取 [skills.sh](https://skills.sh/) 的目录与安装量，再核查 GitHub 官方来源、正文、许可证和提交版本。安装量和星数只是维护/采用情况的线索，不是设计效果排名。

| Skill / 仓库                                                                                                                                    | 核查时数据                                 | 选择与用途                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| [frontend-design](https://github.com/anthropics/skills/tree/ca45fc496a3436251f191354091d557da31c15b5/skills/frontend-design)                    | skills.sh 约 1.1M 安装；仓库 187,773 stars | 安装。先形成与业务相关的构图/字体/配色判断，避免通用模板，再截图自评       |
| [web-design-guidelines](https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/web-design-guidelines) | 约 829.8K 安装；仓库 33,602 stars          | 安装。用于键盘、语义、焦点、图片、响应式和交互审核                         |
| [Impeccable](https://github.com/pbakaus/impeccable)                                                                                             | 仓库 103,975 stars，Apache-2.0             | 本机已安装，继续使用其 polish 工作流、现有设计系统约束、机械扫描与视觉检查 |
| [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)                                                                        | 仓库 145,723 stars，MIT                    | 已有本机 skill；作为候选设计资料，不再重复安装或让推荐色板覆盖用户已定配色 |

以上为读取时的动态数据，来源留存于 `D:/linji-local/20261106/ui-research/sources.json`、`skills-leaderboard-readable.txt`；不保证后续保持一致。Anthropic 单项 skill 附带 `LICENSE.txt`，不能把仓库未声明统一许可证理解为所有内容开源许可相同。

本次使用内置 skill-installer，以固定提交安装到用户技能目录：

```powershell
py -3.12 C:/Users/Administrator/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py --repo anthropics/skills --ref ca45fc496a3436251f191354091d557da31c15b5 --path skills/frontend-design
py -3.12 C:/Users/Administrator/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py --repo vercel-labs/agent-skills --ref 1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62 --path skills/web-design-guidelines
```

安装结果：`C:/Users/Administrator/.codex/skills/frontend-design` 和 `C:/Users/Administrator/.codex/skills/web-design-guidelines`。下轮对话可自动发现；本轮已经读取其完整规范并应用。未执行社区仓库中的业务脚本、未新增前端依赖，未修改已有 Impeccable。

Vercel skill 的规则源为 [web-interface-guidelines/command.md](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)，本轮已获取快照。字体/文案建议按中文产品使用场景解释，不把英文 Title Case 机械套到中文。

## 本轮实际调整

- 官网保留品牌名、文案、真实 API 内容与黄/橙色内容区。首屏从整图蒙层改为蓝色文案区和雪景图片区，使用 Next Image 的高优先级加载，不再依赖 CSS 背景延迟发现图片。
- 删除导致连续内容区上方留白归零的覆盖规则，统一章节间距、容器、标题重量；不把每个版块都改成相同卡片模板。
- 为首页提供可聚焦的跳转入口与真实目标，图片为品牌氛围图，使用空 alt，避免伪装成特定雪场实拍。
- 页脚回到白色信息区，蓝色链接保留一致的悬停/聚焦反馈；页面底部不再叠一整块同强度荧光黄。
- 管理端保留蓝色当前导航、红色分组图标及黄/橙识别细节，外壳使用白色，让操作内容成为视觉主角。
- 统计总数和 RAG 失败数拥有明确主层级，细分状态保留全部真实数据，收益以蓝色强调。权限、scope、金额精度和操作逻辑不变。

用户随后将 Awwwards、Webby Awards、FWA 提为品质目标。本轮进一步优化本地雪山响应式图片、首屏有限动效、非对称空状态章节、登录工具栏及无封面业务卡片；不把原有的首轮截图/计数当成最终版本证据。详见[品质自检与边界](award-quality-review-20261106.md)。

机械扫描指出顶部 3px 内阴影色条属于装饰性强调，已删除。该扫描仅执行一次，不能把它的结果当成视觉或无障碍完整认证。

## 交付边界

本轮范围为 Next.js 官网、管理端及相关文档；不改后端、接口、数据库、权限、Expo 源码或安装包。不执行新的服务器部署或 Git 推送；线上仍是前次已部署版本。最终测试、真实浏览器范围及限制见 [本轮验证报告](../validation/ui-design-research-20261106.json)。
