import { Address } from "viem";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  EnsoClient,
  BundleAction,
  BundleParams,
  BundleActionType,
} from "@ensofinance/sdk";
import { isAddress } from "viem";
import {
  Token,
  usePriorityChainId,
  useCurrentChainTokenGetter,
} from "../util/common";
import { useSendEnsoTransaction } from "../util/wallet";
import {
  SupportedChainId,
  STARGATE_CHAIN_NAMES,
  NATIVE_ETH_CHAINS,
} from "../constants";

let ensoClient = new EnsoClient({
  // baseURL: "http://localhost:3000/api/v1",
  baseURL: "https://shortcuts-backend-dynamic-int.herokuapp.com/api/v1",
  // baseURL: "https://shortcuts-backend-dynamic-dev.herokuapp.com/api/v1",
  apiKey: "",
});

export const setApiKey = (apiKey: string) => {
  ensoClient = new EnsoClient({
    // baseURL: "http://localhost:3000/api/v1",
    baseURL: "https://shortcuts-backend-dynamic-int.herokuapp.com/api/v1",
    // baseURL: "https://shortcuts-backend-dynamic-dev.herokuapp.com/api/v1",
    apiKey,
  });
};

type AmountArg =
  | {
      useOutputOfCallAt: number;
    }
  | string;

const useStargatePools = () =>
  useQuery<
    {
      address: Address;
      chainKey: string;
      token: { address: Address; symbol: string };
    }[]
  >({
    queryKey: ["stargate-pools"],
    queryFn: () =>
      fetch("https://mainnet.stargate-api.com/v1/metadata?version=v2")
        .then((res) => res.json())
        .then(({ data }) => data.v2),
  });

const useStargateTokens = (chainId: SupportedChainId, tokenSymbol: string) => {
  const { data: stargatePools } = useStargatePools();
  const foundOccurrency = stargatePools?.find(
    (pool) =>
      pool.chainKey === STARGATE_CHAIN_NAMES[chainId] &&
      pool.token.symbol.includes(tokenSymbol)
  );

  let underyingToken = foundOccurrency?.token.address.toLowerCase();

  if (underyingToken === "0x0000000000000000000000000000000000000000") {
    underyingToken = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  }

  return [foundOccurrency?.address.toLowerCase() as Address, underyingToken];
};

export interface BridgeBundleParams {
  tokenIn: Address;
  tokenId?: string;
  tokenOut?: [Address, Address];
  receiver?: Address;
  chainId?: SupportedChainId;
  destinationChainId?: SupportedChainId;
  ticks?: [number, number];
  token0?: Address;
  token1?: Address;
  poolFee?: string;
  redeemTokens?: [Address, Address];
  liquidity?: string;
  amountIn?: string;
  slippageBps?: number;
  feeBps?: number;
}

const V4PositionManagers = {
  8453: "0x7c5f5a4bbd8fd63184577525326123b519429bdc",
  130: "0x4529a01c7a0410167c5740c487a8de60232617bf",
};

