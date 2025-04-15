import {
  useV4UnichainPools,
  orderTokensAndAmounts,
  Position,
  v3FactoryAddresses,
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
} from "@chakra-ui/react";
import { Address } from "viem";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { TICK_SPACINGS, nearestUsableTick } from "@uniswap/v3-sdk";
import { formatCompactUsd, normalizeValue } from "@/util";
import { BridgeBundleParams, useEnsoData, useEnsoToken } from "@/util/enso";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { usePriorityChainId } from "@/util/common";
import { getPosManagerAddress } from "@/util/uniswap";
import { posManagerAbi } from "@/util/abis";
import { useExtendedContractWrite } from "@/util/wallet";
import { TickMath } from "@uniswap/v3-sdk";

// Define minimal Pool interface if not already defined elsewhere
interface PoolData {
  id: string;
  token0: { symbol: string };
  token1: { symbol: string };
  feeTier: string | number;
  tick: string;
  sqrtPrice: string;
}

interface TargetSectionProps {
  selectedPosition: Position | null;
}

const roundTick = (tick: number, tickSpacing: number, roundUp: boolean) => {
  if (roundUp) {
    return Math.ceil(tick / tickSpacing) * tickSpacing;
  } else {
    return Math.floor(tick / tickSpacing) * tickSpacing;
  }
};
console.log(TickMath.MIN_TICK);

