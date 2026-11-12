import { describe, expect, it } from "vitest";
import {
  makeQuery,
  parseCatalogFields,
  parseCatalogPage,
  type QueryField,
} from "@/features/catalog/catalog-model";
const fields: QueryField[] = [
  {
    key: "price",
    label: "价格",
    dataType: "integer",
    filterable: true,
    searchable: false,
    sortable: true,
  },
  {
    key: "custom.indoor",
    label: "室内",
    dataType: "boolean",
    filterable: true,
    searchable: false,
    sortable: true,
  },
];
describe("public field query form", () => {
  it("converts numbers and false to typed query scalars", () => {
    expect(
      makeQuery(
        fields,
        [
          { field: "price", op: "lte", text: "200" },
          { field: "custom.indoor", op: "eq", text: "false" },
        ],
        1,
        "price",
        "asc",
      ),
    ).toEqual({
      page: 1,
      pageSize: 20,
      filters: [
        { field: "price", op: "lte", value: 200 },
        { field: "custom.indoor", op: "eq", value: false },
      ],
      sort: { field: "price", direction: "asc" },
    });
  });
  it.each(["", "not-a-number", "Infinity", "1.5"])(
    "rejects invalid integer %s",
    (text) =>
      expect(() =>
        makeQuery(fields, [{ field: "price", op: "eq", text }], 1, "", "asc"),
      ).toThrow(),
  );
  it("rejects unavailable fields and operations", () => {
    expect(() =>
      makeQuery(
        fields,
        [{ field: "contact", op: "eq", text: "x" }],
        1,
        "",
        "asc",
      ),
    ).toThrow();
    expect(() =>
      makeQuery(
        fields,
        [{ field: "price", op: "contains", text: "1" }],
        1,
        "",
        "asc",
      ),
    ).toThrow();
  });
  it("rejects duplicate catalog keys and malformed select options", () => {
    expect(() => parseCatalogFields([...fields, fields[0]])).toThrow();
    expect(() =>
      parseCatalogFields([{ ...fields[0], options: [null] }]),
    ).toThrow();
  });
  it("rejects wrong result page and duplicate IDs", () => {
    const row = { id: 1, title: "雪场", fields: {}, customFields: {} },
      page = {
        page: 1,
        pageSize: 20,
        total: 2,
        asOf: "2026-11-05T00:00:00.000Z",
        items: [row, row],
      };
    expect(() => parseCatalogPage(page, 1)).toThrow();
    expect(() => parseCatalogPage({ ...page, items: [row] }, 2)).toThrow();
  });
});
