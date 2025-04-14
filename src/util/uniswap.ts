import { cacheExchange, createClient, fetchExchange, gql } from "urql";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";
import { base } from "viem/chains";

const NativeToken = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const NullAddress = "0x0000000000000000000000000000000000000000";

const isNativeToken = (token: string) => token === NativeToken;
// depending on order; returns zero address for native
export function orderTokensAndAmounts(
  token0: string,
  token1: string,
  amount0: bigint,
  amount1: bigint
): {
  tokens: [string, string];
  amounts: [bigint, bigint];
  inverted: boolean;
} {
  if (isNativeToken(token0))
    return {
      tokens: [NullAddress, token1],
      amounts: [amount0, amount1],
      inverted: false,
    };

  if (isNativeToken(token1))
    return {
      tokens: [NullAddress, token0],
      amounts: [amount1, amount0],
      inverted: true,
    };

  if (token0.toLowerCase() < token1.toLowerCase()) {
    return {
      tokens: [token0, token1],
      amounts: [amount0, amount1],
      inverted: false,
    };
  }

  return {
    tokens: [token1, token0],
    amounts: [amount1, amount0],
    inverted: true,
  };
}

export interface Position {
  id: number;
  nonce: bigint;
  operator: string;
  token0: Address;
  token1: Address;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  feeGrowthInside0LastX128: bigint;
  feeGrowthInside1LastX128: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
}

interface Token {
  id: string;
  symbol: string;
  derivedETH: string;
}

interface Pool {
  id: string;
  liquidity: string;
  feeTier: string;
  tickSpacing: string;
  sqrtPrice: string;
  tick: string;
  totalValueLockedUSD: string;
  token0: Token;
  token1: Token;
}

interface UniswapV4Response {
  pools: Pool[];
}

const v4chainSubgraphs = {
  130: "https://gateway.thegraph.com/api/subgraphs/id/EoCvJ5tyMLMJcTnLQwWpjAtPdn74PcrZgzfcT5bYxNBH",
};

const client = createClient({
  url: v4chainSubgraphs[130],
  fetchOptions: {
    headers: {
      Authorization: "Bearer 1cbb8a8e0861311c3eb0de19e42feb71",
    },
  },
  exchanges: [cacheExchange, fetchExchange],
});

const DATA_QUERY = gql`
  query Pools($token0: String!, $token1: String!) {
    pools(
      where: {
        liquidity_gt: 0
        totalValueLockedUSD_gt: 1
        hooks: "0x0000000000000000000000000000000000000000"
        token0: $token0
        token1: $token1
      }
    ) {
      id
      liquidity
      feeTier
      tickSpacing
      sqrtPrice
      tick
      totalValueLockedUSD
      token0 {
        id
        symbol
        derivedETH
      }
      token1 {
        id
        symbol
        derivedETH
      }
    }
  }
`;

export const useV4UnichainPools = (token0?: string, token1?: string) => {
  return useQuery<UniswapV4Response, Error>({
    queryKey: ["v4-unichain-pools", token0, token1],
    queryFn: () =>
      client
        .query(DATA_QUERY, {
          token0: token0,
          token1: token1,
        })
        .toPromise()
        .then((res) => res.data),
    enabled: !!token0 && !!token1,
  });
};

export const v3FactoryAddresses: { [key: number]: `0x${string}` } = {
  1: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  10: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  42161: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  8453: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
};

export const getPosManagerAddress = (chainId: number) => {
  if (chainId === base.id) {
    return "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
  }
  return "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
};
