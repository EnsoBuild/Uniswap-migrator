import { useMemo, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { Address } from "viem";
import {
  Box,
  Text,
  Heading,
  Flex,
  VStack,
  Center,
  Tabs,
  Badge,
} from "@chakra-ui/react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Token } from "@uniswap/sdk-core";
import { Pool, Position as V3Position } from "@uniswap/v3-sdk";
import { useEnsoPrice, useEnsoToken } from "@/util/enso";
import { denormalizeValue, normalizeValue } from "@/util";
import {
  useV3Positions,
  convertSubgraphPosition,
  Position,
  tickToPrice,
  calculatePricePercentage,
  formatPricePercentage,
  calculateRangeWidth,
  isFullRange,
  TICK_SPACINGS,
  NativeToken,
} from "@/util/uniswap";
import TargetSection from "./TargetSection";
import SwapInput from "./SwapInput";

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

const RangeIndicator = ({
  isInRange,
  currentTick,
  tickLower,
  tickUpper,
  fee,
}: {
  isInRange: boolean;
  currentTick: number;
  tickLower: number;
  tickUpper: number;
  fee: number;
}) => {
  // Calculate position of current price relative to range
  let pricePosition = 0;
  let belowRange = false;
  let aboveRange = false;

  if (currentTick < tickLower) {
    belowRange = true;
  } else if (currentTick > tickUpper) {
    aboveRange = true;
  } else {
    // Calculate position as percentage within range
    pricePosition = ((currentTick - tickLower) / (tickUpper - tickLower)) * 100;
  }

  // Calculate percentages relative to current price
  const currentPrice = tickToPrice(currentTick);
  const lowerPrice = tickToPrice(tickLower);
  const upperPrice = tickToPrice(tickUpper);

  const lowerPercent = calculatePricePercentage(lowerPrice, currentPrice);
  const upperPercent = calculatePricePercentage(upperPrice, currentPrice);

  // Calculate range width
  const rangeWidth = calculateRangeWidth(tickLower, tickUpper);
  const tickSpacing = TICK_SPACINGS[fee] || TICK_SPACINGS[3000];
  const fullRange = isFullRange(tickLower, tickUpper, tickSpacing);

  const bgColor = isInRange ? "green.400" : "gray.200";

  return (
    <VStack align="stretch" width="100%" gap={1}>
      {/* Range info line */}
      <Flex align="center" justify="space-between" width="100%" gap={2}>
        <Flex align="center" gap={2}>
          <Badge colorScheme={isInRange ? "green" : "gray"}>
            {isInRange ? "In Range" : "Out of Range"}
          </Badge>

          {fullRange ? (
            <Badge colorScheme="purple">Full Range</Badge>
          ) : (
            <Box>
              <Badge colorScheme="blue">
                {rangeWidth > 100
                  ? "Wide"
                  : rangeWidth > 30
                    ? "Medium"
                    : "Narrow"}
              </Badge>
              <Text fontSize="xs" as="span" ml={1}>
                ({rangeWidth.toFixed(2)}%)
              </Text>
            </Box>
          )}
        </Flex>
      </Flex>

      {/* Price range line */}
      <Flex justify="space-between" fontSize="xs" width="100%">
        <Text color="gray.600">{formatPricePercentage(lowerPercent)}</Text>
        <Text color="gray.600">{formatPricePercentage(upperPercent)}</Text>
      </Flex>

      {/* Visual range indicator */}
      <Box position="relative" width="100%" height="10px">
        {/* Background track */}
        <Box width="100%" height="100%" bg="gray.100" borderRadius="md" />

        {/* Active range */}
        <Box
          position="absolute"
          left="0"
          top="0"
          height="100%"
          width="100%"
          bg={bgColor}
          borderRadius="md"
        />

        {/* Lower boundary marker */}
        <Box
          position="absolute"
          left="0%"
          top="-2px"
          height="14px"
          width="2px"
          bg="gray.600"
        />

        {/* Upper boundary marker */}
        <Box
          position="absolute"
          right="0%"
          top="-2px"
          height="14px"
          width="2px"
          bg="gray.600"
        />

        {/* Current price indicator */}
        <Box
          position="absolute"
          left={belowRange ? "0%" : aboveRange ? "100%" : `${pricePosition}%`}
          top="-4px"
          height="18px"
          width="4px"
          bg="white"
          borderRadius="sm"
          boxShadow="0 0 2px rgba(0,0,0,0.4)"
          transform={belowRange || aboveRange ? "none" : "translateX(-50%)"}
          zIndex="2"
        />
      </Box>
    </VStack>
  );
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
  const { data: token0Price } = useEnsoPrice(token0?.address);
  const { data: token1Price } = useEnsoPrice(token1?.address);

  // Use the token symbols from the subgraph if available
  const token0Symbol = token0?.symbol || position.token0Symbol || "Token 0";
  const token1Symbol = token1?.symbol || position.token1Symbol || "Token 1";

  // Use getMintAmounts function to calculate token amounts
  const amounts = getMintAmounts(
    position.token0,
    position.token1,
    position.fee,
    BigInt(position.poolSqrtPrice || "1"),
    position.poolTick || 0,
    position.liquidity,
    [position.tickLower, position.tickUpper],
  );

  // Format token amounts for display
  const token0Value = normalizeValue(amounts[0], token0?.decimals);
  const token1Value = normalizeValue(amounts[1], token1?.decimals);

  // Calculate USD values
  const token0UsdValue = +token0Value * +(token0Price?.price || 0);
  const token1UsdValue = +token1Value * +(token1Price?.price || 0);
  const totalUsdValue = token0UsdValue + token1UsdValue;

  // Check if position is in range
  const isInRange =
    position.poolTick !== undefined &&
    position.poolTick >= position.tickLower &&
    position.poolTick <= position.tickUpper;

  return (
    <Box
      borderWidth="1px"
      borderRadius="lg"
      p={3}
      transition="all 0.2s"
      _hover={{ bg: isSelected ? "blue.50" : "gray.100" }}
      cursor="pointer"
      onClick={onSelect}
      bg={isSelected ? "blue.50" : "rgba(0, 0, 0, 0.02)"}
      borderColor={isSelected ? "blue.500" : "gray.200"}
    >
      <Flex justify="space-between" align="center" mb={2}>
        <Flex align="center" gap={2}>
          <Text fontSize="md" fontWeight="semibold">
            #{position.id}
          </Text>
          <Text fontSize="xs" color="gray.500">
            {position.fee / 10000}% fee
          </Text>
        </Flex>
      </Flex>

      <RangeIndicator
        isInRange={isInRange}
        currentTick={position.poolTick || 0}
        tickLower={position.tickLower}
        tickUpper={position.tickUpper}
        fee={position.fee}
      />

      <Flex justify="space-between" fontSize="sm" mb={1} mt={2}>
        <Flex gap={1}>
          <Text color="gray.600">{token0Symbol}</Text>
          <Text fontFamily="mono" fontSize="xs" color="gray.500">
            ({position.token0?.slice(0, 4)}...{position.token0?.slice(-2)})
          </Text>
        </Flex>
        <Flex direction="column" align="flex-end">
          <Text>{token0Value}</Text>
          <Text fontSize="xs" color="gray.500">
            ${token0UsdValue.toFixed(2)}
          </Text>
        </Flex>
      </Flex>

      <Flex justify="space-between" fontSize="sm" mb={1}>
        <Flex gap={1}>
          <Text color="gray.600">{token1Symbol}</Text>
          <Text fontFamily="mono" fontSize="xs" color="gray.500">
            ({position.token1?.slice(0, 4)}...{position.token1?.slice(-2)})
          </Text>
        </Flex>
        <Flex direction="column" align="flex-end">
          <Text>{token1Value}</Text>
          <Text fontSize="xs" color="gray.500">
            ${token1UsdValue.toFixed(2)}
          </Text>
        </Flex>
      </Flex>

      <Flex
        justify="space-between"
        fontSize="sm"
        mt={2}
        pt={2}
        borderTopWidth="1px"
      >
        <Flex align="center" gap={1}>
          <Text color="gray.600">Total:</Text>
          <Text fontWeight="bold">${totalUsdValue.toFixed(2)}</Text>
        </Flex>
      </Flex>
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
  const [sourceToken, setSourceToken] = useState<Address>(NativeToken);
  const [sourceValue, setSourceValue] = useState<string>("");
  const [sourceTokenData] = useEnsoToken({ address: sourceToken });

  const sourceAmount = denormalizeValue(sourceValue, sourceTokenData?.decimals);

  // Fetch positions using the subgraph
  const { data: positionsData, isLoading: isLoadingPositions } = useV3Positions(
    address,
    chainId,
  );

  // Convert subgraph data to Position interface
  const positions = useMemo(() => {
    if (!positionsData?.positions) return [];
    return positionsData.positions.map(convertSubgraphPosition);
  }, [positionsData]);

  // Get token price for SwapInput
  const { data: tokenPrice } = useEnsoPrice(sourceToken);
  const usdValue = tokenPrice
    ? parseFloat(sourceValue || "0") * +tokenPrice.price
    : 0;

  if (!address) {
    return (
      <Center h="70vh">
        <Box
          maxW="md"
          borderWidth="1px"
          borderRadius="xl"
          boxShadow="lg"
          bg="white"
          p={8}
        >
          <VStack textAlign="center" gap={6}>
            <Text color="gray.600">
              Please connect your wallet to view your Uniswap positions and
              access the migration tools.
            </Text>
            <ConnectButton />
          </VStack>
        </Box>
      </Center>
    );
  }

  return (
    <Center>
      <Flex>
        <Box p={6} w="450px">
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
            <Tabs.Content
              value="position"
              bg="rgba(0, 0, 0, 0.02)"
              borderRadius="lg"
              p={4}
            >
              <Heading as="h2" size="lg" mb={6}>
                Your Uniswap V3 Positions
              </Heading>
              {isLoadingPositions ? (
                <Text color="gray.600">Loading positions...</Text>
              ) : positions.length === 0 ? (
                <Text color="gray.600">You don't have any NFT positions</Text>
              ) : (
                <Box>
                  <VStack gap={4}>
                    {positions.map((position) => (
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
            <Tabs.Content
              value="token"
              bg="rgba(0, 0, 0, 0.02)"
              borderRadius="lg"
              p={4}
            >
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
