import { Address } from "viem";
import { SupportedChainId } from "./constants";

export type WidgetProps = {
  outChainId?: SupportedChainId;
  outTokens?: [Address, Address];
  poolFeeGrade?: number;
  ticks?: [number, number];
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
