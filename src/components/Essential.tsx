import { useMemo, useState } from "react";
import {
  useReadContract,
  useReadContracts,
  useAccount,
  useChainId,
} from "wagmi";
import { Address } from "viem";
import {
  Box,
  Text,
  Heading,
  Flex,
  VStack,
  Center,
  Tabs,
} from "@chakra-ui/react";
import { Token } from "@uniswap/sdk-core";
import { Pool, Position as V3Position } from "@uniswap/v3-sdk";
import { useEnsoPrice, useEnsoToken } from "@/util/enso";
import { denormalizeValue, normalizeValue } from "@/util";
import { usePriorityChainId } from "@/util/common";
import { v3FactoryAbi, v3PoolAbi } from "@/util/abis";
import { posManagerAbi } from "@/util/abis";
import {
  getPosManagerAddress,
  Position,
  v3FactoryAddresses,
} from "@/util/uniswap";
import TargetSection from "./TargetSection";
import SwapInput from "./SwapInput";

const mapV3Position = (position: unknown): Position => {
  const [
    nonce,
    operator,
    token0,
    token1,
    fee,
    tickLower,
    tickUpper,
    liquidity,
    feeGrowthInside0LastX128,
    feeGrowthInside1LastX128,
    tokensOwed0,
    tokensOwed1,
  ] = position as unknown as [
    bigint,
    Address,
    Address,
    Address,
    number,
    number,
    number,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
  ];
  return {
    id: 0,
    fee,
    token0,
    token1,
    liquidity,
    tickLower,
    tickUpper,
    nonce,
    operator,
    feeGrowthInside0LastX128,
    feeGrowthInside1LastX128,
    tokensOwed0,
    tokensOwed1,
  };
};

const useV3PoolPrice = (position: Position) => {
  const chainId = usePriorityChainId();
  const factoryAddress = v3FactoryAddresses[chainId]!;
  const poolAddress = useReadContract({
    address: factoryAddress,
    abi: v3FactoryAbi,
    functionName: "getPool",
    args: [position.token0, position.token1, position.fee],
  });

  const poolPrice = useReadContract({
    address: poolAddress.data as `0x${string}`,
    abi: v3PoolAbi,
    functionName: "slot0",
  });

  console.log(poolPrice.data, poolAddress.data);

  return poolPrice.data;
};

const getMintAmounts = (
  token0: Address,
  token1: Address,
  poolFee: number,
  price: bigint,
  tick: number,
  liquidity: bigint,
  ticks: [number, number],
) => {
  const tokenA = new Token(1, token0, 18, "A", "A");
  const tokenB = new Token(1, token1, 18, "B", "B");

  const pool = new Pool(
    tokenA,
    tokenB,
    poolFee,
    price.toString(),
    liquidity.toString(),
    tick,
  );

  const position = new V3Position({
    pool,
    liquidity: liquidity.toString(),
    tickLower: Number(ticks[0]),
    tickUpper: Number(ticks[1]),
  });

  const { amount0, amount1 } = position.mintAmounts;

  return [amount0.toString(), amount1.toString()];
};

const PositionItem = ({
  position,
  isSelected,
  onSelect,
}: {
  position: Position;
  isSelected?: boolean;
  onSelect: () => void;
}) => {
  const [token0] = useEnsoToken({ address: position.token0 });
  const [token1] = useEnsoToken({ address: position.token1 });
  const poolPrice = useV3PoolPrice(position);
  const { data: token0Price } = useEnsoPrice(token0?.address);
  const { data: token1Price } = useEnsoPrice(token1?.address);

  const amounts =
    poolPrice &&
    getMintAmounts(
      position.token0,
      position.token1,
      position.fee,
      poolPrice?.[0],
      poolPrice?.[1],
      position.liquidity,
      [position.tickLower, position.tickUpper],
    );

  // Calculate token amounts with a simpler approach to avoid type errors
  let token0Value = "0";
  let token1Value = "0";

  if (amounts && amounts[0]) {
    token0Value = normalizeValue(amounts[0], token0?.decimals);
  }

  if (amounts && amounts[1]) {
    token1Value = normalizeValue(amounts[1], token1?.decimals);
  }

  console.log(token0Value, token1Value, token0Price, token1Price);

  const token0UsdValue = +token0Value * +(token0Price?.price || 0);
  const token1UsdValue = +token1Value * +(token1Price?.price || 0);
  const totalUsdValue = token0UsdValue + token1UsdValue;

  return (
    <Box
      borderWidth="1px"
      borderRadius="lg"
      p={4}
      _hover={{ shadow: "md" }}
      transition="box-shadow 0.2s"
      cursor="pointer"
      onClick={onSelect}
      bg={isSelected ? "blue.50" : "white"}
      borderColor={isSelected ? "blue.500" : "gray.200"}
    >
      <Box mb={4}>
        <Flex justify="space-between" align="center" gap={1}>
          <Text fontSize="lg" fontWeight="semibold">
            Position #{position.id}
          </Text>
          <Text fontSize="sm" color="gray.500">
            Fee: {position.fee / 10000}%
          </Text>
        </Flex>
      </Box>

      <Box mb={4}>
        <Flex justify="space-between" mb={2}>
          <Text color="gray.600">Token 0:</Text>
          <Text fontFamily="mono" fontSize="sm">
            {position.token0?.slice(0, 6)}...
            {position.token0?.slice(-4)}
          </Text>
        </Flex>
        <Flex justify="space-between" mb={2}>
          <Text color="gray.600">Token 1:</Text>
          <Text fontFamily="mono" fontSize="sm">
            {position.token1?.slice(0, 6)}...
            {position.token1?.slice(-4)}
          </Text>
        </Flex>
        <Flex justify="space-between">
          <Text color="gray.600">Liquidity:</Text>
          <Text>{position.liquidity.toString()}</Text>
        </Flex>
      </Box>

      <Box borderTopWidth="1px" pt={3} mb={4}>
        <Heading size="sm" mb={2}>
          Token Amounts
        </Heading>
        <Flex justify="space-between" mb={2}>
          <Text color="gray.600">{token0?.symbol || "Token 0"}:</Text>
          <Box textAlign="right">
            <Text>{token0Value}</Text>
            <Text fontSize="xs" color="gray.500">
              ${token0UsdValue.toFixed(2)}
            </Text>
          </Box>
        </Flex>
        <Flex justify="space-between" mb={2}>
          <Text color="gray.600">{token1?.symbol || "Token 1"}:</Text>
          <Box textAlign="right">
            <Text>{token1Value}</Text>
            <Text fontSize="xs" color="gray.500">
              ${token1UsdValue.toFixed(2)}
            </Text>
          </Box>
        </Flex>
        <Flex justify="space-between" pt={1}>
          <Text color="gray.600" fontWeight="medium">
            Total Value:
          </Text>
          <Text fontWeight="bold">${totalUsdValue.toFixed(2)}</Text>
        </Flex>
      </Box>
    </Box>
  );
};

