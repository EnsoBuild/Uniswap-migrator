import { cacheExchange, createClient, fetchExchange, gql } from "urql";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";
import { base } from "viem/chains";

// Import or define TICK_SPACINGS
export const TICK_SPACINGS: { [key: number]: number } = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
};

export const NativeToken = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
export const NullAddress = "0x0000000000000000000000000000000000000000";

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
  token0Symbol?: string;
  token1Symbol?: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  feeGrowthInside0LastX128: bigint;
  feeGrowthInside1LastX128: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
  // Pool data
  poolId?: string;
  poolTick?: number;
  poolSqrtPrice?: string;
  poolLiquidity?: string;
  // Additional data
  depositedToken0?: string;
  depositedToken1?: string;
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

interface V3PositionData {
  id: string;
  owner: string;
  token0: {
    id: string;
    symbol: string;
  };
  token1: {
    id: string;
    symbol: string;
  };
  pool: {
    id: string;
    feeTier: string;
    tick: string;
    sqrtPrice: string;
    liquidity: string;
  };
  tickLower: string;
  tickUpper: string;
  liquidity: string;
  depositedToken0: string;
  depositedToken1: string;
}

interface UniswapV3PositionsResponse {
  positions: V3PositionData[];
}

const v4Subgraphs = {
  130: "https://gateway.thegraph.com/api/subgraphs/id/EoCvJ5tyMLMJcTnLQwWpjAtPdn74PcrZgzfcT5bYxNBH",
};
const v3Subgraphs = {
  8453: "https://gateway.thegraph.com/api/subgraphs/id/HMuAwufqZ1YCRmzL2SfHTVkzZovC9VL2UAKhjvRqKiR1",
  42161:
    "https://gateway.thegraph.com/api/subgraphs/id/3V7ZY6muhxaQL5qvntX1CFXJ32W7BxXZTGTwmpH5J4t3",
  1: "https://gateway.thegraph.com/api/subgraphs/id/9fWsevEC9Yz4WdW9QyUvu2JXsxyXAxc1X4HaEkmyyc75",
};

const getV4Client = (chainId: number) =>
  createClient({
    url: v4Subgraphs[chainId],
    fetchOptions: {
      headers: {
        Authorization: "Bearer 1cbb8a8e0861311c3eb0de19e42feb71",
      },
    },
    exchanges: [cacheExchange, fetchExchange],
  });

const getV3Client = (chainId: number) => {
  const url = v3Subgraphs[chainId];
  if (!url) {
    throw new Error(`No subgraph URL for chain ID ${chainId}`);
  }

  return createClient({
    url,
    fetchOptions: {
      headers: {
        Authorization: "Bearer 1cbb8a8e0861311c3eb0de19e42feb71",
      },
    },
    exchanges: [cacheExchange, fetchExchange],
  });
};

const POOLS_QUERY = gql`
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

const POSITIONS_QUERY = gql`
  query Positions($owner: String!) {
    positions(where: { owner: $owner, liquidity_gt: "0" }) {
      id
      owner
      token0 {
        id
        symbol
      }
      token1 {
        id
        symbol
      }
      pool {
        id
        feeTier
        tick
        sqrtPrice
        liquidity
      }
      tickLower
      tickUpper
      liquidity
      depositedToken0
      depositedToken1
    }
  }
