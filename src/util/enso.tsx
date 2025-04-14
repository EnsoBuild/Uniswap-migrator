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
} from "@/util/common";
import { useSendEnsoTransaction } from "@/util/wallet";
import {
  SupportedChainId,
  STARGATE_CHAIN_NAMES,
  NATIVE_ETH_CHAINS,
} from "@/constants";

let ensoClient = new EnsoClient({
  baseURL: "https://shortcuts-backend-dynamic-int.herokuapp.com/api/v1",
  apiKey: import.meta.env.VITE_ENSO_API_KEY,
});

export const setApiKey = (apiKey: string) => {
  ensoClient = new EnsoClient({
    // baseURL: "http://localhost:3000/api/v1",
    baseURL: "https://shortcuts-backend-dynamic-int.herokuapp.com/api/v1",
    // baseURL: "https://shortcuts-backend-dynamic-dev.herokuapp.com/api/v1",
    apiKey,
  });
};

export const useEnsoApprove = (tokenAddress: Address, amount: string) => {
  const { address } = useAccount();
  const chainId = usePriorityChainId();

  return useQuery({
    queryKey: ["enso-approval", tokenAddress, chainId, address, amount],
    queryFn: () =>
      ensoClient.getApprovalData({
        fromAddress: address!,
        tokenAddress,
        chainId,
        amount,
      }),
    enabled: +amount > 0 && isAddress(address!) && isAddress(tokenAddress),
  });
};

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
}

const useBridgeBundle = (
  {
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
  }: BridgeBundleParams,
  enabled = false
) => {
  const tokenNameToBridge =
    NATIVE_ETH_CHAINS.includes(chainId!) &&
    NATIVE_ETH_CHAINS.includes(destinationChainId!)
      ? "ETH"
      : "USDC";
  const [sourcePool, sourceToken] = useStargateTokens(
    chainId!,
    tokenNameToBridge
  );
  const [destinationPool, destinationToken] = useStargateTokens(
    destinationChainId!,
    tokenNameToBridge
  );
  console.log("Stargate tokens:", {
    tokenNameToBridge,
    sourcePool,
    sourceToken,
    destinationPool,
    destinationToken,
    chainId,
    destinationChainId,
  });

  const bundleActions: BundleAction[] = [
    {
      protocol: "stargate",
      action: BundleActionType.Bridge,
      args: {
        // @ts-ignore
        primaryAddress: sourcePool,
        destinationChainId,
        // @ts-ignore
        tokenIn: sourceToken,
        amountIn: {
          useOutputOfCallAt: 0,
        },
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
            protocol: "uniswap-v4",
            action: "depositclmm",
            args: {
              tokenOut: "0x7c5f5a4bbd8fd63184577525326123b519429bdc",
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
        ],
      },
    },
  ];

  if (tokenIn !== sourceToken) {
    if (tokenId) {
      // @ts-ignore
      bundleActions[0].args.amountIn = {
        useOutputOfCallAt: 1,
      };

      bundleActions.unshift(
          {
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

      bundleActions.unshift({
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
    } else {
      bundleActions.unshift(
          // @ts-ignore
          {
        protocol: "enso",
        action: BundleActionType.Route,
        args: {
          tokenIn,
          amountIn: 0,
          tokenOut: sourceToken,
        },
      } as BundleAction);
    }
  }

  // Log the final bundle actions for debugging
  console.log("Final bundle actions:", bundleActions);

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

  // Log the bundleData for debugging
  console.log("Bundle data result:", bundleData);

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

  // debugger;

  return useQuery({
    queryKey: ["enso-bundle", chainId, bundleParams, bundleActions],
    queryFn: () => ensoClient.getBundleData(bundleParams, bundleActions),
    enabled:
      (enabled &&
        bundleActions.length > 0 &&
        isAddress(bundleParams.fromAddress) &&
        // @ts-ignore
        +(bundleActions[0]?.args?.amountIn as string) > 0) ||
        // @ts-ignore
      !!bundleActions[0]?.args?.tokenId,
  });
};

export const useEnsoData = (params: BridgeBundleParams) => {
  const { data: bundleData, isLoading: bundleLoading } = useBridgeBundle(
    params,
    true // Always enabled
  );

  // Log the result of the bundle data
  console.log("useBridgeBundle result:", {
    bundleData,
    bundleLoading,
    txAvailable: !!bundleData?.tx,
  });

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
  const { data } = useEnsoTokenDetails({
    address,
    priorityChainId,
    project,
    protocolSlug,
    enabled,
  });
  const getListToken = useCurrentChainTokenGetter(priorityChainId);

  const token: Token[] = useMemo(() => {
    if (!data?.data?.length || !data?.data[0].decimals) {
      const foundToken = address ? getListToken(address) : undefined;
      return foundToken ? [foundToken] : [];
    }
    // const ensoToken = data.data[0];
    // let logoURI = ensoToken.logosUri[0];

    // if (!logoURI) {
    //   if (ensoToken.underlyingTokens?.length === 1)
    //     logoURI = ensoToken.underlyingTokens[0].logosUri[0];
    //   else logoURI = tokenFromList?.logoURI;
    // }

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
