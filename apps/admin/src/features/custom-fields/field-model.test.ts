import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import { RequestLane } from "@/platform/api/request-lane";
import {
  canReadFields,
  createFieldBody,
  fieldBody,
  fieldReadError,
  groupBody,
  groupPath,
  workspaceKey,
  FieldInputError,
  FieldWriteGate,
  type FieldForm,
  type User,
} from "@/features/custom-fields/field-model";

const user: User = {
  userId: 7,
  account: "operator",
  nickname: "Operator",
  avatarUrl: null,
  roles: [{ roleKey: "business_custom", roleName: "Operator" }],
  menuTree: [],
  merchant: null,
  permissionKeys: [
    "management:portal:enter",
    "system:field:list",
    "system:field:create",
  ],
};
const values: FieldForm = {
  label: "  Label  ",
  fieldKey: "  lift_count  ",
  dataType: "integer",
  groupKey: "facilities",
  sortOrder: 0,
  required: false,
  searchable: false,
  filterable: false,
  sortable: false,
  isPublic: true,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const apiError = (status: number) =>
  new ApiError("private error", { status, code: status, traceId: "test" });
function setup(current: User = user) {
  const verify = vi.fn(async () => current),
    busy = vi.fn(),
    write = vi.fn(async () => undefined),
    committed = vi.fn();
  const gate = new FieldWriteGate(user, verify, busy);
  gate.activate();
  return {
    gate,
    verify,
    busy,
    write,
    committed,
    run: () =>
      gate.run(
        "system:field:create",
        async () => ({ id: 1 }),
        write,
        committed,
      ),
  };
}

describe("field DTO serialization", () => {
  it.each(["1e999", '{"min":1e999}'])(
    "rejects overflow JSON %s instead of silently serializing it as null",
    (text) => {
      expect(() =>
        fieldBody({ ...values, defaultValueText: text }, false),
      ).toThrow(FieldInputError);
    },
  );
  it.each(["0", "false", '""', "[]", '["ski"]', "null"])(
    "preserves JSON default %s through the wire",
    (text) => {
      expect(
        JSON.parse(
          JSON.stringify(
            fieldBody({ ...values, defaultValueText: text }, false),
          ),
        ).defaultValue,
      ).toEqual(JSON.parse(text));
    },
  );
  it("clears edited default, validation and dictionary with explicit null", () => {
    const body = JSON.parse(
      JSON.stringify(
        fieldBody(
          {
            ...values,
            defaultValueText: "  ",
            validationText: "",
            optionsDictType: " ",
          },
          false,
        ),
      ),
    );
    expect(body).toMatchObject({
      defaultValue: null,
      validation: null,
      optionsDictType: null,
    });
    expect(body).not.toHaveProperty("isPublic");
  });
  it("whitelists DTO keys and keeps immutable field identity out of updates", () => {
    const body = fieldBody(
      {
        ...values,
        entityType: "article",
        status: "active",
        expectedSchemaVersion: 999,
      } as FieldForm,
      false,
    );
    expect(body).toEqual({
      label: "Label",
      groupKey: "facilities",
      sortOrder: 0,
      required: false,
      defaultValue: null,
      validation: null,
      optionsDictType: null,
      searchable: false,
      filterable: false,
      sortable: false,
    });
  });
  it("creates from the selected entity and protects public defaults for custom roles", () => {
    expect(createFieldBody(values, "ski_resort", false)).toMatchObject({
      entityType: "ski_resort",
      fieldKey: "lift_count",
      dataType: "integer",
      isPublic: false,
    });
    expect(createFieldBody(values, "article", true).isPublic).toBe(true);
    expect(fieldBody({ ...values, isPublic: false }, true).isPublic).toBe(
      false,
    );
  });
  it.each(["[]", "false", "42", '"text"'])(
    "rejects non-object validation %s before a request",
    (text) => {
      expect(() =>
        fieldBody({ ...values, validationText: text }, true),
      ).toThrow(FieldInputError);
    },
  );
  it("accepts object validation and trims dictionary keys", () => {
    expect(
      fieldBody(
        {
          ...values,
          validationText: '{"min":0}',
          optionsDictType: " ski.level ",
        },
        false,
      ),
    ).toMatchObject({ validation: { min: 0 }, optionsDictType: "ski.level" });
  });
  it.each(["defaultValueText", "validationText"] as const)(
    "rejects malformed JSON in %s",
    (key) => {
      expect(() => fieldBody({ ...values, [key]: "{" }, false)).toThrow(
        "不是有效 JSON",
      );
    },
  );
  it("sends only editable group metadata and encodes its composite path", () => {
    expect(
      groupBody({ label: " Label ", sortOrder: 0, groupKey: "immutable" }),
    ).toEqual({ label: "Label", sortOrder: 0 });
    expect(groupPath("article", "a/b")).toBe(
      "/admin/custom-field-groups/article/a%2Fb",
    );
  });
});

describe("field identity and errors", () => {
  it("uses grants for custom roles and does not require group-list to read fields", () => {
    expect(canReadFields(user)).toBe(true);
    expect(
      canReadFields({ ...user, permissionKeys: ["system:field:list"] }),
    ).toBe(false);
  });
  it("isolates accounts, entity and public-field capability, independent of grant order", () => {
    const key = workspaceKey(user, "article");
    expect(
      workspaceKey(
        { ...user, permissionKeys: [...user.permissionKeys].reverse() },
        "article",
      ),
    ).toBe(key);
    expect(workspaceKey({ ...user, userId: 8 }, "article")).not.toBe(key);
    expect(workspaceKey(user, "ski_resort")).not.toBe(key);
    expect(
      workspaceKey(
        { ...user, roles: [{ roleKey: "system_admin", roleName: "Admin" }] },
        "article",
      ),
    ).not.toBe(key);
  });
  it("redacts provider errors and distinguishes independent group failures", () => {
    expect(fieldReadError(apiError(403), true)).toBe(
      "当前账号无权读取字段分组",
    );
    expect(fieldReadError(apiError(404))).toContain("已不存在");
    expect(fieldReadError(new Error("private error"))).not.toContain("private");
  });
});

describe("field request lanes", () => {
  it.each(["resolve", "reject"] as const)(
    "ignores late %s and finally while a newer query is loading",
    async (result) => {
      const lane = new RequestLane(),
        old = deferred<number>(),
        current = deferred<number>();
      const publish = vi.fn(),
        fail = vi.fn(),
        settled = vi.fn();
      const first = lane.run(() => old.promise, publish, fail, settled);
      const second = lane.run(() => current.promise, publish, fail, settled);
      if (result === "resolve") old.resolve(1);
      else old.reject(new Error("late"));
      expect(await first).toBe(false);
      expect(publish).not.toHaveBeenCalled();
      expect(fail).not.toHaveBeenCalled();
      expect(settled).not.toHaveBeenCalled();
      current.resolve(2);
      expect(await second).toBe(true);
      expect(publish).toHaveBeenCalledExactlyOnceWith(2);
      expect(settled).toHaveBeenCalledOnce();
    },
  );
  it("isolates field failure from group success and cancels unmounted details", async () => {
    const fields = new RequestLane(),
      groups = new RequestLane(),
      details = new RequestLane();
    const failed = vi.fn(),
      publish = vi.fn(),
      settled = vi.fn(),
      pending = deferred<number>();
    const detail = details.run(() => pending.promise, publish, failed, settled);
    details.cancel();
    await fields.run(
      async () => {
        throw apiError(403);
      },
      vi.fn(),
      failed,
      vi.fn(),
    );
    await groups.run(async () => ["group"], publish, vi.fn(), vi.fn());
    pending.resolve(3);
    expect(await detail).toBe(false);
    expect(failed).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledExactlyOnceWith(["group"]);
    expect(settled).not.toHaveBeenCalled();
  });
});

describe("field writes", () => {
  it("locks before async form validation so two immediate submissions send once", async () => {
    const s = setup(),
      prepared = deferred<{ id: number }>(),
      prepare = vi.fn(() => prepared.promise);
    const first = s.gate.run(
      "system:field:create",
      prepare,
      s.write,
      s.committed,
    );
    const second = await s.gate.run(
      "system:field:create",
      prepare,
      s.write,
      s.committed,
    );
    expect(second.status).toBe("ignored");
    expect(prepare).toHaveBeenCalledOnce();
    expect(s.busy).toHaveBeenCalledWith(true);
    prepared.resolve({ id: 1 });
    expect((await first).status).toBe("success");
    expect(s.verify).toHaveBeenCalledOnce();
    expect(s.write).toHaveBeenCalledOnce();
    expect(s.committed).toHaveBeenCalledOnce();
  });
  it.each([
    "management:portal:enter",
    "system:field:list",
    "system:field:create",
  ])("rechecks revoked %s before any write", async (permission) => {
    const s = setup({
      ...user,
      permissionKeys: user.permissionKeys.filter((p) => p !== permission),
    });
    expect(await s.run()).toMatchObject({ status: "error", uncertain: false });
    expect(s.write).not.toHaveBeenCalled();
  });
  it("rejects an account switch despite equivalent grants", async () => {
    const s = setup({ ...user, userId: 8 });
    expect((await s.run()).status).toBe("error");
    expect(s.write).not.toHaveBeenCalled();
  });
  it("does not submit public-field values after the built-in admin capability changes", async () => {
    const admin = {
      ...user,
      roles: [{ roleKey: "system_admin", roleName: "Admin" }],
    };
    const write = vi.fn();
    const gate = new FieldWriteGate(admin, async () => user, vi.fn());
    gate.activate();
    expect(
      (await gate.run("system:field:create", async () => 1, write, vi.fn()))
        .status,
    ).toBe("error");
    expect(write).not.toHaveBeenCalled();
  });
  it("does not verify or write an invalid form or invalid JSON, and releases the lock", async () => {
    const s = setup();
    expect(
      (
        await s.gate.run(
          "system:field:create",
          async () => null,
          s.write,
          s.committed,
        )
      ).status,
    ).toBe("ignored");
    const bad = await s.gate.run(
      "system:field:create",
      async () => fieldBody({ ...values, defaultValueText: "{" }, false),
      s.write,
      s.committed,
    );
    expect(bad).toMatchObject({ status: "error", uncertain: false });
    expect(s.verify).not.toHaveBeenCalled();
    expect(s.write).not.toHaveBeenCalled();
    expect((await s.run()).status).toBe("success");
  });
  it.each([400, 401, 403, 404, 409, 429])(
    "does not block review after definitive HTTP %i",
    async (status) => {
      const s = setup();
      s.write.mockRejectedValueOnce(apiError(status));
      expect(await s.run()).toMatchObject({
        status: "error",
        uncertain: false,
      });
      expect((await s.run()).status).toBe("success");
    },
  );
  it.each([apiError(408), apiError(500), new TypeError("network lost")])(
    "blocks automatic repeat after an unknown result",
    async (cause) => {
      const s = setup();
      s.write.mockRejectedValueOnce(cause);
      expect(await s.run()).toMatchObject({ status: "error", uncertain: true });
      expect((await s.run()).status).toBe("ignored");
      expect(s.write).toHaveBeenCalledOnce();
      s.gate.acknowledgeReview();
      expect((await s.run()).status).toBe("success");
    },
  );
  it("does not classify failed identity verification as an attempted mutation", async () => {
    const s = setup();
    s.verify.mockRejectedValueOnce(new TypeError("network"));
    expect(await s.run()).toMatchObject({ status: "error", uncertain: false });
    expect(s.write).not.toHaveBeenCalled();
  });
  it("cancels a prepared write when the account/entity workspace is disposed", async () => {
    const s = setup(),
      prepared = deferred<number>();
    const task = s.gate.run(
      "system:field:create",
      () => prepared.promise,
      s.write,
      s.committed,
    );
    s.gate.dispose();
    prepared.resolve(1);
    expect((await task).status).toBe("ignored");
    expect(s.verify).not.toHaveBeenCalled();
    expect(s.write).not.toHaveBeenCalled();
  });
  it("suppresses late committed UI updates and can reactivate after StrictMode cleanup", async () => {
    const s = setup(),
      write = deferred<undefined>();
    s.write.mockImplementationOnce(() => write.promise);
    const task = s.run();
    await vi.waitFor(() => expect(s.write).toHaveBeenCalledOnce());
    s.gate.dispose();
    s.gate.activate();
    write.resolve(undefined);
    expect((await task).status).toBe("ignored");
    expect(s.committed).not.toHaveBeenCalled();
    expect((await s.run()).status).toBe("success");
  });
});