const Essential = () => {
  const { address } = useAccount();
  const chainId = useChainId();
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(
    null,
  );
  const [sourceMode, setSourceMode] = useState<"token" | "position">("token");
  const [sourceToken, setSourceToken] = useState<Address>(
    "0x0000000000000000000000000000000000000000",
  );
  const [sourceValue, setSourceValue] = useState<string>("");
  const [sourceTokenData] = useEnsoToken({ address: sourceToken });

  const sourceAmount = denormalizeValue(sourceValue, sourceTokenData?.decimals);

  const posManagerAddress = getPosManagerAddress(chainId);

  const { data: balanceOf } = useReadContract({
    address: posManagerAddress,
    abi: posManagerAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  const tokenQueries = useMemo(() => {
    if (!address || !balanceOf) return [];
    return Array.from({ length: Number(balanceOf) }, (_, i) => ({
      address: posManagerAddress as `0x${string}`,
      abi: posManagerAbi,
      functionName: "tokenOfOwnerByIndex",
      args: [address, BigInt(i)] as const,
    }));
  }, [address, balanceOf, posManagerAddress]);

  const { data: tokenIds } = useReadContracts(
    // @ts-ignore
    {
      contracts: tokenQueries,
    },
  );

  const positionQueries = useMemo(() => {
    if (!tokenIds) return [];
    return tokenIds.map((tokenId) => ({
      address: posManagerAddress as `0x${string}`,
      abi: posManagerAbi,
      functionName: "positions",
      args: [tokenId.result] as const,
    }));
  }, [tokenIds, posManagerAddress]);

  const { data: positions } = useReadContracts({
    contracts: positionQueries,
  });

  const positionsWithIds = useMemo(() => {
    if (!positions || !tokenIds) return [];
    // @ts-ignore
    return (positions as { result: [string, number | bigint][] }[])
      .filter((pos) => !!pos?.result)
      .map(({ result }, index) => ({
        ...mapV3Position(result),
        id: tokenIds[index].result as unknown as number,
      }))
      .filter((position) => position.liquidity > 0n);
  }, [positions, tokenIds]);
  console.log(positionsWithIds);

  // Get token price for SwapInput
  const { data: tokenPrice } = useEnsoPrice(sourceToken);
  const usdValue = tokenPrice
    ? parseFloat(sourceValue || "0") * +tokenPrice.price
    : 0;

  if (!address) {
    return <Text color="gray.600">Please connect your wallet</Text>;
  }

  return (
    <Center>
      <Flex>
        <Box p={6} minW="450px">
          <Tabs.Root
            variant="line"
            colorScheme="blue"
            value={sourceMode}
            onValueChange={(details) =>
              setSourceMode(details.value === "position" ? "position" : "token")
            }
          >
            <Tabs.List mb={4}>
              <Tabs.Trigger value="token">Token</Tabs.Trigger>
              <Tabs.Trigger value="position">Position</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="position">
              <Heading as="h2" size="lg" mb={6}>
                Your Uniswap V3 Positions
              </Heading>
              {!balanceOf || balanceOf === 0n ? (
                <Text color="gray.600">You don't have any NFT positions</Text>
              ) : (
                <Box>
                  <VStack gap={4}>
                    {positionsWithIds.map((position) => (
                      <PositionItem
                        key={position.id}
                        position={position}
                        isSelected={selectedPosition?.id === position.id}
                        onSelect={() => setSelectedPosition(position)}
                      />
                    ))}
                  </VStack>
                </Box>
              )}
            </Tabs.Content>
            <Tabs.Content value="token">
              <Heading as="h2" size="lg" mb={6}>
                Choose Token
              </Heading>
              <Box maxW="450px">
                <SwapInput
                  tokenValue={sourceToken}
                  tokenOnChange={setSourceToken}
                  inputValue={sourceValue}
                  inputOnChange={setSourceValue}
                  usdValue={usdValue}
                />
              </Box>
            </Tabs.Content>
          </Tabs.Root>
        </Box>
        <TargetSection
          selectedPosition={sourceMode === "position" ? selectedPosition : null}
          sourceToken={sourceMode === "token" ? sourceToken : undefined}
          sourceAmount={sourceMode === "token" ? sourceAmount : undefined}
        />
      </Flex>
    </Center>
  );
};

export default Essential;
