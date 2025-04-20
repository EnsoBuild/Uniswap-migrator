import {
  useV4UnichainPools,
  orderTokensAndAmounts,
  Position,
  roundTick,
  tickToPrice,
  priceToTick,
  calculatePricePercentage,
  formatPricePercentage,
  calculateRangeWidth,
  isFullRange,
  TickMath,
  TICK_SPACINGS,
} from "@/util/uniswap";
import { useState, useMemo, useCallback, useEffect } from "react";
import TokenSelector from "@/components/TokenSelector";
import {
  Flex,
  Box,
  VStack,
  Text,
  HStack,
  Button,
  Input,
  Heading,
  Spinner,
} from "@chakra-ui/react";
import { Address } from "viem";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { formatCompactUsd } from "@/util";
import { BridgeBundleParams, useEnsoData, useEnsoToken } from "@/util/enso";
import { useAccount, useReadContract } from "wagmi";
import { usePriorityChainId } from "@/util/common";
import { getPosManagerAddress } from "@/util/uniswap";
import { posManagerAbi } from "@/util/abis";
import { useExtendedContractWrite, useApproveIfNecessary } from "@/util/wallet";

const ROUTER_ADDRESS = "0xF75584eF6673aD213a685a1B58Cc0330B8eA22Cf";

interface TargetSectionProps {
  selectedPosition: Position | null;
  sourceToken?: Address;
  sourceAmount?: string;
}

