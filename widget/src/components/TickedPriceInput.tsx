import { Button, Flex, Text, Input, Box } from "@chakra-ui/react";
import { useDebounce } from "@uidotdev/usehooks";
import { useEffect, useMemo, useState } from "react";
import {
  calculatePricePercentage,
  priceToTick,
  tickToPrice,
} from "../util/uniswap";
import { formatPricePercentage } from "../util/uniswap";

// PriceInput component for unified min/max price input
interface TickedPriceInputProps {
  label: string;
  tick: number;
  tickSpacing: number;
  currentPoolTick: number;
  pricesInToken0: boolean;
  baseToken?: string;
  quoteToken?: string;
  decimalsDiff: number;
  onTickChange: (tick: number) => void;
  showLowerPercent?: boolean;
}

// Calculate percentage difference relative to current price, limited to +/-100%
const formattedPricePercentage = (price: number, currentPrice: number) => {
  if (!currentPrice) return "";
  const percentDiff = calculatePricePercentage(price, currentPrice);
  return percentDiff ? formatPricePercentage(percentDiff) : "";
};

const TickedPriceInput = ({
  label,
  tick: initialTick,
  tickSpacing,
  currentPoolTick,
  pricesInToken0,
  decimalsDiff,
  onTickChange,
  showLowerPercent = false,
}: TickedPriceInputProps) => {
  const [tick, setTick] = useState(initialTick);
  const debouncedTick = useDebounce(tick, 500);

  useEffect(() => {
    if (tick === debouncedTick || !tick) setTick(initialTick);
  }, [initialTick]);

  useEffect(() => {
    debouncedTick && onTickChange(debouncedTick);
  }, [debouncedTick]);

  // Input state management
  const [inputValue, setInputValue] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);

  // Calculate price from tick
  useEffect(() => {
    const rawPrice = tickToPrice(tick);
    const normalizedPrice = rawPrice * decimalsDiff;
    setInputValue(
      pricesInToken0
        ? normalizedPrice.toFixed(8)
        : (1 / normalizedPrice).toFixed(8)
    );
  }, [tick, decimalsDiff, pricesInToken0]);

  // Process input when user blurs input
  useEffect(() => {
    if (!isEditing) {
      const numValue = parseFloat(inputValue);
      if (!isNaN(numValue) && numValue > 0) {
        let priceToConvert = numValue;

        // Convert from display price to internal price if needed
        if (!pricesInToken0) {
          priceToConvert = 1 / priceToConvert;
        }

        // Convert to internal price format by reversing decimals normalization
        const denormalizedPrice = priceToConvert / decimalsDiff;

        // Convert to tick with appropriate rounding
        const newTick = priceToTick(
          denormalizedPrice,
          tickSpacing,
          !showLowerPercent
        );

        setTick(newTick);
      }
    }
  }, [isEditing]);

  // Calculate current pool price for comparison
  const currentPoolPrice = useMemo(() => {
    const rawPrice = tickToPrice(currentPoolTick);
    const normalizedPrice = rawPrice * decimalsDiff;
    return pricesInToken0 ? normalizedPrice : 1 / normalizedPrice;
  }, [currentPoolTick, decimalsDiff, pricesInToken0]);

  // Adjust the color based on whether this is min or max price and relation to current price
  const { percentColor, percentBg } = useMemo(() => {
    const isAboveCurrent = +inputValue > currentPoolPrice;
    const isBelowCurrent = +inputValue < currentPoolPrice;
    const percentColor = showLowerPercent
      ? isBelowCurrent
        ? "red.700"
        : "green.700"
      : isAboveCurrent
        ? "green.700"
        : "red.700";
    const percentBg = showLowerPercent
      ? isBelowCurrent
        ? "red.100"
        : "green.100"
      : isAboveCurrent
        ? "green.100"
        : "red.100";
    return { percentColor, percentBg };
  }, [showLowerPercent, inputValue, currentPoolPrice]);

  return (
    <Box flex={1}>
      <Text mb={1} fontSize="sm" fontWeight="medium">
        {label} Price
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
            setTick(tick - tickSpacing);
          }}
          borderRightRadius={0}
          variant="outline"
        >
          -
        </Button>
        <Input
          _focus={{
            boxShadow: "none",
            outline: "none",
            borderColor: "gray.200",
          }}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
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
            setTick(tick + tickSpacing);
          }}
          borderLeftRadius={0}
          variant="outline"
        >
          +
        </Button>
      </Flex>
      <Flex justify="space-between" mt={1}>
        <Text fontSize="xs" color="gray.500">
          Tick: {tick}
        </Text>
        {currentPoolPrice && (
          <Box
            px={1.5}
            py={0.5}
            fontSize="xs"
            fontWeight="medium"
            borderRadius="sm"
            bg={percentBg}
            color={percentColor}
          >
            {formattedPricePercentage(+inputValue, currentPoolPrice)}
          </Box>
        )}
      </Flex>
    </Box>
  );
};

export default TickedPriceInput;
