import {
  useV4UnichainPools,
  orderTokensAndAmounts,
  Position,
  roundTick,
  tickToPrice,
  priceToTick,
  calculateRangeWidth,
  isFullRange,
  TickMath,
  TICK_SPACINGS,
} from "../util/uniswap";
import { useState, useMemo, useEffect } from "react";
import TokenSelector from "../components/TokenSelector";
import {
  Flex,
  Box,
  VStack,
  Text,
  HStack,
  Button,
  Heading,
  Spinner,
  Link,
} from "@chakra-ui/react";
import { Address } from "viem";
import { Radio, RadioGroup } from "../components/ui/radio";
import { formatCompactUsd } from "../util";
import { BridgeBundleParams, useEnsoData, useEnsoToken } from "../util/enso";
import { useAccount, useChainId } from "wagmi";
import { usePriorityChainId } from "../util/common";
import { getV3PosManagerAddress } from "../util/uniswap";
import {
  useApproveIfNecessary,
  useNftApproveIfNecessary,
} from "../util/wallet";
import TickedPriceInput from "./TickedPriceInput";
import { DEFAULT_FEE_BPS } from "../constants";
import Slippage from "./Slippage";
import ChainSelector from "./ChainSelector";
import { SupportedChainId } from "../constants";
import { chai } from "globals";

const ROUTER_ADDRESS = "0xF75584eF6673aD213a685a1B58Cc0330B8eA22Cf";
// Default slippage in basis points (0.5%)
const DEFAULT_SLIPPAGE_BPS = 50;

interface TargetSectionProps {
  selectedPosition: Position | null;
  sourceToken?: Address;
  sourceAmount?: string;
  outChainId?: SupportedChainId;
  outTokens?: [Address, Address];
  poolFeeGrade?: number;
  ticks?: [number, number];
}

