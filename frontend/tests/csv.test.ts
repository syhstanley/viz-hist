import { describe, expect, it } from "vitest";
import { parseCSV } from "@/lib/csv";

describe("parseCSV", () => {
  it("parses a simple csv with numeric coercion", () => {
    const r = parseCSV("date,value\n2024-01-01,1.5\n2024-01-02,2\n");
    expect(r.columns).toEqual(["date", "value"]);
    expect(r.rows).toEqual([
      { date: "2024-01-01", value: 1.5 },
      { date: "2024-01-02", value: 2 },
    ]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    const r = parseCSV('name,note\n"Doe, John","said ""hi"""\n');
    expect(r.rows[0]).toEqual({ name: "Doe, John", note: 'said "hi"' });
  });

  it("handles CRLF and missing trailing newline", () => {
    const r = parseCSV("a,b\r\n1,2\r\n3,4");
    expect(r.rows).toEqual([{ a: 1, b: 2 }, { a: 3, b: 4 }]);
  });

  it("empty fields become null, short rows padded", () => {
    const r = parseCSV("a,b,c\n1,,3\n4,5\n");
    expect(r.rows[0]).toEqual({ a: 1, b: null, c: 3 });
    expect(r.rows[1]).toEqual({ a: 4, b: 5, c: null });
  });

  it("scientific notation and negatives are numeric", () => {
    const r = parseCSV("x\n-1.5e3\n.5\n");
    expect(r.rows.map((row) => row.x)).toEqual([-1500, 0.5]);
  });

  it("non-numeric strings stay strings", () => {
    const r = parseCSV("x\n1a\nNaN-ish\n");
    expect(r.rows.map((row) => row.x)).toEqual(["1a", "NaN-ish"]);
  });

  it("empty input returns empty result", () => {
    expect(parseCSV("")).toEqual({ columns: [], rows: [] });
    expect(parseCSV("\n\n")).toEqual({ columns: [], rows: [] });
  });
});
