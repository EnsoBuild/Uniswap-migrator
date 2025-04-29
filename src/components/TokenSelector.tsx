import { useCallback, useState } from "react";
import {
  createListCollection,
  Flex,
  Input,
  Select,
  Text,
  useSelectContext,
} from "@chakra-ui/react";
import { useMemo } from "react";
import { Address, isAddress } from "viem";
import { FixedSizeList as List } from "react-window";
import { Token, useCurrentChainList } from "@/util/common";
import { formatNumber, normalizeValue } from "@/util";
import { useEnsoBalances, useEnsoToken } from "@/util/enso";
import { ETH_ADDRESS, SupportedChainId } from "@/constants";
import { TokenIndicator } from "@/components/TokenIndicator";
import { useColorModeValue } from "@/components/ui/color-mode";

type TokenWithBalance = Token & {
  balance?: string;
  costUsd?: number;
  apy?: number;
  tvl?: number;
  type: string;
};

const DetailedTokenIndicator = ({ token }: { token: TokenWithBalance }) => {
  const textColor = useColorModeValue("gray.400", "gray.500");

  return (
    <Flex align="center" w={"full"} justifyContent={"space-between"}>
      <TokenIndicator token={token} showName />

      <Flex flexDirection={"column"} alignItems={"flex-end"}>
        <Text
          color={textColor}
          textOverflow={"ellipsis"}
          whiteSpace={"nowrap"}
          overflow={"hidden"}
          maxWidth={"150px"}
          title={token.symbol}
        >
          {`${
            token.balance
              ? formatNumber(normalizeValue(token.balance, token.decimals))
              : ""
          } ${token.symbol}`}
        </Text>

        <Text ml={2} fontSize={"md"}>
          {token.costUsd ? `$${token.costUsd.toFixed(2)}` : ""}
        </Text>
      </Flex>
    </Flex>
  );
};

const hasCoincidence = (tokens: Token[], address: Address) =>
  tokens.findIndex(
    (token) =>
      token.address?.toLocaleLowerCase() === address?.toLocaleLowerCase()
  );

const SelectValue = () => {
  const select = useSelectContext();
  const token = select.selectedItems[0];

  return (
    <Select.ValueText
      placeholder="Select token"
      width={"fit-content"}
      maxWidth={"100%"}
    >
      {token ? (
        <TokenIndicator token={token} />
      ) : (
        <Text whiteSpace={"nowrap"}>Select token</Text>
      )}
    </Select.ValueText>
  );
};

const TokenSelector = ({
  value,
  onChange,
  obligatedToken,
  limitTokens,
  chainId,
}: {
  chainId?: SupportedChainId;
  value?: Address;
  onChange: (value: string) => void;
  portalRef?: React.RefObject<HTMLDivElement>;
  obligatedToken?: boolean;
  limitTokens?: Address[];
  protocol?: string;
}) => {
  const [searchText, setSearchText] = useState("");
  const { data: balances } = useEnsoBalances(chainId);
  const { data: currentChainTokenList } = useCurrentChainList(chainId);

  const searchAddress =
    currentChainTokenList?.length &&
    hasCoincidence(currentChainTokenList, searchText as Address) === -1 &&
    !limitTokens
      ? (searchText as Address)
      : undefined;
  const [searchedToken] = useEnsoToken({
    address: searchAddress,
    enabled: isAddress(searchAddress as Address),
  });
  const [valueToken] = useEnsoToken({
    address: value,
    enabled: isAddress(value as Address),
  });

  const tokenList = useMemo(() => {
    let tokens = currentChainTokenList ? currentChainTokenList.slice() : [];

    if (limitTokens) {
      tokens = tokens.filter((token) => limitTokens.includes(token.address));
    }

    if (searchedToken) {
      tokens = [...tokens, searchedToken];
    }
    if (valueToken) {
      tokens.splice(hasCoincidence(tokens, valueToken?.address), 1);
      tokens.unshift(valueToken);
    }

    const balancesWithTotals = tokens?.map((token) => {
      let balanceValue = balances?.find?.(
        (b: { token: string }) => b.token === token.address
      );

      // debank return ''arb" and "zksync" native token names instead of token address
      if (token.address === ETH_ADDRESS) {
        balanceValue = balances?.find?.(
          ({ token }: { token: string }) =>
            token && !isAddress(token as Address)
        );
      }

      // cut scientific notation
      const balance = Number(balanceValue?.amount).toLocaleString("fullwide", {
        useGrouping: false,
      });

      return balanceValue
        ? {
            ...token,
            balance,
            costUsd:
              +normalizeValue(balance, balanceValue?.decimals) *
              +balanceValue?.price,
          }
        : token;
    });

    //sort by costUsd
    // @ts-ignore
    balancesWithTotals.sort((a: TokenWithBalance, b: TokenWithBalance) => {
      return (b.costUsd ?? 0) - (a.costUsd ?? 0);
    });

    return balancesWithTotals;
  }, [balances, currentChainTokenList, searchedToken, valueToken]);

  const tokenOptions = useMemo(() => {
    let items = tokenList;

    if (searchText) {
      const search = searchText.toLocaleLowerCase();

      items = tokenList.filter((token) =>
        [token.symbol, token.name, token.address].some((val) =>
          val.toLocaleLowerCase().includes(search)
        )
      );
    }

    return createListCollection({
      items,
      itemToValue: (item) => item.address,
      itemToString: (item) => item.symbol,
    });
  }, [tokenList, searchText]);

  const onValueChange = useCallback(
    ({ value }: { value: string[] }) => {
      onChange(value[0] as string);
    },
    [onChange]
  );
  const selectValue = useMemo(() => [value], [value]);

  return (
    <Select.Root
      disabled={!!obligatedToken}
      collection={tokenOptions}
      value={selectValue as string[]}
      onValueChange={onValueChange}
      size="lg"
      w={"fit-content"}
      borderRadius={"xl"}
      transition="all 0.2s ease-in-out"
    >
      <Select.Trigger
        borderRadius={"lg"}
        minWidth={"150px"}
        cursor={"pointer"}
        transition="all 0.2s ease-in-out"
        _hover={{
          bg: "rgba(255, 255, 255, 0.02)",
        }}
      >
        <SelectValue />
      </Select.Trigger>

      <Select.Positioner>
        <Select.Content w={"100%"} minWidth={"300px"} minHeight={"425px"}>
          <Flex
            height={"100%"}
            flexDirection={"column"}
            gap={2}
            p={2}
            width={"100%"}
          >
            <Input
              autoFocus
              paddingX={2}
              placeholder="Search by name or paste address"
              value={searchText}
              onChange={(e) => obligatedToken || setSearchText(e.target.value)}
              _focus={{ boxShadow: "none", outline: "none" }}
            />

            <List
              height={350}
              itemCount={tokenOptions.items.length}
              itemSize={48}
              width={"100%"}
            >
              {({
                index,
                style,
              }: {
                index: number;
                style: React.CSSProperties;
              }) => {
                const token = tokenOptions.items[index];

                return (
                  <Select.Item
                    item={token}
                    key={token.address}
                    style={style}
                    borderRadius={"md"}
                  >
                    <DetailedTokenIndicator token={token as TokenWithBalance} />
                  </Select.Item>
                );
              }}
            </List>
          </Flex>
        </Select.Content>
      </Select.Positioner>
    </Select.Root>
  );
};

export default TokenSelector;