const TargetSection = ({
  selectedPosition,
  sourceToken,
  sourceAmount,
}: TargetSectionProps) => {
  const [token0, setToken0] = useState<Address>();
  const [token1, setToken1] = useState<Address>();
  const [selectedPool, setSelectedPool] = useState<string>("");
  const [minTick, setMinTick] = useState<number>(0);
  const [maxTick, setMaxTick] = useState<number>(0);
  const [pricesInToken0, setPricesInToken0] = useState<boolean>(true);

  const [token0Data] = useEnsoToken({ address: token0, priorityChainId: 130 });
  const [token1Data] = useEnsoToken({ address: token1, priorityChainId: 130 });

  // Color mode values
  const borderColor = "gray.200";
  const accentColor = "rgb(76, 130, 251)";
  const highlightBg = "blue.50";
  const selectedBg = "gray.100";

  // Use orderTokensAndAmounts to ensure tokens are in the correct order
  const { tokens, inverted } = useMemo(() => {
    if (!token0 || !token1)
      return { tokens: [undefined, undefined], inverted: false };

    // Use 0n as dummy amounts since we're only interested in token ordering
    const { tokens, inverted } = orderTokensAndAmounts(token0, token1, 0n, 0n);
    return { tokens, inverted };
  }, [token0, token1]);

  // Pass the ordered tokens to the hook
  const { data, isLoading } = useV4UnichainPools(
    tokens[0] as Address | undefined,
    tokens[1] as Address | undefined
  );

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
  }, [selectedPoolData]);

  // Get current tick and price from the pool
  const currentPoolTick = useMemo(() => {
    if (!selectedPoolData || !selectedPoolData.tick) return 0;
    return parseInt(selectedPoolData.tick);
  }, [selectedPoolData]);

  // Calculate current price from the pool's current tick
  const currentPoolPrice = useMemo(() => {
    // Use the imported tickToPrice function
    if (!selectedPoolData) return 1.0;
    return tickToPrice(currentPoolTick);
  }, [selectedPoolData, currentPoolTick]);

  const decimalsDiff = inverted
    ? 10 ** (token1Data?.decimals - token0Data?.decimals)
    : 10 ** (token0Data?.decimals - token1Data?.decimals);

  const normalizePrice = useCallback(
    (price: number, back = false) => {
      if (back) {
        return price / decimalsDiff;
      }
      return price * decimalsDiff;
    },
    [decimalsDiff]
  );

  // Convert price to tick with rounding to the nearest tick spacing
  const handlePriceToTick = useCallback(
    (price: number, roundUp: boolean = false) => {
      if (!price || price <= 0) return 0;
      // Use the imported priceToTick function
      return priceToTick(price, tickSpacing, roundUp);
    },
    [tickSpacing]
  );

  // Convert tick to price
  const tickToDisplayPrice = useCallback(
    (tick: number) => {
      // Use the imported tickToPrice function
      const price = tickToPrice(tick);
      const normalizedPrice = normalizePrice(price);

      // Invert price if showing prices in token1
      return pricesInToken0 ? normalizedPrice : 1 / normalizedPrice;
    },
    [normalizePrice, pricesInToken0]
  );

  // Calculate percentage difference relative to current price, limited to +/-100%
  const getFormattedPricePercentage = useCallback(
    (price: number, currentPrice: number) => {
      if (!currentPrice) return "";
      // Use the common calculation functions
      const percentDiff = calculatePricePercentage(price, currentPrice);
      return percentDiff ? formatPricePercentage(percentDiff) : "";
    },
    []
  );

  // Compute min and max price from ticks
  const minPrice = useMemo(
    () => tickToDisplayPrice(minTick),
    [minTick, tickToDisplayPrice]
  );
  const maxPrice = useMemo(
    () => tickToDisplayPrice(maxTick),
    [maxTick, tickToDisplayPrice]
  );

  // Handle psrice input changes by converting to ticks
  const handleMinPriceChange = (value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0) {
      let priceToConvert = numValue;

      // Convert from display price to internal price if needed
      if (!pricesInToken0) {
        priceToConvert = 1 / priceToConvert;
      }

      const newTick = handlePriceToTick(normalizePrice(priceToConvert, true));
      setMinTick(newTick);
    }
  };

  const handleMaxPriceChange = (value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0) {
      let priceToConvert = numValue;

      // Convert from display price to internal price if needed
      if (!pricesInToken0) {
        priceToConvert = 1 / priceToConvert;
      }

      const newTick = handlePriceToTick(normalizePrice(priceToConvert, true));
      setMaxTick(newTick);
    }
  };

  // Set price range based on percentage buttons - centered around current price
  const setPriceRange = (percentage: number) => {
    if (!selectedPoolData) return;

    if (percentage === 0) {
      // MIN range - very tight range around current price
      const minPriceValue = currentPoolPrice * 0.9999;
      const maxPriceValue = currentPoolPrice * 1.0001;

      // Calculate ticks centered around the current pool tick
      const newMinTick = handlePriceToTick(minPriceValue);
      const newMaxTick = handlePriceToTick(maxPriceValue, true);

      setMinTick(newMinTick);
      setMaxTick(newMaxTick);
    } else if (percentage === 100) {
      // FULL range
      setMinTick(
        roundTick(TickMath.MIN_TICK + tickSpacing, tickSpacing, false)
      );
      setMaxTick(roundTick(TickMath.MAX_TICK - tickSpacing, tickSpacing, true));
    } else {
      // Percentage range centered around current price
      const minPriceValue = currentPoolPrice * (1 - percentage / 100);
      const maxPriceValue = currentPoolPrice * (1 + percentage / 100);

      // Calculate ticks
      const newMinTick = handlePriceToTick(minPriceValue);
      const newMaxTick = handlePriceToTick(maxPriceValue, true);

      setMinTick(newMinTick);
      setMaxTick(newMaxTick);
    }
  };

  // Update price displays when pool changes
  useEffect(() => {
    if (selectedPoolData) {
      // Set initial price range to full range
      setPriceRange(100);
    }
  }, [selectedPoolData]);

  useEffect(() => {
    setSelectedPool("");
  }, [token0, token1]);

  const { address } = useAccount();
  const chainId = usePriorityChainId();
  const tokenIn = getPosManagerAddress(chainId);

  // Add token approval hook
  const tokenApproval = useApproveIfNecessary(
    sourceToken || "0x0000000000000000000000000000000000000000",
    ROUTER_ADDRESS,
    sourceAmount || "0"
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
    poolFee: selectedPoolData?.feeTier.toString(),
    receiver: address,
    destinationChainId: 130,
  };

  // Only call useEnsoData if we have valid tokens and a non-zero amount
  const ensoResult = useEnsoData(ensoArgs);

  // Get current display token symbols
  const baseToken = pricesInToken0 ? token0Data?.symbol : token1Data?.symbol;
  const quoteToken = pricesInToken0 ? token1Data?.symbol : token0Data?.symbol;

  const approvalData = useReadContract({
    address: tokenIn,
    abi: posManagerAbi,
    functionName: "getApproved",
    args: [selectedPosition?.id ? BigInt(selectedPosition.id) : undefined],
  });

  // Check if position is approved for migration
  const isApproved = useMemo(() => {
    if (sourceToken) {
      // In token mode - check token approval
      return !tokenApproval;
    }

    // In position mode - check NFT approval
    if (!approvalData.data || !address) return false;
    return approvalData.data.toLowerCase() === ROUTER_ADDRESS.toLowerCase();
  }, [approvalData.data, address, sourceToken, tokenApproval]);

  const approveNft = useExtendedContractWrite("Approve Position", {
    address: tokenIn,
    abi: posManagerAbi,
    functionName: "approve",
    args: [ROUTER_ADDRESS, selectedPosition?.id],
  });

  return (
    <Box minW="550px" maxW="700px" mx="auto" h="100%" mt={6}>
      <Box
        bg="rgba(0, 0, 0, 0.02)"
        borderRadius="xl"
        border="1px"
        borderColor={borderColor}
        overflow="hidden"
      >
        <Box p={6}>
          <Heading
            as="h2"
            size="lg"
            mb={4}
            textAlign="center"
            fontWeight="semibold"
          >
            Configure V4 Position on Unichain
          </Heading>

          <HStack gap={4} mt={4} mb={6}>
            <Box flex={1}>
              <TokenSelector
                value={token0}
                onChange={(value) => setToken0(value as Address)}
                chainId={130}
              />
            </Box>
            <Box flex={1}>
              <TokenSelector
                value={token1}
                onChange={(value) => setToken1(value as Address)}
                chainId={130}
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
                  onValueChange={(details) => setSelectedPool(details.value)}
                >
                  <HStack wrap="wrap" gap={0} justify="center" align="stretch">
                    {Object.entries(TICK_SPACINGS).map(([feeTier, spacing]) => {
                      const pool = data?.pools?.find(
                        (p) => p.feeTier === feeTier
                      );

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
                              : borderColor
                          }
                          bg={
                            pool && selectedPool === pool.id
                              ? highlightBg
                              : "transparent"
                          }
                          cursor={pool ? "pointer" : "default"}
                          transition="all 0.2s"
                          _hover={{ bg: pool ? selectedBg : "transparent" }}
                          onClick={() => pool && setSelectedPool(pool.id)}
                          opacity={pool ? 1 : 0.7}
                        >
                          {pool ? (
                            <>
                              <Radio value={pool.id} display="none">
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
                              ? normalizePrice(currentPoolPrice).toFixed(8)
                              : (1 / normalizePrice(currentPoolPrice)).toFixed(
                                  8
                                )}{" "}
                            {baseToken}/{quoteToken}
                          </Text>
                        </Flex>
                        <Text fontSize="xs" color="gray.500" textAlign="right">
                          Tick: {currentPoolTick}
                        </Text>
                      </Box>
                    )}

                    <Flex gap={4} mb={4}>
                      <Box flex={1}>
                        <Text mb={1} fontSize="sm" fontWeight="medium">
                          Min Price
                        </Text>
                        <Flex position="relative">
                          <Button
                            size="sm"
                            position="absolute"
                            left={0}
                            top="0"
                            zIndex={2}
                            h="40px"
                            onClick={() => {
                              setMinTick(minTick - tickSpacing);
                            }}
                            borderRightRadius={0}
                            variant="outline"
                          >
                            -
                          </Button>
                          <Input
                            value={minPrice.toFixed(8)}
                            onChange={(e) =>
                              handleMinPriceChange(e.target.value)
                            }
                            placeholder="0.0"
                            pl="36px"
                            pr="36px"
                            borderRadius="lg"
                            h="40px"
                            textAlign="center"
                          />
                          <Button
                            size="sm"
                            position="absolute"
                            right={0}
                            top="0"
                            zIndex={2}
                            h="40px"
                            onClick={() => {
                              setMinTick(minTick + tickSpacing);
                            }}
                            borderLeftRadius={0}
                            variant="outline"
                          >
                            +
                          </Button>
                        </Flex>
                        <Flex justify="space-between" mt={1}>
                          <Text fontSize="xs" color="gray.500">
                            Tick: {minTick}
                          </Text>
                          {currentPoolPrice && (
                            <Box
                              px={1.5}
                              py={0.5}
                              fontSize="xs"
                              fontWeight="medium"
                              borderRadius="sm"
                              bg={
                                minPrice <
                                (pricesInToken0
                                  ? normalizePrice(currentPoolPrice)
                                  : 1 / normalizePrice(currentPoolPrice))
                                  ? "red.100"
                                  : "green.100"
                              }
                              color={
                                minPrice <
                                (pricesInToken0
                                  ? normalizePrice(currentPoolPrice)
                                  : 1 / normalizePrice(currentPoolPrice))
                                  ? "red.700"
                                  : "green.700"
                              }
                            >
                              {getFormattedPricePercentage(
                                minPrice,
                                pricesInToken0
                                  ? normalizePrice(currentPoolPrice)
                                  : 1 / normalizePrice(currentPoolPrice)
                              )}
                            </Box>
                          )}
                        </Flex>
                      </Box>

                      <Box flex={1}>
                        <Text mb={1} fontSize="sm" fontWeight="medium">
                          Max Price
                        </Text>
                        <Flex position="relative">
                          <Button
                            size="sm"
                            position="absolute"
                            left={0}
                            top="0"
                            zIndex={2}
                            h="40px"
                            onClick={() => {
                              setMaxTick(maxTick - tickSpacing);
                            }}
                            borderRightRadius={0}
                            variant="outline"
                          >
                            -
                          </Button>
                          <Input
                            value={maxPrice.toFixed(8)}
                            onChange={(e) =>
                              handleMaxPriceChange(e.target.value)
                            }
                            placeholder="0.0"
                            pl="36px"
                            pr="36px"
                            borderRadius="lg"
                            h="40px"
                            textAlign="center"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            position="absolute"
                            right={0}
                            top="0"
                            zIndex={2}
                            h="40px"
                            onClick={() => {
                              setMaxTick(maxTick + tickSpacing);
                            }}
                            borderLeftRadius={0}
                          >
                            +
                          </Button>
                        </Flex>
                        <Flex justify="space-between" mt={1}>
                          <Text fontSize="xs" color="gray.500">
                            Tick: {maxTick}
                          </Text>
                          {currentPoolPrice && (
                            <Box
                              px={1.5}
                              py={0.5}
                              fontSize="xs"
                              fontWeight="medium"
                              borderRadius="sm"
                              bg={
                                maxPrice >
                                (pricesInToken0
                                  ? normalizePrice(currentPoolPrice)
                                  : 1 / normalizePrice(currentPoolPrice))
                                  ? "green.100"
                                  : "red.100"
                              }
                              color={
                                maxPrice >
                                (pricesInToken0
                                  ? normalizePrice(currentPoolPrice)
                                  : 1 / normalizePrice(currentPoolPrice))
                                  ? "green.700"
                                  : "red.700"
                              }
                            >
                              {getFormattedPricePercentage(
                                maxPrice,
                                pricesInToken0
                                  ? normalizePrice(currentPoolPrice)
                                  : 1 / normalizePrice(currentPoolPrice)
                              )}
                            </Box>
                          )}
                        </Flex>
                      </Box>
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
                        ].map((range, index) => (
                          <Button
                            key={range.label}
                            variant="outline"
                            size="sm"
                            onClick={() => setPriceRange(range.value)}
                            borderRadius="lg"
                            fontWeight="normal"
                            // colorPalette="blue"
                            flex={1}
                            h="32px"
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
            token1 && (
              <Box mt={4} p={4} borderRadius="md" bg="gray.50">
                <Text textAlign="center">
                  No pools found for selected tokens
                </Text>
              </Box>
            )
          )}

          {/* Add Approval and Migrate buttons */}
          <Box
            mt={6}
            display="flex"
            justifyContent="center"
            gap={4}
            flexDirection="column"
            alignItems="center"
          >
            {selectedPosition && !isApproved && (
              <Button
                variant="subtle"
                w="full"
                colorPalette="green"
                size="lg"
                onClick={approveNft.write}
                disabled={!selectedPosition}
                loading={approveNft.isLoading}
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
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default TargetSection;
