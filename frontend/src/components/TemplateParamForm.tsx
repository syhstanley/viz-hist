"use client";

import React from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import type { TemplateParamDef } from "@/lib/templates";

// ── Error display ──

export function TemplateError({ error }: { error: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-4">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <p className="text-sm font-medium text-destructive">Template error</p>
      <pre className="max-h-32 max-w-full overflow-auto text-xs text-muted-foreground whitespace-pre-wrap">
        {error}
      </pre>
      <Link href="/templates" className="text-xs text-primary hover:underline">
        Edit templates →
      </Link>
    </div>
  );
}

// ── Error boundary: a rendering crash inside Plotly / template output only
//    kills the chart it wraps, never the page ──

export class ChartErrorBoundary extends React.Component<
  { resetKey: string; children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) return <TemplateError error={`Chart crashed: ${this.state.error}`} />;
    return this.props.children;
  }
}

// ── Single param control (auto-generated from a template's param def) ──

export interface VersionOption {
  id: number;
  label: string;
}

export function ParamControl({
  def, value, versions, columns, onChange,
}: {
  def: TemplateParamDef;
  value: unknown;
  versions: VersionOption[];
  columns: string[];
  onChange: (v: unknown) => void;
}) {
  const label = def.label || def.key;
  const type = def.type || "string";

  if (type === "boolean") {
    return (
      <label className="flex items-center gap-2 cursor-pointer pt-6">
        <Checkbox checked={Boolean(value)} onCheckedChange={(c) => onChange(c === true)} />
        <span className="text-sm">{label}</span>
      </label>
    );
  }

  if (type === "number") {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm">{label}</Label>
        <Input
          type="number"
          step="any"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange(isNaN(n) ? undefined : n);
          }}
          className="h-9"
        />
      </div>
    );
  }

  if (type === "column" || type === "version" || type === "select") {
    const options: { value: string; label: string }[] =
      type === "column"
        ? columns.map((c) => ({ value: c, label: c }))
        : type === "version"
          ? versions.map((v) => ({ value: String(v.id), label: v.label }))
          : (def.options || []).map((o) => ({ value: String(o), label: String(o) }));
    const current = value === undefined || value === null ? undefined : String(value);
    return (
      <div className="space-y-1.5">
        <Label className="text-sm">{label}</Label>
        <Select
          value={current}
          onValueChange={(v) => {
            if (!v) return;
            onChange(type === "version" ? Number(v) : v);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select...">
              {type === "version" && current
                ? versions.find((ver) => String(ver.id) === current)?.label
                : current}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // default: string
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="h-9"
      />
    </div>
  );
}
