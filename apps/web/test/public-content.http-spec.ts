import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiError, createApiClient } from "@common/api-contracts/client";
import {
  readPublicDetail,
  readPublicComments,
} from "@/features/public-content/public-detail";
import { publicDetailMetadata } from "@/features/public-content/public-metadata";
import { getApiBaseUrl } from "@/platform/config";

// This suite is opt-in. It has no backend/DB imports and starts no services.
const api = new URL(getApiBaseUrl());
const fixture = JSON.parse(
  process.env.PUBLIC_CONTENT_HTTP_FIXTURE_JSON ?? "null",
) as {
  databaseName: string;
  resortIds: number[];
  articleIds: number[];
  dynamicIds: number[];
  commentIds: number[];
};
if (
  api.protocol !== "http:" ||
  api.hostname !== "127.0.0.1" ||
  api.pathname !== "/api/v1" ||
  api.username ||
  api.password ||
  api.search ||
  api.hash ||
  fixture?.databaseName !== "linji_public_content_validation" ||
  ![
    fixture.resortIds,
    fixture.articleIds,
    fixture.dynamicIds,
    fixture.commentIds,
  ].every(
    (ids) =>
      Array.isArray(ids) &&
      ids.length > 0 &&
      ids.every((id) => Number.isSafeInteger(id) && id > 0),
  )
)
  throw new Error(
    "Explicit disposable loopback public-content API/fixture required",
  );
