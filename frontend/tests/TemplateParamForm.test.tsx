import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ParamControl,
  TemplateError,
  ChartErrorBoundary,
} from "@/components/TemplateParamForm";

describe("TemplateError", () => {
  it("shows the error message and a link to the editor", () => {
    render(<TemplateError error="something exploded" />);
    expect(screen.getByText("Template error")).toBeInTheDocument();
    expect(screen.getByText("something exploded")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/templates");
  });
});

describe("ChartErrorBoundary", () => {
  function Bomb(): React.ReactNode {
    throw new Error("kaboom");
  }

  it("catches child render crashes and shows error instead", () => {
    // silence expected React error logging
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ChartErrorBoundary resetKey="a">
        <Bomb />
      </ChartErrorBoundary>
    );
    expect(screen.getByText(/Chart crashed: kaboom/)).toBeInTheDocument();
    spy.mockRestore();
  });

  it("renders children normally when nothing throws", () => {
    render(
      <ChartErrorBoundary resetKey="a">
        <div>healthy chart</div>
      </ChartErrorBoundary>
    );
    expect(screen.getByText("healthy chart")).toBeInTheDocument();
  });
});

describe("ParamControl", () => {
  const noVersions: { id: number; label: string }[] = [];

  it("string param renders input and propagates changes", () => {
    const onChange = vi.fn();
    render(
      <ParamControl
        def={{ key: "title", label: "Title", type: "string" }}
        value="hello"
        versions={noVersions}
        columns={[]}
        onChange={onChange}
      />
    );
    const input = screen.getByRole("textbox");
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(input).toHaveValue("hello");
    fireEvent.change(input, { target: { value: "world" } });
    expect(onChange).toHaveBeenCalledWith("world");
  });

  it("number param coerces to number", () => {
    const onChange = vi.fn();
    render(
      <ParamControl
        def={{ key: "bins", label: "Bins", type: "number" }}
        value={30}
        versions={noVersions}
        columns={[]}
        onChange={onChange}
      />
    );
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "42" } });
    expect(onChange).toHaveBeenCalledWith(42);
  });

  it("boolean param renders checkbox and toggles", () => {
    const onChange = vi.fn();
    render(
      <ParamControl
        def={{ key: "norm", label: "Normalize", type: "boolean" }}
        value={false}
        versions={noVersions}
        columns={[]}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("falls back to key when label missing", () => {
    render(
      <ParamControl
        def={{ key: "raw_key" }}
        value=""
        versions={noVersions}
        columns={[]}
        onChange={() => {}}
      />
    );
    expect(screen.getByText("raw_key")).toBeInTheDocument();
  });

  it("column param renders a select with column options", () => {
    render(
      <ParamControl
        def={{ key: "col", label: "Column", type: "column" }}
        value="a"
        versions={noVersions}
        columns={["a", "b"]}
        onChange={() => {}}
      />
    );
    // Radix Select renders a combobox trigger showing the current value
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText("a")).toBeInTheDocument();
  });
});
