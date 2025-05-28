import {
  createListCollection,
  Flex,
  Select,
  Text,
  Box,
  useSelectContext,
  Badge,
  Spinner,
} from "@chakra-ui/react";
import { forwardRef, useMemo } from "react";
import { Address } from "viem";
import { useV4AllPools } from "../util/uniswap";
import { SupportedChainId } from "../constants";
import { formatCompactUsd } from "../util";
import { TokenIcon } from "./TokenIndicator";
import { useTokenFromList } from "../util/common";
import { useQuery } from "@tanstack/react-query";

// Merkl rewards type
type MerklReward = {
  identifier: string;
  apr: number;
  chainId: SupportedChainId;
};

// Merkl rewards hook
const useMerklRewards = (chainId?: SupportedChainId) =>
  useQuery<MerklReward[]>({
    queryKey: ["merkl-rewards", chainId],
    queryFn: () =>
      fetch(
        `https://api.merkl.xyz/v4/opportunities/?type=UNISWAP_V4&status=LIVE&chainId=${chainId}`
      ).then((res) => res.json()),
    enabled: !!chainId,
  });

export interface Pool {
  id: string;
  liquidity: string;
  feeTier: string;
  tickSpacing: string;
  sqrtPrice: string;
  tick: string;
  totalValueLockedUSD: string;
  token0: {
    id: string;
    symbol: string;
    derivedETH: string;
  };
  token1: {
    id: string;
    symbol: string;
    derivedETH: string;
  };
}

interface PoolSelectorProps {
  value?: string;
  onChange: (poolId: string, pool: Pool) => void;
  chainId?: SupportedChainId;
  disabled?: boolean;
}

// Pool indicator component to display in the dropdown
const PoolIndicator = forwardRef<
  HTMLDivElement,
  { pool: Pool; chainId?: SupportedChainId; merklReward?: MerklReward }
>(({ pool, chainId, merklReward }, ref) => {
  // Get token data from token list
  const token0Data = useTokenFromList(pool.token0.id as Address, chainId);
  const token1Data = useTokenFromList(pool.token1.id as Address, chainId);

  return (
    <Flex align="center" gap={3} ref={ref} w="full" py={1}>
      <Flex align="center" position="relative" minW="44px">
        <Box position="relative" zIndex={2}>
          <TokenIcon token={token0Data} chainId={chainId} />
        </Box>
        <Box position="relative" zIndex={1} ml={-2}>
          <TokenIcon token={token1Data} chainId={chainId} />
        </Box>
      </Flex>
      <Flex direction="column" align="start" flex={1} minW={0}>
        <Flex align="center" gap={2}>
          <Text
            fontWeight="semibold"
            fontSize="sm"
            whiteSpace="nowrap"
            overflow="hidden"
            textOverflow="ellipsis"
            lineHeight="1.2"
          >
            {pool.token0.symbol}/{pool.token1.symbol}
          </Text>
          {merklReward && (
            <Badge
              size="sm"
              colorPalette="green"
              variant="subtle"
              borderRadius="md"
              fontSize="xs"
              fontWeight="bold"
            >
              {merklReward.apr.toFixed(1)}% Reward APR
            </Badge>
          )}
        </Flex>
        <Flex gap={3} fontSize="xs" color="gray.500" align="center" mt={0.5}>
          <Text fontWeight="medium">
            {(Number(pool.feeTier) / 10000).toFixed(2)}%
          </Text>
          <Text>TVL: {formatCompactUsd(pool.totalValueLockedUSD)}</Text>
        </Flex>
      </Flex>
    </Flex>
  );
});

const SelectValue = ({
  chainId,
  isLoading,
}: {
  chainId?: SupportedChainId;
  isLoading?: boolean;
}) => {
  const select = useSelectContext();
  const [pool] = select.selectedItems;
  const { data: merklRewards } = useMerklRewards(chainId);

  // Find merkl reward for selected pool
  const merklReward = useMemo(() => {
    if (!pool || !merklRewards) return undefined;
    return merklRewards.find((reward) => reward.identifier === pool.id);
  }, [pool, merklRewards]);

  if (isLoading) {
    return (
      <Flex align="center" gap={2} color="gray.500">
        <Spinner size="sm" />
        <Text fontSize="sm">Loading pools...</Text>
      </Flex>
    );
  }

  return (
    <Select.ValueText placeholder="Select pool" width="100%" maxWidth="100%">
      {pool ? (
        <PoolIndicator
          pool={pool}
          chainId={chainId}
          merklReward={merklReward}
        />
      ) : (
        <Text whiteSpace="nowrap" color="fg">
          Select pool
        </Text>
      )}
    </Select.ValueText>
  );
};

const PoolSelector = ({
  value,
  onChange,
  chainId,
  disabled,
}: PoolSelectorProps) => {
  const { data: poolsData, isLoading } = useV4AllPools(chainId);
  const { data: merklRewards } = useMerklRewards(chainId);

  const poolOptions = useMemo(() => {
    if (!poolsData?.pools) {
      return createListCollection({
        items: [],
        itemToValue: (item: Pool) => item.id,
        itemToString: (item: Pool) =>
          `${item.token0.symbol}/${item.token1.symbol}`,
      });
    }

    return createListCollection({
      items: poolsData.pools,
      itemToValue: (item: Pool) => item.id,
      itemToString: (item: Pool) =>
        `${item.token0.symbol}/${item.token1.symbol}`,
    });
  }, [poolsData?.pools]);

  return (
    <Select.Root
      variant="outline"
      borderRadius="xl"
      transition="all 0.2s ease-in-out"
      disabled={disabled || isLoading}
      collection={poolOptions}
      value={value ? [value] : []}
      onValueChange={({ value: selectedValues }) => {
        const selectedPoolId = selectedValues[0];
        const pool = poolsData?.pools?.find((p) => p.id === selectedPoolId);
        if (pool) {
          onChange(selectedPoolId, pool);
        }
      }}
      size="md"
      w="full"
      minWidth="300px"
    >
      <Select.Control>
        <Select.Trigger
          opacity={1}
          borderRadius="xl"
          _hover={{
            bg: isLoading ? undefined : "bg.emphasized",
          }}
          h="56px"
          px={4}
          cursor={isLoading ? "not-allowed" : "pointer"}
        >
          <SelectValue chainId={chainId} isLoading={isLoading} />
        </Select.Trigger>
      </Select.Control>
      <Select.Positioner>
        <Select.Content
          maxH="400px"
          overflowY="auto"
          borderRadius="xl"
          border="1px"
          borderColor="gray.200"
          bg="white"
          shadow="lg"
        >
          {isLoading ? (
            <Flex
              align="center"
              justify="center"
              py={8}
              gap={2}
              color="gray.500"
            >
              <Spinner size="sm" />
              <Text fontSize="sm">Loading pools...</Text>
            </Flex>
          ) : (
            poolOptions.items.map((pool) => {
              // Find merkl reward for this pool
              const merklReward = merklRewards?.find(
                (reward) => reward.identifier === pool.id
              );

              return (
                <Select.Item
                  key={pool.id}
                  item={pool}
                  cursor="pointer"
                  px={4}
                  py={3}
                  _hover={{
                    bg: "gray.50",
                  }}
                  _selected={{
                    bg: "blue.50",
                    color: "blue.900",
                  }}
                >
                  <PoolIndicator
                    pool={pool}
                    chainId={chainId}
                    merklReward={merklReward}
                  />
                </Select.Item>
              );
            })
          )}
        </Select.Content>
      </Select.Positioner>
    </Select.Root>
  );
};

export default PoolSelector;
