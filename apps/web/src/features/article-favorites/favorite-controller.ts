import type { ApiClient } from "@common/api-contracts/client";

type Request = ApiClient["request"];
export type FavoriteSnapshot = {
  values: Readonly<Record<number, boolean | null>>;
  busy: number | null;
  loading: boolean;
  error: string | null;
};

// One instance per page and account. No personal state is shared between SSR requests.
export class ArticleFavoriteController {
  private snapshot: FavoriteSnapshot;
  private listeners = new Set<() => void>();
  private alive = true;
  private generation = 0;
  private abort = new AbortController();
  constructor(
    private readonly request: Request,
    private readonly userId: number | null,
    private readonly path: string,
    ids: number[],
  ) {
    this.snapshot = {
      values: Object.fromEntries(
        ids.map((id) => [id, userId === null ? false : null]),
      ),
      busy: null,
      loading: userId !== null,
      error: null,
    };
  }
  getSnapshot = () => this.snapshot;
  activate() {
    this.alive = true;
    if (this.abort.signal.aborted) this.abort = new AbortController();
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  dispose() {
    this.alive = false;
    this.generation++;
    this.abort.abort();
  }
  private set(patch: Partial<FavoriteSnapshot>) {
    if (!this.alive) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private async verify() {
    const me = await this.request<{ userId: number }>("/auth/me", {
      cache: "no-store",
      signal: this.abort.signal,
    });
    if (!this.alive || me.userId !== this.userId)
      throw new Error("Account changed");
  }
  private async read() {
    await this.verify();
    const response = await this.request<{
      items?: { articleId: number; favoriteByMe: boolean }[];
      articleId?: number;
      favoriteByMe?: boolean;
    }>(this.path, { cache: "no-store", signal: this.abort.signal });
    const items = response.items ?? (response.articleId ? [response] : []);
    const values: Record<number, boolean | null> = Object.fromEntries(
      Object.keys(this.snapshot.values).map((id) => [id, null]),
    );
    for (const item of items) {
      if (
        item.articleId &&
        item.articleId in values &&
        typeof item.favoriteByMe === "boolean"
      )
        values[item.articleId] = item.favoriteByMe;
    }
    return values;
  }
  async load() {
    if (!this.alive || this.userId === null || this.snapshot.busy !== null)
      return;
    const generation = ++this.generation;
    this.set({ loading: true, error: null });
    try {
      const values = await this.read();
      if (generation === this.generation) this.set({ values, loading: false });
    } catch {
      if (generation === this.generation)
        this.set({
          loading: false,
          values: Object.fromEntries(
            Object.keys(this.snapshot.values).map((id) => [id, null]),
          ),
          error: "收藏状态无法确认，请重新登录或刷新状态。",
        });
    }
  }
  async toggle(id: number) {
    const before = this.snapshot.values[id];
    if (
      !this.alive ||
      !this.userId ||
      this.snapshot.loading ||
      this.snapshot.busy !== null ||
      typeof before !== "boolean"
    )
      return;
    ++this.generation;
    this.set({ busy: id, error: null });
    let writeFailed = false;
    try {
      await this.verify();
      if (!this.alive) return;
      await this.request(
        before ? `/me/favorites/article/${id}` : "/me/favorites",
        {
          method: before ? "DELETE" : "PUT",
          ...(before ? {} : { body: { targetType: "article", targetId: id } }),
          signal: this.abort.signal,
        },
      );
    } catch {
      writeFailed = true;
    }
    if (!this.alive) return;
    try {
      const values = await this.read();
      this.set({
        values,
        busy: null,
        error: writeFailed ? "请求未正常结束，已重新核对收藏状态。" : null,
      });
    } catch {
      this.set({
        busy: null,
        values: Object.fromEntries(
          Object.keys(this.snapshot.values).map((key) => [key, null]),
        ),
        error: "操作结果尚未确认，请刷新状态后继续。",
      });
    }
  }
}