const TargetSection = ({
  selectedPosition,
  sourceToken,
  sourceAmount,
  outChainId,
  outTokens,
  poolFeeGrade,
  ticks,
}: TargetSectionProps) => {
  const [token0, setToken0] = useState<Address>();
  const [token1, setToken1] = useState<Address>();
  const [selectedPool, setSelectedPool] = useState<string>("");
  const [minTick, setMinTick] = useState<number>(0);
  const [maxTick, setMaxTick] = useState<number>(0);
  const [pricesInToken0, setPricesInToken0] = useState<boolean>(true);
  const [slippage, setSlippage] = useState<number>(DEFAULT_SLIPPAGE_BPS);
  const [targetChainId, setTargetChainId] = useState<SupportedChainId>();

  const chainId = usePriorityChainId();

  // Initialize with provided values if they exist
  useEffect(() => {
    if (outChainId) {
      setTargetChainId(outChainId);
    } else if (!targetChainId && chainId) setTargetChainId(chainId);
  }, [outChainId, chainId]);

  useEffect(() => {
    if (outTokens) {
      setToken0(outTokens[0]);
      setToken1(outTokens[1]);
    }
  }, [outTokens]);

  useEffect(() => {
    if (ticks) {
      setMinTick(ticks[0]);
      setMaxTick(ticks[1]);
    }
  }, [ticks]);

  const [token0Data] = useEnsoToken({
    address: token0,
    priorityChainId: targetChainId,
  });
  const [token1Data] = useEnsoToken({
    address: token1,
    priorityChainId: targetChainId,
  });

  // Color mode values
  const accentColor = "rgb(76, 130, 251)";
  const highlightBg = "blue.50";
  const selectedBg = "gray.100";

  // Use orderTokensAndAmounts to ensure tokens are in the correct order
  const { tokens, decimalsDiff } = useMemo(() => {
    if (!token0 || !token1)
      return { tokens: [undefined, undefined], decimalsDiff: 0 };

    // Use 0n as dummy amounts since we're only interested in token ordering
    const { tokens, inverted } = orderTokensAndAmounts(token0, token1, 0n, 0n);
    const decimalsDiff = inverted
      ? 10 ** (token1Data?.decimals - token0Data?.decimals)
      : 10 ** (token0Data?.decimals - token1Data?.decimals);

    return { tokens, decimalsDiff };
  }, [token0, token1, token0Data, token1Data]);

  // Pass the ordered tokens to the hook
  const { data, isLoading } = useV4UnichainPools(
    tokens[0] as Address | undefined,
    tokens[1] as Address | undefined,
    targetChainId
  );

  // When poolFee or poolFeeGrade is provided, automatically select the matching pool
  useEffect(() => {
    if (poolFeeGrade && data?.pools) {
      const matchingPool = data.pools.find(
        (p) => Number(p.feeTier) === poolFeeGrade
      );
      if (matchingPool) {
        setSelectedPool(matchingPool.id);
      }
    }
  }, [poolFeeGrade, data?.pools]);

  // Get the selected pool object
  const selectedPoolData = useMemo(() => {
    if (!data?.pools || !selectedPool) return null;
    return data.pools.find((pool) => pool.id === selectedPool) || null;
  }, [data?.pools, selectedPool]);

  // Get the appropriate tick spacing based on the selected pool's fee tier
  const tickSpacing = useMemo(() => {
    if (!selectedPoolData) return TICK_SPACINGS[3000]; // Default to 0.3% fee tier

    const feeTier = Number(selectedPoolData.feeTier);
    // Check if the fee tier exists in TICK_SPACINGS
    if (feeTier in TICK_SPACINGS) {
      return TICK_SPACINGS[feeTier as keyof typeof TICK_SPACINGS];
    }
    return TICK_SPACINGS[3000];
  }, [
    selectedPoolData?.feeTier,
    selectedPoolData?.token0,
    selectedPoolData?.token1,
  ]);

  // Get current tick from the pool
  const currentPoolTick = useMemo(() => {
    if (!selectedPoolData || !selectedPoolData.tick) return 0;
    return parseInt(selectedPoolData.tick);
  }, [selectedPoolData]);

  // Set price range based on percentage buttons - centered around current price
  const setPriceRange = (percentage: number) => {
    if (!selectedPoolData || ticks) return; // Don't change if ticks are locked

    if (percentage === 0) {
      // MIN range - very tight range around current price
      const currentTick = parseInt(selectedPoolData.tick);
      // Use small offsets from current tick
      setMinTick(roundTick(currentTick - tickSpacing, tickSpacing, false));
      setMaxTick(roundTick(currentTick + tickSpacing, tickSpacing, true));
    } else if (percentage === 100) {
      // FULL range
      setMinTick(
        roundTick(TickMath.MIN_TICK + tickSpacing, tickSpacing, false)
      );
      setMaxTick(roundTick(TickMath.MAX_TICK - tickSpacing, tickSpacing, true));
    } else {
      // Percentage range centered around current price
      const currentPrice = tickToPrice(parseInt(selectedPoolData.tick));
      const minPriceValue = currentPrice * (1 - percentage / 100);
      const maxPriceValue = currentPrice * (1 + percentage / 100);

      // Calculate ticks
      const newMinTick = priceToTick(minPriceValue, tickSpacing, false);
      const newMaxTick = priceToTick(maxPriceValue, tickSpacing, true);

      setMinTick(newMinTick);
      setMaxTick(newMaxTick);
    }
  };

  // Update price displays when pool changes
  useEffect(() => {
    if (selectedPoolData && !ticks) {
      // Set initial price range to full range if ticks aren't provided
      setPriceRange(100);
    }
  }, [selectedPoolData?.id, ticks]);

  useEffect(() => {
    if (!outTokens) {
      setSelectedPool("");
    }
  }, [token0, token1, targetChainId, outTokens]);

  const { address } = useAccount();
  const tokenIn = getV3PosManagerAddress(chainId);

  // Add token approval hook
  const tokenApproval = useApproveIfNecessary(
    sourceToken || "0x0000000000000000000000000000000000000000",
    ROUTER_ADDRESS,
    sourceAmount || "0"
  );

  // Add NFT position approval hook
  const nftApproval = useNftApproveIfNecessary(
    tokenIn,
    ROUTER_ADDRESS,
    selectedPosition?.id?.toString()
  );

  const ensoArgs: BridgeBundleParams = {
    //input position
    chainId,
    tokenIn: sourceToken || tokenIn,
    tokenId: selectedPosition?.id.toString(),
    ticks: [minTick, maxTick],
    tokenOut: selectedPosition
      ? [selectedPosition.token0, selectedPosition.token1]
      : undefined,
    liquidity: selectedPosition?.liquidity?.toString(),
    amountIn: sourceAmount,
    //output position
    token0,
    token1,
    poolFee: selectedPoolData?.feeTier.toString() || poolFeeGrade?.toString(),
    receiver: address,
    destinationChainId: targetChainId,
    slippageBps: slippage,
    feeBps: DEFAULT_FEE_BPS,
  };

  // Only call useEnsoData if we have valid tokens and a non-zero amount
  const ensoResult = useEnsoData(ensoArgs);

  // Get current display token symbols
  const baseToken = pricesInToken0 ? token0Data?.symbol : token1Data?.symbol;
  const quoteToken = pricesInToken0 ? token1Data?.symbol : token0Data?.symbol;

  // Check if position is approved for migration
  const isApproved = useMemo(() => {
    if (sourceToken) {
      // In token mode - check token approval
      return !tokenApproval;
    }

    // In position mode - check NFT approval
    return !nftApproval;
  }, [sourceToken, tokenApproval, nftApproval]);

  return (
    <Box minW="550px" maxW="700px" mx="auto" h="100%" m={6}>
      <Box
        bg="rgba(0, 0, 0, 0.02)"
        borderRadius="xl"
        border="1px"
        borderColor={"bg.emphasized"}
        overflow="hidden"
      >
        <Box p={6}>
          <Flex justify="center" align="center" mb={4}>
            <Heading as="h2" size="lg" fontWeight="semibold" mr={2}>
              Configure V4 Position on
            </Heading>
            <ChainSelector
              value={targetChainId}
              onChange={setTargetChainId}
              disabled={!!outChainId}
            />
          </Flex>

          <HStack gap={4} mt={4} mb={6}>
            <Box flex={1}>
              <TokenSelector
                value={token0}
                onChange={(value) => setToken0(value as Address)}
                chainId={targetChainId}
                obligatedToken={!!outTokens}
              />
            </Box>
            <Box flex={1}>
              <TokenSelector
                value={token1}
                onChange={(value) => setToken1(value as Address)}
                chainId={targetChainId}
                obligatedToken={!!outTokens}
              />
            </Box>
          </HStack>

          {token0 && token1 && isLoading && (
            <Flex justify="center" align="center" py={8}>
              <Spinner size="xl" color="blue.500" />
            </Flex>
          )}

          {data?.pools && data.pools.length > 0 ? (
            <>
              <Box mt={6} mb={4} p={1} borderRadius="lg" border="1px">
                <Text
                  fontWeight="bold"
                  mb={3}
                  fontSize="md"
                  color="gray.700"
                  px={2}
                >
                  Available Pools:
                </Text>
                <RadioGroup
                  value={selectedPool}
                  onValueChange={(details) =>
                    !poolFeeGrade && setSelectedPool(details.value)
                  }
                >
                  <HStack wrap="wrap" gap={0} justify="center" align="stretch">
                    {Object.entries(TICK_SPACINGS).map(([feeTier, spacing]) => {
                      const pool = data?.pools?.find(
                        (p) => p.feeTier === feeTier
                      );
                      const isDisabled =
                        !!poolFeeGrade && Number(feeTier) !== poolFeeGrade;

                      return (
                        <Box
                          key={feeTier}
                          py={2}
                          px={4}
                          mb={2}
                          mr={2}
                          borderRadius="lg"
                          borderWidth="1px"
                          borderColor={
                            pool && selectedPool === pool.id
                              ? accentColor
                              : "bg.emphasized"
                          }
                          bg={
                            pool && selectedPool === pool.id
                              ? highlightBg
                              : "transparent"
                          }
                          cursor={pool && !isDisabled ? "pointer" : "default"}
                          transition="all 0.2s"
                          _hover={{
                            bg:
                              pool && !isDisabled ? selectedBg : "transparent",
                          }}
                          onClick={() =>
                            pool && !isDisabled && setSelectedPool(pool.id)
                          }
                          opacity={pool && !isDisabled ? 1 : 0.7}
                        >
                          {pool ? (
                            <>
                              <Radio
                                value={pool.id}
                                display="none"
                                disabled={isDisabled}
                              >
                                <></>
                              </Radio>
                              <VStack gap={0} align="center">
                                <Text fontWeight="bold" fontSize="md">
                                  {(Number(feeTier) / 10000).toFixed(2)}%
                                </Text>
                                <Flex fontSize="sm" color="gray.500" gap={1}>
                                  TVL:{" "}
                                  <Text fontWeight="semibold">
                                    {formatCompactUsd(pool.totalValueLockedUSD)}
                                  </Text>
                                </Flex>
                              </VStack>
                            </>
                          ) : (
                            <VStack gap={0} align="center">
                              <Text fontWeight="bold" fontSize="md">
                                {(Number(feeTier) / 10000).toFixed(2)}%
                              </Text>
                              <Text fontSize="sm" color="gray.500">
                                N/A
                              </Text>
                            </VStack>
                          )}
                        </Box>
                      );
                    })}
                  </HStack>
                </RadioGroup>
              </Box>

              {selectedPool && (
                <>
                  <Box h="1px" bg="gray.200" my={4} />

                  <Box mt={4}>
                    <Flex justify="space-between" align="center" mb={4}>
                      <Text fontWeight="bold" fontSize="md">
                        Price Range
                      </Text>

                      {token0Data && token1Data && (
                        <Flex alignItems="center" p={1} borderRadius="full">
                          <Text fontSize="xs" mr={2} opacity={0.8}>
                            prices in
                          </Text>
                          <HStack gap={1}>
                            <Button
                              size="xs"
                              onClick={() => setPricesInToken0(true)}
                              borderRadius="full"
                              bg={pricesInToken0 ? accentColor : "transparent"}
                              color={pricesInToken0 ? "white" : "inherit"}
                              _hover={{
                                bg: pricesInToken0 ? accentColor : selectedBg,
                              }}
                              h="24px"
                              minW="40px"
                            >
                              {token0Data.symbol}
                            </Button>
                            <Button
                              size="xs"
                              bg={!pricesInToken0 ? accentColor : "transparent"}
                              color={!pricesInToken0 ? "white" : "inherit"}
                              _hover={{
                                bg: !pricesInToken0 ? accentColor : selectedBg,
                              }}
                              onClick={() => setPricesInToken0(false)}
                              borderRadius="full"
                              h="24px"
                              minW="40px"
                            >
                              {token1Data.symbol}
                            </Button>
                          </HStack>
                        </Flex>
                      )}
                    </Flex>

                    {selectedPoolData && (
                      <Box
                        p={3}
                        bg="rgba(0, 0, 0, 0.02)"
                        borderRadius="lg"
                        mb={4}
                      >
                        <Flex justify="space-between" align="center">
                          <Text fontWeight="medium" fontSize="sm">
                            Current Price
                          </Text>
                          <Text fontWeight="bold" fontSize="sm">
                            {pricesInToken0
                              ? (
                                  tickToPrice(currentPoolTick) * decimalsDiff
                                ).toFixed(8)
                              : (
                                  1 /
                                  (tickToPrice(currentPoolTick) * decimalsDiff)
                                ).toFixed(8)}{" "}
                            {baseToken}/{quoteToken}
                          </Text>
                        </Flex>
                        <Text fontSize="xs" color="gray.500" textAlign="right">
                          Tick: {currentPoolTick}
                        </Text>
                      </Box>
                    )}

                    <Flex gap={4} mb={4}>
                      <TickedPriceInput
                        label="Min"
                        tick={minTick}
                        tickSpacing={tickSpacing}
                        currentPoolTick={currentPoolTick}
                        pricesInToken0={pricesInToken0}
                        baseToken={baseToken}
                        quoteToken={quoteToken}
                        decimalsDiff={decimalsDiff}
                        onTickChange={(newTick) =>
                          !ticks && setMinTick(newTick)
                        }
                        showLowerPercent={true}
                      />

                      <TickedPriceInput
                        label="Max"
                        tick={maxTick}
                        tickSpacing={tickSpacing}
                        currentPoolTick={currentPoolTick}
                        pricesInToken0={pricesInToken0}
                        baseToken={baseToken}
                        quoteToken={quoteToken}
                        decimalsDiff={decimalsDiff}
                        onTickChange={(newTick) =>
                          !ticks && setMaxTick(newTick)
                        }
                      />
                    </Flex>

                    <Box
                      bg="rgba(0, 0, 0, 0.02)"
                      borderRadius="xl"
                      p={2}
                      mb={4}
                    >
                      <HStack justify="space-between" gap={1}>
                        {[
                          { label: "MIN", value: 0 },
                          { label: "1%", value: 1 },
                          { label: "5%", value: 5 },
                          { label: "10%", value: 10 },
                          { label: "20%", value: 20 },
                          { label: "FULL", value: 100 },
                        ].map((range) => (
                          <Button
                            key={range.label}
                            variant="outline"
                            size="sm"
                            onClick={() => setPriceRange(range.value)}
                            borderRadius="lg"
                            fontWeight="normal"
                            flex={1}
                            h="32px"
                            disabled={!!ticks}
                          >
                            {range.label}
                          </Button>
                        ))}
                      </HStack>
                    </Box>

                    {/* Show range width */}
                    <Box
                      bg="rgba(0, 0, 0, 0.02)"
                      py={2}
                      px={3}
                      borderRadius="md"
                      mb={4}
                    >
                      <Flex justify="center" align="center">
                        <Text fontSize="sm" fontWeight="medium">
                          Range width:{" "}
                          <Text as="span" fontWeight="bold">
                            {calculateRangeWidth(minTick, maxTick).toFixed(2)}%
                          </Text>
                          {isFullRange(minTick, maxTick, tickSpacing) && (
                            <Box
                              ml={2}
                              px={2}
                              py={0.5}
                              bg="green.100"
                              color="green.800"
                              borderRadius="md"
                              fontSize="xs"
                              display="inline-block"
                            >
                              Full Range
                            </Box>
                          )}
                        </Text>
                      </Flex>
                    </Box>
                  </Box>
                </>
              )}
            </>
          ) : (
            token0 &&
            token1 &&
            !isLoading && (
              <Box mt={4} p={4} borderRadius="md" bg="gray.50">
                <Text textAlign="center">
                  No pools found for selected tokens
                </Text>
              </Box>
            )
          )}

          <Flex justifyContent="center" mt={2}>
            <Slippage slippage={slippage} setSlippage={setSlippage} />
          </Flex>

          {/* Add Approval and Migrate buttons */}
          <Box
            mt={6}
            display="flex"
            justifyContent="center"
            gap={4}
            flexDirection="column"
            alignItems="center"
          >
            {selectedPosition && nftApproval && (
              <Button
                variant="subtle"
                w="full"
                colorPalette="green"
                size="lg"
                onClick={nftApproval.write}
                disabled={!selectedPosition}
                loading={nftApproval.isLoading}
                borderRadius="xl"
                h="56px"
                fontWeight="semibold"
              >
                Approve Position
              </Button>
            )}

            {sourceToken && tokenApproval && (
              <Button
                variant="subtle"
                w="full"
                colorPalette="green"
                size="lg"
                onClick={tokenApproval.write}
                disabled={!sourceToken || !sourceAmount || sourceAmount === "0"}
                loading={tokenApproval.isLoading}
                borderRadius="xl"
                h="56px"
                fontWeight="semibold"
              >
                Approve
              </Button>
            )}

            <Button
              w="full"
              colorPalette="blue"
              size="lg"
              loading={ensoResult.isLoading}
              onClick={ensoResult.sendTransaction?.send}
              disabled={
                !ensoResult.data.tx ||
                !ensoResult.sendTransaction?.send ||
                !isApproved
              }
              borderRadius="xl"
              h="56px"
              fontWeight="semibold"
              bg="#5D8EFA"
            >
              Migrate
            </Button>

            <Text fontSize="xs" textAlign="center" color="gray.500" mt={1}>
              Enso charges a {DEFAULT_FEE_BPS / 100}% fee for each migration.
            </Text>
            <Text fontSize="xs" textAlign="center" color="gray.500">
              Cross-chain operations may have a delay to arrive. You can track
              transtion progress at{" "}
              <Link
                href={`https://layerzeroscan.com/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                color="blue.500"
                _hover={{ textDecoration: "underline" }}
              >
                LayerZero Explorer
              </Link>
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default TargetSection;