const client = createApiClient(api.href, { credentials: "omit" });
let accessToken: string | undefined, refreshToken: string | undefined;
const signal = () => AbortSignal.timeout(10000);
const authed = () => ({ Authorization: `Bearer ${accessToken}` });
beforeAll(async () => {
  const password = `Public-${randomUUID()}`;
  await client.request("/auth/register", {
    method: "POST",
    body: { account: "public-http-reader", password, nickname: "联调用户" },
    signal: signal(),
  });
  const session = await client.request<{
    accessToken: string;
    refreshToken: string;
  }>("/auth/login", {
    method: "POST",
    body: { account: "public-http-reader", password },
    signal: signal(),
  });
  expect(session.accessToken).toBeTruthy();
  expect(session.refreshToken).toBeTruthy();
  accessToken = session.accessToken;
  refreshToken = session.refreshToken;
  for (const [targetType, targetId] of [
    ["resort", fixture.resortIds[0]],
    ["article", fixture.articleIds[0]],
  ] as const)
    await client.request("/me/favorites", {
      method: "PUT",
      body: { targetType, targetId },
      headers: authed(),
      signal: signal(),
    });
});
afterAll(async () => {
  if (refreshToken)
    await client.request("/auth/logout", {
      method: "POST",
      body: { refreshToken },
      headers: authed(),
      signal: signal(),
    });
  accessToken = undefined;
  refreshToken = undefined;
});
function signed(url: string | null) {
  expect(url).toBeTruthy();
  const image = new URL(url!);
  expect(image.hostname).toBe("127.0.0.1");
  expect(image.searchParams.get("X-Amz-Expires")).toBe("900");
  expect(image.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
}
describe("public Web production readers / compiled Nest / PostgreSQL", () => {
  it("accepts the real resort VO with zero coordinates/prices/ratings, nulls and ordered signed gallery", async () => {
    const resort = await readPublicDetail(
      "resort",
      String(fixture.resortIds[0]),
    );
    expect(resort).toMatchObject({
      name: "公开联调雪场 0",
      startingPrice: "0",
      rating: 0,
      ratingCount: 0,
      latitude: 0,
      longitude: 0,
      address: null,
      favoriteByMe: false,
      officialUrl: "https://example.com/snow",
      snowCondition: { value: "powder", label: "powder", verifiedAt: null },
    });
    expect(resort.galleryUrls).toHaveLength(2);
    signed(resort.coverUrl);
    resort.galleryUrls.forEach(signed);
    expect(new URL(resort.galleryUrls[0]!).pathname).toContain("image-1.webp");
    expect(new URL(resort.galleryUrls[1]!).pathname).toContain("image-2.webp");
    expect(resort.description).toContain("<script>文本</script>");
  });
  it("keeps public field zero/false and excludes internal merchant and field data on the raw wire", async () => {
    const raw = await client.request<Record<string, unknown>>(
      `/resorts/${fixture.resortIds[0]}`,
      { signal: signal() },
    );
    expect(raw.customFields).toEqual([
      { fieldKey: "public_zero", label: "public_zero", value: 0 },
      { fieldKey: "public_false", label: "public_false", value: false },
    ]);
    const wire = JSON.stringify(raw);
    for (const hidden of [
      "private-contact-marker",
      "private-field-marker",
      "merchantId",
      "internal_note",
    ])
      expect(wire).not.toContain(hidden);
    expect(
      (await readPublicDetail("resort", String(fixture.resortIds[0])))
        .customFields,
    ).toEqual(raw.customFields);
  });
  it("accepts a real published article with nullable author, body text and signed cover", async () => {
    const article = await readPublicDetail(
      "article",
      String(fixture.articleIds[0]),
    );
    expect(article).toMatchObject({
      title: "公开联调知识 0",
      summary: "滑雪知识摘要",
      body: "滑雪知识完整正文 <b>保持文本</b>",
      authorName: null,
      category: { value: "public-http", label: "public-http" },
      favoriteByMe: false,
    });
    signed(article.coverUrl);
    const raw = await client.request<Record<string, unknown>>(
      `/articles/${fixture.articleIds[0]}`,
      { signal: signal() },
    );
    expect(JSON.stringify(raw)).not.toContain("private-article-marker");
  });
  it("accepts a real dynamic including safe author, two signed images and the public comment count", async () => {
    const dynamic = await readPublicDetail(
      "dynamic",
      String(fixture.dynamicIds[0]),
    );
    expect(dynamic).toMatchObject({
      content: "公开联调动态完整正文 0",
      imageCount: 2,
      commentCount: 21,
      likedByMe: false,
      status: "published",
      resort: { resortId: fixture.resortIds[0] },
    });
    expect(dynamic.author.nickname.length).toBeGreaterThan(0);
    expect(dynamic.imageUrls).toHaveLength(2);
    dynamic.imageUrls.forEach(signed);
    expect(
      JSON.stringify(
        await client.request(`/dynamics/${fixture.dynamicIds[0]}`, {
          signal: signal(),
        }),
      ),
    ).not.toContain("private-dynamic-marker");
  });
  it("reads 20+1 visible comments in stable timestamp/ID order and an empty third page", async () => {
    const id = String(fixture.dynamicIds[0]);
    const a = await readPublicComments(id, 1),
      b = await readPublicComments(id, 2),
      c = await readPublicComments(id, 3);
    expect(a).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 21,
      hasNext: true,
    });
    expect(b).toMatchObject({ page: 2, total: 21, hasNext: false });
    expect(a.items).toHaveLength(20);
    expect(b.items).toHaveLength(1);
    expect(c.items).toEqual([]);
    expect([...a.items, ...b.items].map((row) => row.commentId)).toEqual(
      [...fixture.commentIds].reverse(),
    );
    expect(JSON.stringify([a, b, c])).not.toContain("private-comment-marker");
    expect(
      [...a.items, ...b.items].every((row) => row.status === "visible"),
    ).toBe(true);
  });
  it("preserves actual HTTP404 for unpublished/deleted/inactive-category resources and hidden dynamic comments", async () => {
    for (const [kind, ids] of [
      ["resort", fixture.resortIds],
      ["article", fixture.articleIds],
      ["dynamic", fixture.dynamicIds],
    ] as const)
      for (const id of ids.slice(1))
        await expect(readPublicDetail(kind, String(id))).rejects.toMatchObject({
          name: "ApiError",
          status: 404,
        });
    for (const id of fixture.dynamicIds.slice(1))
      await expect(readPublicComments(String(id), 1)).rejects.toMatchObject({
        name: ApiError.name,
        status: 404,
      });
  });
  it("keeps anonymous reads separate from a real account's persisted favorite projection", async () => {
    for (const [kind, path, id] of [
      ["resort", "resorts", fixture.resortIds[0]],
      ["article", "articles", fixture.articleIds[0]],
    ] as const) {
      const personal = await client.request<{ favoriteByMe: boolean }>(
        `/${path}/${id}`,
        { headers: authed(), signal: signal() },
      );
      expect(personal.favoriteByMe).toBe(true);
      expect((await readPublicDetail(kind, String(id))).favoriteByMe).toBe(
        false,
      );
    }
  });
  it("builds successful sharing metadata using real public HTTP content without signed images", async () => {
    for (const [kind, id] of [
      ["resort", fixture.resortIds[0]],
      ["article", fixture.articleIds[0]],
      ["dynamic", fixture.dynamicIds[0]],
    ] as const) {
      const metadata = await publicDetailMetadata(kind, String(id));
      expect(metadata.robots).toEqual({ index: true, follow: true });
      expect(metadata.title).not.toContain("暂时无法加载");
      expect(metadata.openGraph).toMatchObject({ images: [] });
      expect(JSON.stringify(metadata)).not.toContain("X-Amz-Signature");
    }
  });
});