const useBridgeBundle = ({
  tokenIn,
  tokenId,
  tokenOut,
  receiver,
  chainId,
  destinationChainId,
  ticks,
  token0,
  token1,
  poolFee,
  liquidity,
  amountIn,
  slippageBps = 100,
  feeBps = 25,
}: BridgeBundleParams) => {
  const isSameChain = chainId === destinationChainId;
  let bundleActions: BundleAction[] = [];

  const tokenNameToBridge =
    NATIVE_ETH_CHAINS.includes(chainId!) &&
    NATIVE_ETH_CHAINS.includes(destinationChainId!)
      ? "ETH"
      : "USDC";
  const [sourcePool, sourceToken] = useStargateTokens(
    chainId!,
    tokenNameToBridge
  );
  const [, destinationToken] = useStargateTokens(
    destinationChainId!,
    tokenNameToBridge
  );

  // If source and destination chains are different, use bridge action
  if (!isSameChain) {
    let ensoFeeAmount: AmountArg = amountIn;
    let bridgeAmount: AmountArg = {
      useOutputOfCallAt: 0,
    };

    if (tokenIn !== sourceToken) {
      if (tokenId) {
        ensoFeeAmount = {
          useOutputOfCallAt: 1,
        };
        bridgeAmount = {
          useOutputOfCallAt: 3,
        };
        bundleActions.push({
          protocol: "uniswap-v3",
          // @ts-ignore
          action: "redeemclmm",
          args: {
            tokenIn,
            // @ts-ignore
            tokenId,
            liquidity,
            tokenOut: tokenOut,
          },
        });
        bundleActions.push({
          protocol: "enso",
          // @ts-ignore
          action: "merge",
          args: {
            tokenIn: tokenOut,
            // @ts-ignore
            tokenOut: sourceToken,
            amountIn: [
              {
                useOutputOfCallAt: 0,
                index: 0,
              },
              {
                useOutputOfCallAt: 0,
                index: 1,
              },
            ],
          },
        });
        bundleActions.push({
          protocol: "enso",
          // @ts-ignore
          action: "slippage",
          args: {
            // @ts-ignore
            amountOut: { useOutputOfCallAt: 1 },
            bps: slippageBps,
          },
        });
      } else {
        ensoFeeAmount = {
          useOutputOfCallAt: 0,
        };
        bridgeAmount = {
          useOutputOfCallAt: 1,
        };
        // @ts-ignore
        bundleActions.push(
          // @ts-ignore
          {
            protocol: "enso",
            action: BundleActionType.Route,
            args: {
              tokenIn,
              amountIn,
              tokenOut: sourceToken,
            },
          } as BundleAction
        );
      }
    }

    bundleActions.push(
      {
        protocol: "enso",
        // @ts-ignore
        action: "ensofee",
        args: {
          // @ts-ignore
          token: sourceToken,
          amount: ensoFeeAmount,
          bps: feeBps,
        },
      },
      {
        protocol: "stargate",
        action: BundleActionType.Bridge,
        args: {
          // @ts-ignore
          primaryAddress: sourcePool,
          destinationChainId,
          // @ts-ignore
          tokenIn: sourceToken,
          amountIn: bridgeAmount,
          receiver,
          callback: [
            {
              protocol: "enso",
              action: "balance",
              args: {
                token: destinationToken,
              },
            },
            {
              protocol: "enso",
              action: "split",
              args: {
                tokenIn: destinationToken,
                tokenOut: [token0, token1],
                amountIn: {
                  useOutputOfCallAt: 0,
                },
              },
            },
            {
              protocol: "enso",
              action: "slippage",
              args: {
                amountOut: { useOutputOfCallAt: 1, index: 0 },
                bps: slippageBps,
              },
            },
            {
              protocol: "enso",
              action: "slippage",
              args: {
                amountOut: { useOutputOfCallAt: 1, index: 1 },
                bps: slippageBps,
              },
            },
            {
              protocol: "uniswap-v4",
              action: "depositclmm",
              args: {
                tokenOut: V4PositionManagers[destinationChainId],
                ticks,
                tokenIn: [token0, token1],
                poolFee,
                amountIn: [
                  {
                    useOutputOfCallAt: 1,
                    index: 0,
                  },
                  {
                    useOutputOfCallAt: 1,
                    index: 1,
                  },
                ],
              },
            },
            {
              protocol: "enso",
              action: "slippage",
              args: {
                amountOut: { useOutputOfCallAt: 2 },
                bps: slippageBps,
              },
            },
          ],
        },
      }
    );
  } else {
    const positionManager = V4PositionManagers[destinationChainId];

    bundleActions.push(
      {
        protocol: "enso",
        // @ts-ignore
        action: "ensofee",
        args: {
          // @ts-ignore
          token: tokenIn,
          amount: amountIn,
          bps: feeBps,
        },
      },
      {
        protocol: "enso",
        // @ts-ignore
        action: "split",
        // @ts-ignore
        args: {
          tokenIn,
          tokenOut: [token0, token1],
          amountIn: {
            useOutputOfCallAt: 0,
          },
        },
      },
      {
        protocol: "enso",
        action: "slippage",
        args: {
          amountOut: { useOutputOfCallAt: 1, index: 0 },
          bps: slippageBps,
        },
      },
      {
        protocol: "enso",
        action: "slippage",
        args: {
          amountOut: { useOutputOfCallAt: 1, index: 1 },
          bps: slippageBps,
        },
      },
      {
        protocol: "uniswap-v4",
        // @ts-ignore
        action: "depositclmm",
        args: {
          tokenOut: positionManager,
          // @ts-ignore
          ticks,
          tokenIn: [token0, token1],
          poolFee,
          amountIn: [
            {
              useOutputOfCallAt: 1,
              index: 0,
            },
            {
              useOutputOfCallAt: 1,
              index: 1,
            },
          ],
        },
      },
      {
        protocol: "enso",
        // @ts-ignore
        action: "slippage",
        args: {
          // @ts-ignore
          amountOut: { useOutputOfCallAt: 2 },
          bps: 500,
        },
      }
    );
  }

  const enabled = Boolean(
    ((tokenOut && liquidity && tokenId) || amountIn) &&
      destinationChainId &&
      tokenIn &&
      receiver &&
      ticks[0] &&
      poolFee &&
      token0 &&
      token1
  );

  const { data, isLoading } = useBundleData(
    { chainId, fromAddress: receiver, spender: receiver },
    bundleActions,
    enabled
  );

  const bundleData = {
    tx: data?.tx,
    route: [],
    // @ts-ignore
    amountOut: data?.amountsOut?.[tokenOut] || "0",
    gas: data?.gas || "0",
  };

  return {
    data: bundleData,
    isLoading,
  };
};

