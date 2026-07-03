/**
 * Minimal CSV parser for template previews (client-side only).
 * Handles quoted fields, escaped quotes (""), CRLF, and coerces numeric
 * values so previews behave like real backend data.
 */

export interface ParsedCSV {
  columns: string[];
  rows: Record<string, unknown>[];
}

const NUMERIC_RE = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function coerce(field: string): unknown {
  if (field === "") return null;
  if (NUMERIC_RE.test(field)) return Number(field);
  return field;
}

/** Split CSV text into a 2-D array of string fields. */
function tokenize(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => { record.push(field); field = ""; };
  const endRecord = () => { endField(); records.push(record); record = []; };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ",") { endField(); i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { endRecord(); i++; continue; }
    field += ch;
    i++;
  }
  // trailing field/record (no final newline)
  if (field !== "" || record.length > 0) endRecord();
  return records;
}

export function parseCSV(text: string): ParsedCSV {
  const recs = tokenize(text).filter((r) => !(r.length === 1 && r[0] === ""));
  if (recs.length === 0) return { columns: [], rows: [] };

  const columns = recs[0].map((c) => c.trim());
  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r < recs.length; r++) {
    const row: Record<string, unknown> = {};
    for (let c = 0; c < columns.length; c++) {
      row[columns[c]] = coerce(recs[r][c] ?? "");
    }
    rows.push(row);
  }
  return { columns, rows };
}
