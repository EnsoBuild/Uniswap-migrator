<div align="center">

[![NPM Version](https://img.shields.io/npm/v/%40ensofinance%2Funiswap-migrator)](https://www.npmjs.com/package/%40ensofinance%2Funiswap-migrator)
[![X (formerly Twitter) Follow](https://img.shields.io/twitter/follow/EnsoBuild)](https://twitter.com/EnsoBuild)

</div>

# Uniswap Migrator

The Uniswap Migrator is a tool that helps users easily migrate their existing Uniswap v3 position or deposit any token into Uniswap v4 pool

## Workspace Structure

- `app/`: Main application that uses the widget
- `widget/`: Reusable Uniswap migrator widget

## Installation

To install the widget in your project using npm:

```bash
npm install @ensofinance/uniswap-migrator
```

## Usage

Get your key at [Enso Dashboard](https://shortcuts.enso.finance/developers)

Here's a basic example of how to use the widget in your React application:

```jsx
import { WidgetWrapper } from "@ensofinance/uniswap-migrator";

/*
 * for next Next.js projects we need to use dynamic import instead
import dynamic from "next/dynamic";
const WidgetWrapper= dynamic(() => import("@ensofinance/uniswap-migrator").then(mod => mod.WidgetWrapper), {
    ssr: false,
}); 
*/

function App() {
  return (
    <div>
      <h1>My DeFi App</h1>
      <WidgetWrapper apiKey={ensoKey} />
    </div>
  );
}

export default App;
```

## Development

- To work on the widget: `pnpm --filter widget build --watch`
- To run the app: `pnpm dev`
