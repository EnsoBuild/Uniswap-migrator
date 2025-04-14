import { useQuery } from "@tanstack/react-query";
import { useChainId } from "wagmi";
import { Address, zeroAddress } from "viem";
import {
  CHAINS_ETHERSCAN,
  CHAINS_NATIVE_TOKENS,
  ETH_ADDRESS,
  GECKO_CHAIN_NAMES,
  SupportedChainId,
} from "@/constants";
import { useStore } from "@/store";
import { useCallback } from "react";

export type Token = {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
  underlyingTokens?: Token[];
  type?: string;
  apy?: number;
  tvl?: number;
};

export const compareCaseInsensitive = (a: string, b: string) => {
  return !!(a && b && a?.toLowerCase() === b?.toLowerCase());
};

const getGeckoList = (chainId: SupportedChainId) =>
  fetch(`https://tokens.coingecko.com/${GECKO_CHAIN_NAMES[chainId]}/all.json`)
    .then((res) => res.json())
    .then((data) => data?.tokens)
    .then((tokens) => [CHAINS_NATIVE_TOKENS[chainId], ...tokens]);

const getOogaboogaList: () => Promise<Token[]> = () =>
  fetch(
    "https://mainnet.internal.oogabooga.io/token-list/tokens?chainId=80094&client=SWAP"
  )
    .then((res) => res.json())
    .then((data) =>
      data.map((token) => ({
        ...token,
        logoURI: token.tokenURI,
        address:
          token.address === zeroAddress
            ? ETH_ADDRESS
            : token.address.toLowerCase(),
      }))
    );
//
// const getShadowList: (chainId: number) => Promise<Token[]> = () =>
//   fetch(
//     `https://raw.githubusercontent.com/Shadow-Exchange/shadow-assets/main/blockchains/sonic/tokenlist.json`,
//   )
//     .then((res) => res.json())
//     .then((data) =>
//       data.tokens[0]
//         .map((token: any) => ({
//           ...token,
//           address: token.address?.toLowerCase(),
//           logoURI: `https://raw.githubusercontent.com/Shadow-Exchange/shadow-assets/main/blockchains/sonic/assets/${token.address}/logo.png`,
//         }))
//         .filter(({ address }) => address),
//     );

const getOneInchTokenList = (chainId: number) =>
  fetch("https://tokens.1inch.io/v1.2/" + chainId)
    .then((res) => res.json())
    .then((data) => Object.values(data) as Token[]);

// .catch(() => tokenList[chainId]);

const getChainSymbolSortPriority = (chainId: SupportedChainId) => {
  const defaultPriority = {
    [CHAINS_NATIVE_TOKENS[chainId].symbol]: 5,
    USDC: 4,
    DAI: 4,
    USDT: 4,
    WBTC: 4,
    WETH: 3,
    LINK: 3,
    UNI: 3,
    SUSHI: 3,
    AAVE: 3,
    USDCE: 2,
  };
  switch (chainId) {
    default:
      return defaultPriority;
  }
};

const sonicAdditionalTokens = // TODO: remove after it comes in list for sonic
  new Promise<Token[]>((resolve) =>
    resolve([
      {
        address: "0x6047828dc181963ba44974801ff68e538da5eaf9",
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
        logoURI:
          "https://assets.coingecko.com/coins/images/325/large/Tether.png",
      },
    ])
  );

const unichainAdditionalTokens = new Promise<Token[]>((resolve) =>
  resolve([
    {
      address: "0x927b51f251480a681271180da4de28d44ec4afb8",
      logoURI:
        "https://token-registry.s3.amazonaws.com/icons/tokens/unichain/128/0x927b51f251480a681271180da4de28d44ec4afb8.png",
      name: "Wrapped BTC",
      symbol: "WBTC",
      decimals: 8,
    },
  ])
);

const getCurrentChainTokens = (chainId: SupportedChainId) => {
  let getters: Promise<Token[] | undefined>[] = [];

  switch (chainId) {
    case SupportedChainId.BERACHAIN:
      getters = [getOogaboogaList()];
      break;
    case SupportedChainId.UNICHAIN:
      getters = [getGeckoList(chainId), unichainAdditionalTokens];
      break;
    case SupportedChainId.SONIC:
      getters = [getGeckoList(chainId), sonicAdditionalTokens];
      break;
    default:
      // priority for oneInch tokens
      getters = [getOneInchTokenList(chainId), getGeckoList(chainId)];
  }

  return Promise.allSettled(getters).then((results) => {
    const tokens = results
      .filter(
        (result): result is PromiseFulfilledResult<Token[]> =>
          result.status === "fulfilled"
      )
      .map((result) => result.value);

    const tokenList = tokens[0];

    if (tokens.length > 1) {
      const addedToken = new Set<string>(
        tokens[0]?.map((t) => t.address) ?? []
      );
      const tokenList = tokens[0];

      for (let i = 1; i < tokens.length; i++) {
        const newTokens = tokens[i]?.filter(
          (token) => !addedToken.has(token.address)
        );

        if (newTokens) {
          tokenList.push(...newTokens);
          newTokens.forEach((t) => addedToken.add(t.address));
        }
      }
    }

    const priority = getChainSymbolSortPriority(chainId);

    // sort by token symbol priority
    const sortedTokenList = [...tokenList].sort((a, b) => {
      return priority[b.symbol] ?? 0 - priority[a.symbol] ?? 0;
    });

    return sortedTokenList;
  });
};

export const useCurrentChainList = (priorityChainId?: SupportedChainId) => {
  const chainId = usePriorityChainId(priorityChainId);

  return useQuery<Token[] | undefined>({
    queryKey: ["tokenList", chainId],
    queryFn: () => getCurrentChainTokens(chainId),
    enabled: !!chainId,
  });
};

export const useOneInchTokenList = () => {
  const chainId = usePriorityChainId();

  return useQuery({
    queryKey: ["oneInchTokenList", chainId],
    queryFn: () => getOneInchTokenList(chainId),
    enabled: !!chainId,
  });
};

export const useCurrentChainTokenGetter = (
  priorityChainId?: SupportedChainId
) => {
  const chainId = usePriorityChainId(priorityChainId);
  const { data } = useCurrentChainList(chainId);

  return useCallback(
    (tokenAddress: Address) => {
      return data?.find?.((token) => token.address == tokenAddress);
    },
    [data]
  );
};

export const useTokenFromList = (
  tokenAddress: Address,
  priorityChainId?: SupportedChainId
) => {
  const { data } = useCurrentChainList(priorityChainId);

  return data?.find?.((token) => token.address == tokenAddress);
};

export const useOutChainId = () => {
  const tokenOutChainId = useStore((state) => state.tokenOutChainId);
  const chainId = usePriorityChainId();

  return tokenOutChainId ?? chainId;
};

export const usePriorityChainId = (priorityChainId?: SupportedChainId) => {
  const obligatedChainId = useStore((state) => state.obligatedChainId);
  const chainId = useChainId();

  return priorityChainId ?? obligatedChainId ?? chainId;
};

export const useEtherscanUrl = (
  address?: string,
  type: "/address" | "/tx" = "/tx"
) => {
  const chainId = usePriorityChainId();
  const chainPrefix = CHAINS_ETHERSCAN[chainId as SupportedChainId];

  if (address) return `${chainPrefix}${type}/${address}`;
};

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const getChainName = (chainId: SupportedChainId) => {
  const geckoName = GECKO_CHAIN_NAMES[chainId];

  return capitalize(geckoName).split("-")[0];
};
