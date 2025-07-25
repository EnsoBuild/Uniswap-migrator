import { useEffect } from "react";
import {
  ChakraProvider,
  createSystem,
  defaultConfig,
  Center,
} from "@chakra-ui/react";
import { Essential } from "../components/Essential";
import { setApiKey } from "../util/enso";
import { Toaster } from "./ui/toaster";
import { WidgetProps } from "../types";

/**
 * ChakraUI wrapper component
 *
 * Use this to wrap widget components in your application
 */
export const WidgetWrapper = ({
  apiKey,
  outChainId,
  outTokens,
  poolFeeGrade,
  ticks,
}: { apiKey: string } & WidgetProps) => {
  useEffect(() => {
    if (apiKey) {
      setApiKey(apiKey);
    }
  }, [apiKey]);

  return (
    <ChakraProvider value={createSystem(defaultConfig)}>
      <Center>
        <div
          style={{
            borderRadius: "10px",
            width: "fit-content",
            background:
              "linear-gradient(-45deg, rgba(238, 119, 82, 0.1), rgba(231, 60, 126, 0.1), rgba(35, 166, 213, 0.1), rgba(35, 213, 171, 0.1))",
            backgroundSize: "400% 400%",
            animation: "gradient 15s ease infinite",
          }}
        >
          <style>
            {`
            @keyframes gradient {
              0% { background-position: 0% 50%; }
              50% { background-position: 100% 50%; }
              100% { background-position: 0% 50%; }
            }
          `}
          </style>
          <Essential
            outChainId={outChainId}
            outTokens={outTokens}
            poolFeeGrade={poolFeeGrade}
            ticks={ticks}
          />
        </div>
      </Center>
      <Toaster />
    </ChakraProvider>
  );
};