export const useBundleData = (
  bundleParams: BundleParams,
  bundleActions: BundleAction[],
  enabled = true
) => {
  const chainId = usePriorityChainId();
  const firstActionArgs = bundleActions[0]?.args;

  return useQuery({
    queryKey: ["enso-bundle", chainId, bundleParams, bundleActions],
    queryFn: () => ensoClient.getBundleData(bundleParams, bundleActions),
    enabled:
      enabled &&
      bundleActions?.length > 0 &&
      isAddress(bundleParams.fromAddress) &&
      // @ts-ignore
      (+(firstActionArgs?.amountIn || (firstActionArgs?.amount as string)) >
        0 ||
        // @ts-ignore
        !!firstActionArgs?.tokenId),
  });
};

export const useEnsoData = (
  params: BridgeBundleParams
): {
  data: {
    tx: any;
    route: any[];
    amountOut: string;
    gas: string;
  };
  isLoading: boolean;
  sendTransaction: any;
} => {
  const { data: bundleData, isLoading: bundleLoading } =
    useBridgeBundle(params);

  const data = bundleData;
  const isLoading = bundleLoading;

  const sendTransaction = useSendEnsoTransaction(data?.tx);

  return {
    data,
    isLoading,
    sendTransaction,
  };
};

export const useEnsoBalances = (priorityChainId?: SupportedChainId) => {
  const { address } = useAccount();
  const chainId = usePriorityChainId(priorityChainId);

  return useQuery({
    queryKey: ["enso-balances", chainId, address],
    queryFn: () =>
      ensoClient.getBalances({ useEoa: true, chainId, eoaAddress: address }),
    enabled: !!isAddress(address!),
  });
};

const useEnsoTokenDetails = ({
  address,
  priorityChainId,
  project,
  protocolSlug,
  enabled = true,
}: {
  address?: Address;
  priorityChainId?: SupportedChainId;
  project?: string;
  protocolSlug?: string;
  enabled?: boolean;
}) => {
  const chainId = usePriorityChainId(priorityChainId);

  return useQuery({
    queryKey: ["enso-token-details", address, chainId, protocolSlug, project],
    queryFn: () =>
      ensoClient.getTokenData({
        project,
        protocolSlug,
        address,
        chainId,
        includeMetadata: true,
      }),
    enabled,
  });
};

// fallback to normal token details
export const useEnsoToken = ({
  address,
  priorityChainId,
  project,
  protocolSlug,
  enabled,
}: {
  address?: Address;
  priorityChainId?: SupportedChainId;
  protocolSlug?: string;
  project?: string;
  enabled?: boolean;
}) => {
  const chainId = usePriorityChainId(priorityChainId);
  const { data } = useEnsoTokenDetails({
    address,
    priorityChainId,
    project,
    protocolSlug,
    enabled,
  });
  const getListToken = useCurrentChainTokenGetter(chainId);

  const token: Token[] = useMemo(() => {
    if (!data?.data?.length || !data?.data[0].symbol) {
      const foundToken = address ? getListToken(address) : undefined;
      return foundToken ? [foundToken] : [];
    }

    return data?.data?.map((token) => ({
      ...token,
      address: token?.address.toLowerCase() as Address,
      logoURI: token?.logosUri[0],
      underlyingTokens: token?.underlyingTokens?.map((token) => ({
        ...token,
        address: token?.address.toLowerCase() as Address,
        logoURI: token?.logosUri[0],
      })),
    }));
  }, [data, getListToken]);

  return token;
};

export const useEnsoPrice = (
  address: Address,
  priorityChainId?: SupportedChainId
) => {
  const chainId = usePriorityChainId(priorityChainId);

  return useQuery({
    queryKey: ["enso-token-price", address, chainId],
    queryFn: () => ensoClient.getPriceData({ address, chainId }),
    enabled: !!chainId && isAddress(address),
  });
};

export const useEnsoProtocols = () => {
  return useQuery({
    queryKey: ["enso-protocols"],
    queryFn: () => ensoClient.getProtocolData(),
  });
};

export const useChainProtocols = (chainId: SupportedChainId) => {
  const { data } = useEnsoProtocols();

  return data?.filter((protocol: { chains: { id: number }[] }) =>
    protocol.chains.some((chain) => chain.id === chainId)
  );
};
