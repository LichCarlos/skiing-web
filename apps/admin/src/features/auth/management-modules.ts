import type { components } from "@common/api-contracts/openapi";
import { routes } from "@/config/routes";
import { canAccessManagementPage } from "@/platform/auth/access";
import type { AdminIconName } from "@/components/admin-icon";

const modules = [
  {
    href: routes.ragSources,
    label: "RAG 来源运维",
    detail: "查看索引、受理重建与人工启停",
  },
  {
    href: routes.aiConversationAudits,
    label: "AI 会话审计",
    detail: "最少元数据与带原因的受控正文读取",
  },
  {
    href: routes.merchantDashboard,
    label: "商家经营概览",
    detail: "查看获授权雪场状态与经营收益",
  },
  {
    href: routes.systemConfig,
    label: "系统配置",
    detail: "维护平台介绍、联系信息和政策正文",
  },
  {
    href: routes.events,
    label: "消息任务",
    detail: "查询投递状态与重试失败事件",
  },
  {
    href: routes.operationLogs,
    label: "操作日志",
    detail: "只读查询管理操作记录",
  },
  {
    href: routes.users,
    label: "账号管理",
    detail: "查询账号身份、角色与启停状态",
  },
  { href: routes.roles, label: "角色管理", detail: "维护角色定义与授权范围" },
  {
    href: routes.permissions,
    label: "权限目录",
    detail: "管理目录、菜单与操作权限",
  },
  {
    href: routes.dictionaries,
    label: "数据字典",
    detail: "维护分组与多层级字典项",
  },
  { href: routes.fields, label: "字段管理", detail: "配置业务字段及访问策略" },
  {
    href: routes.adminResorts,
    label: "全局雪场",
    detail: "管理雪场资料与发布状态",
  },
  {
    href: routes.merchantResorts,
    label: "我的雪场",
    detail: "维护获授权商家范围内的雪场",
  },
  {
    href: routes.articles,
    label: "知识文章",
    detail: "维护滑雪知识与发布状态",
  },
  {
    href: routes.projectKnowledge,
    label: "项目知识",
    detail: "维护用于 AI 回答的平台资料",
  },
  { href: routes.dynamics, label: "社区审核", detail: "审核动态与评论" },
  {
    href: routes.adminAssets,
    label: "媒体资源",
    detail: "查询媒体状态与使用情况",
  },
  {
    href: routes.merchantRevenue,
    label: "收益数据",
    detail: "查看获授权商家范围内的收益",
  },
  {
    href: routes.adminRevenue,
    label: "收益维护",
    detail: "录入及导入雪场收益报表",
  },
] as const;

export function getManagementModules(
  user: components["schemas"]["CurrentUserVO"],
) {
  return modules.filter(({ href }) => canAccessManagementPage(user, href));
}

const groups = [
  {
    key: "content",
    label: "内容运营",
    icon: "content",
    paths: [
      routes.adminResorts,
      routes.articles,
      routes.projectKnowledge,
      routes.dynamics,
      routes.adminAssets,
    ],
  },
  {
    key: "business",
    label: "商家经营",
    icon: "business",
    paths: [
      routes.merchantDashboard,
      routes.merchantResorts,
      routes.merchantRevenue,
      routes.adminRevenue,
    ],
  },
  {
    key: "identity",
    label: "账号与权限",
    icon: "identity",
    paths: [routes.users, routes.roles, routes.permissions],
  },
  {
    key: "settings",
    label: "系统设置",
    icon: "settings",
    paths: [
      routes.dictionaries,
      routes.fields,
      routes.systemConfig,
      routes.operationLogs,
    ],
  },
  {
    key: "ai",
    label: "AI 与任务",
    icon: "ai",
    paths: [routes.ragSources, routes.aiConversationAudits, routes.events],
  },
] satisfies {
  key: string;
  label: string;
  icon: AdminIconName;
  paths: readonly string[];
}[];

/** Group only routes already admitted by the existing access policy. */
export function getManagementGroups(
  user: components["schemas"]["CurrentUserVO"],
) {
  const visible = getManagementModules(user);
  return groups
    .map(({ paths, ...group }) => ({
      ...group,
      items: paths.flatMap((path) =>
        visible.filter(({ href }) => href === path),
      ),
    }))
    .filter(({ items }) => items.length > 0);
}

/** Longest match keeps merchant revenue from also selecting its parent overview. */
export function getActiveManagementModule(
  user: components["schemas"]["CurrentUserVO"],
  pathname: string,
) {
  return getManagementModules(user)
    .filter(({ href }) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
