import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  useBalance,
  useReadContract,
  useSendTransaction,
  UseSendTransactionReturnType,
  UseSimulateContractParameters,
  useWaitForTransactionReceipt,
  useWriteContract,
  UseWriteContractReturnType,
} from "wagmi";
import { Address, BaseError, erc20Abi } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import {
  useEtherscanUrl,
  usePriorityChainId,
  useTokenFromList,
} from "./common";
import { ETH_ADDRESS } from "@/constants";
import { formatNumber, normalizeValue } from "@/util/index";
import { toaster } from "@/components/ui/toaster";
import { posManagerAbi } from "@/util/abis";

enum TxState {
  Success,
  Failure,
  Pending,
}

export const toastState: Record<TxState, "success" | "error" | "info"> = {
  [TxState.Success]: "success",
  [TxState.Failure]: "error",
  [TxState.Pending]: "info",
};

const useInterval = (callback: () => void, interval: number) => {
  const savedCallback = useCallback(callback, []);

  useEffect(() => {
    const id = setInterval(savedCallback, interval);
    return () => clearInterval(id);
  }, [interval, savedCallback]);
};
const useChangingIndex = () => {
  const [index, setIndex] = useState(0);

  useInterval(() => {
    setIndex(index + 1);
  }, 6000);

  return index;
};

export const useErc20Balance = (tokenAddress: `0x${string}`) => {
  const { address } = useAccount();
  const chainId = usePriorityChainId();

  return useReadContract({
    chainId,
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address!],
  });
};

// if token is native ETH, use usBalance instead
export const useTokenBalance = (token: Address) => {
  const { address } = useAccount();
  const chainId = usePriorityChainId();
  const index = useChangingIndex();
  const queryClient = useQueryClient();
  const { data: erc20Balance, queryKey: erc20QueryKey } =
    useErc20Balance(token);
  const { data: balance, queryKey: balanceQueryKey } = useBalance({
    address,
    chainId,
  });

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: erc20QueryKey });
    queryClient.invalidateQueries({ queryKey: balanceQueryKey });
  }, [index, queryClient, erc20QueryKey, balanceQueryKey]);

  const value = token === ETH_ADDRESS ? balance?.value : erc20Balance;

  return value?.toString() ?? "0";
};

export const useAllowance = (token: Address, spender: Address) => {
  const { address } = useAccount();
  const chainId = usePriorityChainId();
  const index = useChangingIndex();
  const queryClient = useQueryClient();
  const { data, queryKey } = useReadContract({
    chainId,
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address!, spender],
  });

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [index, queryClient, queryKey]);

  return data?.toString() ?? "0";
};

export const useApprove = (token: Address, target: Address, amount: string) => {
  const tokenData = useTokenFromList(token);
  const chainId = usePriorityChainId();

  return {
    title: `Approve ${formatNumber(normalizeValue(amount, tokenData?.decimals))} of ${tokenData?.symbol} for spending`,
    args: {
      chainId,
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [target, amount],
    },
  };
};

export const useNftAllowance = (
  tokenAddress: Address,
  tokenId: string,
) => {
  const chainId = usePriorityChainId();
  const index = useChangingIndex();
  const queryClient = useQueryClient();
  const { data, queryKey } = useReadContract({
    chainId,
    address: tokenAddress,
    abi: posManagerAbi,
    functionName: "getApproved",
    args: [tokenId ? BigInt(tokenId) : undefined],
  });

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [index, queryClient, queryKey]);

  // Return the approved address, which can be compared with the spender
  return data?.toString() ?? "0x0";
};

export const useNftApprove = (
  tokenAddress: Address,
  target: Address,
  tokenId: string
) => {
  const chainId = usePriorityChainId();

  return {
    title: `Approve Position #${tokenId} for migration`,
    args: {
      chainId,
      address: tokenAddress,
      abi: posManagerAbi,
      functionName: "approve",
      args: [target, tokenId ? BigInt(tokenId) : undefined],
    },
  };
};

export const useExtendedContractWrite = (
  title: string,
  writeContractVariables: UseSimulateContractParameters
) => {
  const contractWrite = useWatchWriteTransactionHash(title);

  const write = useCallback(() => {
    if (
      writeContractVariables.address &&
      writeContractVariables.abi &&
      writeContractVariables.functionName
    ) {
      // @ts-ignore
      contractWrite.writeContract(writeContractVariables, {
        onError: (error: BaseError) => {
          toaster.create({
            title: "Error",
            description: error?.shortMessage || error.message,
            type: "error",
          });
          console.error(error);
        },
      });
    }
  }, [contractWrite, writeContractVariables]);

  return {
    ...contractWrite,
    write,
  };
};