`;

export const useV4UnichainPools = (token0?: string, token1?: string) => {
  return useQuery<UniswapV4Response, Error>({
    queryKey: ["v4-unichain-pools", token0, token1],
    queryFn: () =>
      getV4Client(130)
        .query(POOLS_QUERY, {
          token0: token0,
          token1: token1,
        })
        .toPromise()
        .then((res) => res.data),
    enabled: !!token0 && !!token1,
    refetchInterval: 60 * 1000, // 1 minute
  });
};

export const useV3Positions = (owner?: Address, chainId?: number) => {
  const activeChainId = chainId || 1; // Default to Ethereum mainnet

  return useQuery<UniswapV3PositionsResponse, Error>({
    queryKey: ["v3-positions", owner, activeChainId],
    queryFn: () => {
      if (!owner) return { positions: [] };

      return getV3Client(activeChainId)
        .query(POSITIONS_QUERY, {
          owner: owner.toLowerCase(),
        })
        .toPromise()
        .then((res) => res.data);
    },
    enabled: !!owner,
  });
};

// Convert subgraph position data to Position interface
export const convertSubgraphPosition = (position: V3PositionData): Position => {
  return {
    id: parseInt(position.id),
    nonce: 0n, // Not available from subgraph
    operator: "", // Not available from subgraph
    token0: position.token0.id as Address,
    token1: position.token1.id as Address,
    token0Symbol: position.token0.symbol,
    token1Symbol: position.token1.symbol,
    fee: parseInt(position.pool.feeTier),
    tickLower: parseInt(position.tickLower),
    tickUpper: parseInt(position.tickUpper),
    liquidity: BigInt(position.liquidity),
    feeGrowthInside0LastX128: 0n, // Not available from subgraph
    feeGrowthInside1LastX128: 0n, // Not available from subgraph
    tokensOwed0: 0n, // Approximated from collected fees if needed
    tokensOwed1: 0n, // Approximated from collected fees if needed
    // Pool data
    poolId: position.pool.id,
    poolTick: parseInt(position.pool.tick),
    poolSqrtPrice: position.pool.sqrtPrice,
    poolLiquidity: position.pool.liquidity,
    // Additional data
    depositedToken0: position.depositedToken0,
    depositedToken1: position.depositedToken1,
  };
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

// Tick and price calculation utilities
export const roundTick = (
  tick: number,
  tickSpacing: number,
  roundUp: boolean
) => {
  if (roundUp) {
    return Math.ceil(tick / tickSpacing) * tickSpacing;
  } else {
    return Math.floor(tick / tickSpacing) * tickSpacing;
  }
};

export const tickToPrice = (tick: number) => {
  return Math.pow(1.0001, tick);
};

export const priceToTick = (
  price: number,
  tickSpacing: number,
  roundUp: boolean = false
) => {
  if (!price || price <= 0) return 0;
  const rawTick = Math.log(price) / Math.log(1.0001);
  return roundTick(rawTick + (roundUp ? 0 : 1), tickSpacing, roundUp);
};

export const calculatePricePercentage = (
  price: number,
  currentPrice: number
) => {
  if (!currentPrice) return null;
  return (price / currentPrice - 1) * 100;
};

export const formatPricePercentage = (percent: number | null) => {
  if (percent === null) return "";
  const limitedPercent = Math.max(Math.min(percent, 1000), -100);
  return `${limitedPercent > 0 ? "+" : ""}${limitedPercent.toFixed(2)}%`;
};

export const calculateRangeWidth = (tickLower: number, tickUpper: number) => {
  const lowerPrice = tickToPrice(tickLower);
  const upperPrice = tickToPrice(tickUpper);
  return ((upperPrice - lowerPrice) / ((lowerPrice + upperPrice) / 2)) * 100;
};

export const isFullRange = (
  tickLower: number,
  tickUpper: number,
  tickSpacing: number
) => {
  // Threshold for considering a position as full range (99% of possible range)
  const minPossibleTick =
    Math.floor(TickMath.MIN_TICK / tickSpacing) * tickSpacing;
  const maxPossibleTick =
    Math.ceil(TickMath.MAX_TICK / tickSpacing) * tickSpacing;

  return (
    tickLower <= minPossibleTick + tickSpacing * 10 &&
    tickUpper >= maxPossibleTick - tickSpacing * 10
  );
};

// Import from Uniswap SDK at the top of the file if not already there
export const TickMath = {
  MIN_TICK: -887272,
  MAX_TICK: 887272,
};
