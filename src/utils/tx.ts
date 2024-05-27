import {
  Contract,
  ContractTransaction,
  EventLog,
  Log,
  TransactionReceipt,
  TransactionRequest,
  TransactionResponse,
  Wallet,
  ethers,
} from 'ethers';
import { UniRouterV3Abi } from './abi/uni-router-v3';
import logger from './logger';

export const decodeData = (input: string) => {
  try {
    const iface = new ethers.Interface(UniRouterV3Abi);

    return iface.parseTransaction({ data: input });
  } catch (error) {
    return null;
  }
};

export const checkTxForTokenSwap = (
  tx: TransactionResponse,
  lookingContract: string,
  lookingMethod: string,
  lookingToken: string,
): boolean => {
  if (tx?.to?.toLowerCase() === lookingContract.toLowerCase()) {
    // if (tx.data.startsWith(lookingMethod)) { // uncomment if need to check method sig
    const data = decodeData(tx.data);
    const txArgs = data?.args;
    if (!txArgs) {
      return false;
    }
    const [tokenIn, tokenOut] = txArgs.at(0);
    if ([tokenIn, tokenOut].includes(lookingToken)) {
      return true;
    }
    // }
  }

  return false;
};

const filterNBlocks = async (
  traderContract: Contract,
  tokenIn: string,
  tokenOut: string,
  startBlock: number,
  n: number = 100,
): Promise<EventLog[] | Log[]> => {
  const filterFrom = traderContract.filters.Trade(tokenIn, tokenOut);
  const filterTo = traderContract.filters.Trade(tokenOut, tokenIn);
  const endBlock = startBlock - n;
  const logsFrom = await traderContract.queryFilter(filterFrom, endBlock, startBlock);
  const logsTo = await traderContract.queryFilter(filterTo, endBlock, startBlock);
  const transfers = [...logsFrom, ...logsTo];

  return transfers;
};

export const getV3Price = async (traderContract: Contract, tokenIn: string, tokenOut: string) => {
  const price = await traderContract.getV3PairPrice(tokenIn, tokenOut);

  return price;
};

export const getLastSwap = async (
  traderContract: Contract,
  fromBlock: number,
  tokenIn: string,
  tokenOut: string,
): Promise<null | EventLog> => {
  let transfers = [];
  let tries = 0;
  const nBlocks = 1000;
  while (transfers.length < 1 && tries <= 10) {
    transfers = [...transfers, ...(await filterNBlocks(traderContract, tokenIn, tokenOut, fromBlock, nBlocks))];
    fromBlock = fromBlock - nBlocks;
    transfers;
    tries++;
  }

  return transfers.sort((a, b) => b.blockNumber - a.blockNumber)[0] || null;
};

export const doTrade = async (traderContract: Contract, trader: Wallet, WETH: string, token: string) => {
  const amountToTrade = 10n * BigInt(1e18);
  const latestBlock = await trader.provider.getBlockNumber();
  const lastSwap = await getLastSwap(traderContract, latestBlock, WETH, token);
  const needToBuy = lastSwap?.args.at(0).toLowerCase() !== WETH;

  let amountIn: bigint;
  let amountOut: bigint;
  let prefix: string;
  let transaction: ContractTransaction;
  let transactionRequest: TransactionRequest;
  let transactionResponse: TransactionResponse;
  let transactionReceipt: TransactionReceipt;

  if (needToBuy) {
    prefix = '[WETH/token]';
    const price = await getV3Price(traderContract, token, WETH);
    amountIn = (((price * amountToTrade) / BigInt(1e18)) * 1001n) / 1000n;
    amountOut = amountToTrade;
  } else {
    prefix = '[token/WETH]';
    amountIn = traderContract.interface.decodeEventLog('Trade', lastSwap.data, lastSwap.topics).at(3) || amountToTrade;
    const price = await getV3Price(traderContract, WETH, token);
    amountOut = (((BigInt(1e18) * amountIn) / price) * 99n) / 100n;
  }

  try {
    transaction = await traderContract.swapV3ExactIn.populateTransaction(
      needToBuy ? WETH : token,
      needToBuy ? token : WETH,
      amountIn,
      amountOut,
    );
  } catch (e) {
    logger.error(`${prefix} can't populate tx`);
  }

  try {
    transactionRequest = await trader.populateTransaction(transaction);
  } catch (e) {
    logger.error(`${prefix} can't fill tx`);
  }

  try {
    transactionResponse = await trader.sendTransaction(transactionRequest);
  } catch (e) {
    logger.error(`${prefix} can't send tx`);
  }

  try {
    transactionReceipt = await trader.provider.waitForTransaction(transactionResponse.hash);
  } catch (e) {
    logger.error(`${prefix} can't get receipt`);
  }

  if (transactionReceipt.status === 1) {
    logger.info(`${prefix} ${(Number(amountIn) / 1e18).toFixed(6)} to  ${(Number(amountOut) / 1e18).toFixed(8)} `);
  } else {
    logger.warn(`${prefix} Can't swap `);
  }
};
