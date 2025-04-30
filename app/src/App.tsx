import { ConnectButton } from "@rainbow-me/rainbowkit";
import Providers from "./components/Providers";
import { WidgetWrapper } from "@ensofinance/uniswap-migrator";

// @ts-ignore
const ensoApiKey = import.meta.env.VITE_ENSO_API_KEY;

function App() {
  return (
    <Providers>
      <div style={{ width: "100%", height: "100%" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-around",
            padding: "8px",
          }}
        >
          <img
            src="/logo_black_white.png"
            alt="Enso"
            style={{ height: "50px" }}
          />

          <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
            <ConnectButton />
          </div>
        </div>

        <div
          style={{
            paddingTop: "50px",
          }}
        >
          <WidgetWrapper apiKey={ensoApiKey} />
        </div>
      </div>
    </Providers>
  );
}

export default App;
