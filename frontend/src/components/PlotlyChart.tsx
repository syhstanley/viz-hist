"use client";

import dynamic from "next/dynamic";
import type { PlotParams } from "react-plotly.js";

// Plotly doesn't work with SSR - must be dynamically imported
const Plot = dynamic(
  () =>
    import("react-plotly.js").then(() => {
      // Use the minified plotly bundle
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Plotly = require("plotly.js-dist-min");
      const createPlotlyComponent =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("react-plotly.js/factory").default;
      return createPlotlyComponent(Plotly);
    }),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading chart...
      </div>
    ),
  }
) as React.ComponentType<PlotParams>;

export default Plot;
