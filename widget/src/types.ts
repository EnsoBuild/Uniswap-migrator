import { Address } from "viem";

export type WidgetProps = {
  adaptive?: boolean;
  tokenOut?: Address;
  tokenIn?: Address;
  obligateSelection?: boolean;
  enableShare?: boolean;
  indicateRoute?: boolean;
  rotateObligated?: boolean | ObligatedToken;
  outProtocol?: string;
};

export enum NotifyType {
  Success = "success",
  Error = "error",
  Info = "info",
  Loading = "loading",
  Warning = "warning",
  Blocked = "blocked",
}

export enum ObligatedToken {
  TokenIn,
  TokenOut,
}