const TargetSection = ({ selectedPosition }: TargetSectionProps) => {
  const [token0, setToken0] = useState<Address>();
  const [token1, setToken1] = useState<Address>();
  const [selectedPool, setSelectedPool] = useState<string>("");
  const [minTick, setMinTick] = useState<number>(0);
  const [maxTick, setMaxTick] = useState<number>(0);
  const [pricesInToken0, setPricesInToken0] = useState<boolean>(true);

  const [token0Data] = useEnsoToken({ address: token0, priorityChainId: 130 });
  const [token1Data] = useEnsoToken({ address: token1, priorityChainId: 130 });

  console.log("token0Data", token0Data, token0);
  console.log("token1Data", token1Data);

  // Use orderTokensAndAmounts to ensure tokens are in the correct order
  const { tokens, inverted } = useMemo(() => {
    if (!token0 || !token1)
      return { tokens: [undefined, undefined], inverted: false };

    // Use 0n as dummy amounts since we're only interested in token ordering
    const { tokens, inverted } = orderTokensAndAmounts(token0, token1, 0n, 0n);
    return { tokens, inverted };
  }, [token0, token1]);

  // Pass the ordered tokens to the hook
  const { data } = useV4UnichainPools(
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
    // Simplified conversion from tick to price for demonstration
    if (!selectedPoolData) return 1.0;
    return Math.pow(1.0001, currentPoolTick);
  }, [selectedPoolData, currentPoolTick]);
  //   console.log("tokendata", token0Data, token1Data);

  const decimalsDiff = inverted
    ? 10 ** (token1Data?.decimals - token0Data?.decimals)
    : 10 ** (token0Data?.decimals - token1Data?.decimals);

  console.log("decimalsDiff", decimalsDiff);

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
  const priceToTick = useCallback(
    (price: number, roundUp: boolean = false) => {
      if (!price || price <= 0) return 0;
      // Simplified conversion from price to tick for demonstration
      const rawTick = Math.log(price) / Math.log(1.0001);

      return roundUp
        ? roundTick(rawTick, tickSpacing, true)
        : roundTick(rawTick, tickSpacing, false);
    },
    [tickSpacing]
  );

  // Convert tick to price
  const tickToDisplayPrice = useCallback(
    (tick: number) => {
      // Simplified conversion from tick to price for demonstration
      const price = Math.pow(1.0001, tick);
      const normalizedPrice = normalizePrice(price);

      // Invert price if showing prices in token1
      return pricesInToken0 ? normalizedPrice : 1 / normalizedPrice;
    },
    [normalizePrice, pricesInToken0]
  );

  // Calculate percentage difference relative to current price, limited to +/-100%
  const calculatePricePercentage = useCallback(
    (price: number, currentPrice: number) => {
      if (!currentPrice) return "";
      const percentDiff = (price / currentPrice - 1) * 100;
      const limitedPercent = Math.max(Math.min(percentDiff, 100), -100);
      return `(${limitedPercent.toFixed(2)}%)`;
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

  // Handle price input changes by converting to ticks
  const handleMinPriceChange = (value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0) {
      let priceToConvert = numValue;

      // Convert from display price to internal price if needed
      if (!pricesInToken0) {
        priceToConvert = 1 / priceToConvert;
      }

      const newTick = priceToTick(normalizePrice(priceToConvert, true));
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

      const newTick = priceToTick(normalizePrice(priceToConvert, true));
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
      const newMinTick = priceToTick(minPriceValue);
      const newMaxTick = priceToTick(maxPriceValue, true);

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
      const newMinTick = priceToTick(minPriceValue);
      const newMaxTick = priceToTick(maxPriceValue, true);

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

  const ensoArgs: BridgeBundleParams = {
    //input position
    chainId,
    tokenIn,
    tokenId: selectedPosition?.id.toString(),
    ticks: [minTick, maxTick],
    tokenOut: selectedPosition
      ? [selectedPosition.token0, selectedPosition.token1]
      : undefined,
    liquidity: selectedPosition?.liquidity?.toString(),
    //output position
    token0: tokens[0] as Address,
    token1: tokens[1] as Address,
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
    if (!approvalData.data || !address) return false;
    return (
      approvalData.data.toLowerCase() ===
      "0xF75584eF6673aD213a685a1B58Cc0330B8eA22Cf".toLowerCase()
    );
  }, [approvalData.data, address]);

  const approveNft = useExtendedContractWrite("Approve Position", {
    address: tokenIn,
    abi: posManagerAbi,
    functionName: "approve",
    args: ["0xF75584eF6673aD213a685a1B58Cc0330B8eA22Cf", selectedPosition?.id],
  });

  console.log("approvalData", approvalData);

  return (
    <Box minW="550px" h="100%" mt={6}>
      <Heading as="h2" size="lg" mb={6}>
        Configurate migration
      </Heading>
      {selectedPosition && (
        <Box mb={4} p={3} borderWidth="1px" borderRadius="md" bgColor="blue.50">
          <Text fontWeight="bold">
            Selected Position #{selectedPosition?.id}
          </Text>
          <Text>Fee Tier: {selectedPosition?.fee / 10000}%</Text>
          <Text>
            Tick Range: [{selectedPosition?.tickLower}/
            {selectedPosition?.tickUpper}]
            <br />
            Position width:{" "}
            {Math.min(
              1.0001 **
                Math.abs(
                  selectedPosition?.tickLower - selectedPosition?.tickUpper
                ),
              100
            ).toFixed(2)}
            %
          </Text>
        </Box>
      )}

      <Flex gap={4} mt={4}>
        <TokenSelector
          value={token0}
          onChange={(value) => setToken0(value as Address)}
          chainId={130}
        />
        <TokenSelector
          value={token1}
          onChange={(value) => setToken1(value as Address)}
          chainId={130}
        />
      </Flex>

      {data?.pools && data.pools.length > 0 ? (
        <Box mt={6}>
          <Text fontWeight="bold" mb={2}>
            Available V4 Pools:
          </Text>
          <RadioGroup
            value={selectedPool}
            onValueChange={(details) => setSelectedPool(details.value)}
          >
            <VStack align="start" gap={2}>
              {data.pools.map((pool) => (
                <Radio key={pool.id} value={pool.id}>
                  <Box>
                    <Flex gap={2}>
                      <Text>
                        Fee: {(Number(pool.feeTier) / 10000).toFixed(2)}%
                      </Text>
                      <Text>
                        TVL: {formatCompactUsd(pool.totalValueLockedUSD)}
                      </Text>
                    </Flex>
                  </Box>
                </Radio>
              ))}
            </VStack>
          </RadioGroup>

          {selectedPool && (
            <Box mt={6}>
              <Flex alignItems="center" mb={2}>
                <Text fontWeight="bold" mr={2}>
                  Price Range:
                </Text>
                {token0Data && token1Data && (
                  <Flex alignItems="center" borderRadius="full" p={1}>
                    <Text fontSize="sm" mr={2}>
                      prices in
                    </Text>
                    <Button
                      size="sm"
                      onClick={() => setPricesInToken0(true)}
                      borderRadius="full"
                      mr={1}
                      variant={pricesInToken0 ? "solid" : "outline"}
                    >
                      {token0Data.symbol}
                    </Button>
                    <Button
                      size="sm"
                      variant={pricesInToken0 ? "outline" : "solid"}
                      onClick={() => setPricesInToken0(false)}
                      borderRadius="full"
                    >
                      {token1Data.symbol}
                    </Button>
                  </Flex>
                )}
              </Flex>
              {selectedPoolData && (
                <Text fontSize="sm" mb={2}>
                  Current Price:{" "}
                  {pricesInToken0
                    ? normalizePrice(currentPoolPrice).toFixed(8)
                    : (1 / normalizePrice(currentPoolPrice)).toFixed(8)}{" "}
                  {baseToken}/{quoteToken}
                  <br />
                  Tick: {currentPoolTick}
                </Text>
              )}
              <Flex gap={4} mb={4}>
                <Box flex={1}>
                  <Text mb={1}>Min Price</Text>
                  <Flex>
                    <Button
                      size="sm"
                      mr={1}
                      onClick={() => {
                        setMinTick(minTick - tickSpacing);
                      }}
                    >
                      -
                    </Button>
                    <Input
                      value={minPrice.toFixed(8)}
                      onChange={(e) => handleMinPriceChange(e.target.value)}
                      placeholder="0.0"
                    />
                    <Button
                      size="sm"
                      ml={1}
                      onClick={() => {
                        setMinTick(minTick + tickSpacing);
                      }}
                    >
                      +
                    </Button>
                  </Flex>
                  <Text fontSize="xs" mt={1}>
                    Tick: {minTick}{" "}
                    {currentPoolPrice
                      ? calculatePricePercentage(
                          minPrice,
                          pricesInToken0
                            ? normalizePrice(currentPoolPrice)
                            : 1 / normalizePrice(currentPoolPrice)
                        )
                      : ""}
                  </Text>
                </Box>

                <Box flex={1}>
                  <Text mb={1}>Max Price</Text>
                  <Flex>
                    <Button
                      size="sm"
                      mr={1}
                      onClick={() => {
                        setMaxTick(maxTick - tickSpacing);
                      }}
                    >
                      -
                    </Button>
                    <Input
                      value={maxPrice.toFixed(8)}
                      onChange={(e) => handleMaxPriceChange(e.target.value)}
                      placeholder="0.0"
                    />
                    <Button
                      size="sm"
                      ml={1}
                      onClick={() => {
                        setMaxTick(maxTick + tickSpacing);
                      }}
                    >
                      +
                    </Button>
                  </Flex>
                  <Text fontSize="xs" mt={1}>
                    Tick: {maxTick}{" "}
                    {currentPoolPrice
                      ? calculatePricePercentage(
                          maxPrice,
                          pricesInToken0
                            ? normalizePrice(currentPoolPrice)
                            : 1 / normalizePrice(currentPoolPrice)
                        )
                      : ""}
                  </Text>
                </Box>
              </Flex>

              <HStack mt={4} mb={6} gap={2}>
                <Button variant="outline" onClick={() => setPriceRange(0)}>
                  MIN
                </Button>
                <Button variant="outline" onClick={() => setPriceRange(1)}>
                  1%
                </Button>
                <Button variant="outline" onClick={() => setPriceRange(5)}>
                  5%
                </Button>
                <Button variant="outline" onClick={() => setPriceRange(10)}>
                  10%
                </Button>
                <Button variant="outline" onClick={() => setPriceRange(20)}>
                  20%
                </Button>
                <Button variant="outline" onClick={() => setPriceRange(100)}>
                  FULL
                </Button>
              </HStack>
            </Box>
          )}
        </Box>
      ) : (
        token0 &&
        token1 && <Text mt={4}>No pools found for selected tokens</Text>
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
            colorPalette="green"
            size="lg"
            onClick={approveNft.write}
            disabled={!selectedPosition}
            loading={approveNft.isLoading}
          >
            Approve Position
          </Button>
        )}

        <Button
          colorPalette="blue"
          size="lg"
          loading={ensoResult.isLoading}
          onClick={ensoResult.sendTransaction?.send}
          disabled={
            !ensoResult.data.tx ||
            !ensoResult.sendTransaction?.send ||
            !!ensoResult.sendTransaction.error ||
            !isApproved
          }
        >
          Migrate
        </Button>
      </Box>
    </Box>
  );
};

export default TargetSection;
