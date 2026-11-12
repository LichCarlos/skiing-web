import { apiRequest } from "@/platform/api";
import {
  parseAccountPage,
  parseManagedAccount,
  parseAccountRolePage,
} from "@/features/users/user-response";
import {
  verifyAccountReader,
  UserInputError,
  type Operator,
  type AccountRole,
  type ManagedAccount,
  accountListQuery,
} from "@/features/users/user-model";
import type { AccountMutation } from "@/features/users/user-recovery";
export async function verifyAccountIdentity(
  user: Operator,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  verifyAccountReader(user, user);
  verifyAccountReader(
    await apiRequest<unknown>("/auth/me", { signal, cache: "no-store" }),
    user,
  );
  signal.throwIfAborted();
}
export async function readAccountTarget(id: number, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647)
    throw new UserInputError("账号编号无效");
  const account = await apiRequest<unknown>(`/admin/users/${id}`, {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  return parseManagedAccount(account, id);
}
export async function readAccountDetail(
  user: Operator,
  id: number,
  signal: AbortSignal,
) {
  await verifyAccountIdentity(user, signal);
  const result = await readAccountTarget(id, signal);
  await verifyAccountIdentity(user, signal);
  return result;
}
export async function readAccountPage(
  user: Operator,
  page: number,
  keyword: string,
  status: string | undefined,
  signal: AbortSignal,
) {
  const query = accountListQuery(page, keyword, status);
  await verifyAccountIdentity(user, signal);
  const raw = await apiRequest<unknown>(`/admin/users?${query}`, {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  const result = parseAccountPage(raw, page, 20, status);
  await verifyAccountIdentity(user, signal);
  return result;
}
export async function readAccountRoleCatalog(
  user: Operator,
  signal: AbortSignal,
): Promise<AccountRole[]> {
  verifyAccountReader(user, user);
  if (!user.permissionKeys.includes("system:role:list"))
    throw new UserInputError("当前账号缺少角色目录查询权限");
  await verifyAccountIdentity(user, signal);
  const roles = new Map<number, AccountRole>();
  const seen = new Set<number>();
  for (let page = 1; ; page++) {
    signal.throwIfAborted();
    if ((page - 1) * 100 > 2147483647)
      throw new UserInputError("角色目录分页越界");
    const raw = await apiRequest<unknown>(
      `/admin/roles?page=${page}&pageSize=100&status=active`,
      { signal, cache: "no-store" },
    );
    signal.throwIfAborted();
    const result = parseAccountRolePage(raw, page);
    if (
      result.page !== page ||
      result.pageSize !== 100 ||
      (result.hasNext && result.items.length === 0)
    )
      throw new UserInputError("角色目录分页异常，请重试");
    for (const role of result.items) {
      if (
        !Number.isSafeInteger(role.roleId) ||
        role.roleId < 1 ||
        role.roleId > 2147483647 ||
        seen.has(role.roleId)
      )
        throw new UserInputError("角色目录已变化，请重试");
      seen.add(role.roleId);
      if (role.status === "active") roles.set(role.roleId, role);
    }
    if (!result.hasNext) {
      await verifyAccountIdentity(user, signal);
      if (!user.permissionKeys.includes("system:role:list"))
        throw new UserInputError("当前账号缺少角色目录查询权限");
      return [...roles.values()];
    }
  }
}
export async function readAccountMutationReview(
  user: Operator,
  mutations: readonly AccountMutation[],
  signal: AbortSignal,
): Promise<string[]> {
  await verifyAccountIdentity(user, signal);
  const summaries: string[] = [];
  for (const mutation of mutations) {
    signal.throwIfAborted();
    let account: ManagedAccount | undefined;
    if (mutation.action !== "create")
      account = await readAccountTarget(mutation.userId, signal);
    else {
      const query = new URLSearchParams({
        page: "1",
        pageSize: "100",
        keyword: mutation.account,
      });
      const raw = await apiRequest<unknown>(`/admin/users?${query}`, {
        signal,
        cache: "no-store",
      });
      signal.throwIfAborted();
      const result = parseAccountPage(raw, 1, 100);
      if (result.page !== 1 || result.pageSize !== 100)
        throw new UserInputError("账号查询分页异常，请重试");
      const matches = result.items.filter(
        (item) => item.account === mutation.account,
      );
      if (matches.length > 1)
        throw new UserInputError("目标账号数据不一致，请重新读取");
      account = matches[0];
      if (!account && result.hasNext)
        throw new UserInputError(
          "目标账号尚未定位，请先在账号列表核对完整查询结果",
        );
      if (!account) {
        summaries.push(
          `${mutation.account}：当前查询未找到可见账号；请核对账号及数据范围，不能据此确认创建失败。`,
        );
        continue;
      }
    }
    summaries.push(
      `${account.account}（${account.userId}）：${account.status === "active" ? "启用" : "停用"}；角色：${account.roles.map((role) => `${role.roleName} (${role.roleKey}, ${role.status})`).join("、") || "未分配"}`,
    );
  }
  await verifyAccountIdentity(user, signal);
  return summaries;
}
