import { describe, it, expect } from "vitest";
import { parseLoadSubsetOptions } from "../load-subset-parser.js";
import type { LoadSubsetOptions } from "@tanstack/react-db";

type TestItem = {
  id: string;
  category: string;
  age: number;
  createdAt: string;
};

const ref = (path: string[]) => ({ type: "ref" as const, path, __returnType: undefined as any });
const val = (value: unknown) => ({ type: "val" as const, value, __returnType: undefined as any });
const func = (name: string, args: any[]) => ({
  type: "func" as const,
  name,
  args,
  __returnType: undefined as any,
});

describe("parseLoadSubsetOptions", () => {
  it("parses simple eq filter", () => {
    const options: LoadSubsetOptions = {
      where: func("eq", [ref(["items", "category"]), val("electronics")]),
    };

    const result = parseLoadSubsetOptions<TestItem>(options);

    expect(result.filters).toEqual({ category: { eq: "electronics" } });
    expect(result.sorts).toEqual([]);
    expect(result.limit).toBeUndefined();
    expect(result.offset).toBeUndefined();
  });

  it("parses and() with multiple filters", () => {
    const options: LoadSubsetOptions = {
      where: func("and", [
        func("eq", [ref(["items", "category"]), val("books")]),
        func("gt", [ref(["items", "age"]), val(18)]),
      ]),
    };

    const result = parseLoadSubsetOptions<TestItem>(options);

    expect(result.filters).toEqual({
      category: { eq: "books" },
      age: { gt: 18 },
    });
  });

  it("parses nested and() expressions", () => {
    const options: LoadSubsetOptions = {
      where: func("and", [
        func("and", [
          func("eq", [ref(["items", "category"]), val("books")]),
          func("gte", [ref(["items", "age"]), val(18)]),
        ]),
        func("lte", [ref(["items", "age"]), val(65)]),
      ]),
    };

    const result = parseLoadSubsetOptions<TestItem>(options);

    expect(result.filters).toEqual({
      category: { eq: "books" },
      age: { gte: 18, lte: 65 },
    });
  });

  it("parses orderBy with direction", () => {
    const options: LoadSubsetOptions = {
      orderBy: [
        {
          expression: ref(["items", "createdAt"]),
          compareOptions: { direction: "desc", nulls: "last" },
        },
      ],
    };

    const result = parseLoadSubsetOptions<TestItem>(options);

    expect(result.sorts).toEqual([
      { field: "createdAt", direction: "desc" },
    ]);
  });

  it("parses multiple orderBy clauses", () => {
    const options: LoadSubsetOptions = {
      orderBy: [
        {
          expression: ref(["items", "category"]),
          compareOptions: { direction: "asc", nulls: "last" },
        },
        {
          expression: ref(["items", "createdAt"]),
          compareOptions: { direction: "desc", nulls: "last" },
        },
      ],
    };

    const result = parseLoadSubsetOptions<TestItem>(options);

    expect(result.sorts).toEqual([
      { field: "category", direction: "asc" },
      { field: "createdAt", direction: "desc" },
    ]);
  });

  it("passes through limit and offset", () => {
    const options: LoadSubsetOptions = {
      limit: 50,
      offset: 10,
    };

    const result = parseLoadSubsetOptions<TestItem>(options);

    expect(result.limit).toBe(50);
    expect(result.offset).toBe(10);
    expect(result.filters).toEqual({});
    expect(result.sorts).toEqual([]);
  });

  it("handles missing where and orderBy", () => {
    const options: LoadSubsetOptions = {};

    const result = parseLoadSubsetOptions<TestItem>(options);

    expect(result.filters).toEqual({});
    expect(result.sorts).toEqual([]);
    expect(result.limit).toBeUndefined();
    expect(result.offset).toBeUndefined();
  });

  it("ignores or() expressions", () => {
    const options: LoadSubsetOptions = {
      where: func("or", [
        func("eq", [ref(["items", "category"]), val("books")]),
        func("eq", [ref(["items", "category"]), val("electronics")]),
      ]),
    };

    const result = parseLoadSubsetOptions<TestItem>(options);

    expect(result.filters).toEqual({});
  });

  it("parses in operator", () => {
    const options: LoadSubsetOptions = {
      where: func("in", [ref(["items", "category"]), val(["books", "electronics"])]),
    };

    const result = parseLoadSubsetOptions<TestItem>(options);

    expect(result.filters).toEqual({
      category: { in: ["books", "electronics"] },
    });
  });

  it("parses like operator", () => {
    const options: LoadSubsetOptions = {
      where: func("like", [ref(["items", "category"]), val("%book%")]),
    };

    const result = parseLoadSubsetOptions<TestItem>(options);

    expect(result.filters).toEqual({
      category: { like: "%book%" },
    });
  });
});