const useWatchTransactionHash = <
  T extends UseSendTransactionReturnType | UseWriteContractReturnType,
>(
  description: string,
  usedWriteContract: T
) => {
  // const addRecentTransaction = useAddRecentTransaction();
  const [loadingToastId, setLoadingToastId] = useState<string | undefined>(
    undefined
  );

  const { data: hash, reset } = usedWriteContract;

  // useEffect(() => {
  //   if (hash) addRecentTransaction({ hash, description });
  // }, [hash]);

  const waitForTransaction = useWaitForTransactionReceipt({
    hash,
  });
  const link = useEtherscanUrl(hash);

  // console.log(description,link)

  const writeLoading = usedWriteContract.status === "pending";

  // toast error if tx failed to be mined and success if it is having confirmation
  useEffect(() => {
    if (waitForTransaction.error) {
      // Close loading toast if it exists
      if (loadingToastId) {
        toaster.remove(loadingToastId);
        setLoadingToastId(undefined);
      }
      toaster.create({
        title: "Error",
        description: waitForTransaction.error.message,
        type: "error",
        action: link
          ? {
              label: "View on Explorer",
              onClick: () => window.open(link, "_blank"),
            }
          : undefined,
      });
    } else if (waitForTransaction.data) {
      // Close loading toast if it exists
      if (loadingToastId) {
        toaster.remove(loadingToastId);
        setLoadingToastId(undefined);
      }

      // reset tx hash to eliminate recurring notifications
      reset();

      toaster.create({
        title: "Success",
        description: description,
        type: "success",
        action: link
          ? {
              label: "View on Explorer",
              onClick: () => window.open(link, "_blank"),
            }
          : undefined,
      });
    } else if (waitForTransaction.isLoading) {
      const id = toaster.create({
        title: "Transaction Pending",
        description: description,
        type: "loading",
        action: link
          ? {
              label: "View on Explorer",
              onClick: () => window.open(link, "_blank"),
            }
          : undefined,
      });
      setLoadingToastId(id);
    }
  }, [
    waitForTransaction.data,
    waitForTransaction.error,
    waitForTransaction.isLoading,
    description,
    link,
    reset,
  ]);

  return {
    ...usedWriteContract,
    isLoading: writeLoading || waitForTransaction.isLoading,
    walletLoading: writeLoading,
    txLoading: waitForTransaction.isLoading,
    waitData: waitForTransaction.data,
  };
};

export const useWatchSendTransactionHash = (title: string) => {
  const sendTransaction = useSendTransaction();

  return useWatchTransactionHash(title, sendTransaction);
};

const useWatchWriteTransactionHash = (description: string) => {
  const writeContract = useWriteContract();

  return useWatchTransactionHash(description, writeContract);
};

export const useExtendedSendTransaction = (
  title: string,
  args: UseSimulateContractParameters
) => {
  const sendTransaction = useWatchSendTransactionHash(title);

  const send = useCallback(() => {
    sendTransaction.sendTransaction(args, {
      onError: (error) => {
        toaster.create({
          title: "Error",
          // @ts-ignore
          description: error?.cause?.shortMessage || error.message,
          type: "error",
        });
        console.error(error);
      },
    });
  }, [sendTransaction, args]);

  return {
    ...sendTransaction,
    send,
  };
};

export const useApproveIfNecessary = (
  tokenIn: Address,
  target: Address,
  amount: string
) => {
  const allowance = useAllowance(tokenIn, target);
  const approveData = useApprove(tokenIn, target, amount);
  const writeApprove = useExtendedContractWrite(
    approveData.title,
    approveData.args as unknown as UseSimulateContractParameters
  );

  if (tokenIn === ETH_ADDRESS) return undefined;

  return +allowance < +amount ? writeApprove : undefined;
};

export const useNftApproveIfNecessary = (
  tokenAddress: Address,
  target: Address,
  tokenId: string
) => {
  const allowance = useNftAllowance(tokenAddress, tokenId);
  const approveData = useNftApprove(tokenAddress, target, tokenId);
  const writeApprove = useExtendedContractWrite(
    approveData.title,
    approveData.args as unknown as UseSimulateContractParameters
  );

  if (!tokenId) return undefined;

  return allowance.toLowerCase() !== target.toLowerCase()
    ? writeApprove
    : undefined;
};

export const useSendEnsoTransaction = (ensoTxData: any) => {
  return useExtendedSendTransaction("Migrating", ensoTxData);
};
