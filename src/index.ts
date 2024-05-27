import dotenv from 'dotenv';
import { Contract, Wallet, ethers } from 'ethers';
import { UniTraderAbi } from './utils/abi/uni-trader';
import logger from './utils/logger';
import { checkTxForTokenSwap, doTrade } from './utils/tx';

dotenv.config({ path: ['.env.local', '.env'] });

//@ts-expect-error: it's ok
BigInt.prototype.toJSON = function () {
  const int = Number.parseInt(this.toString());

  return int ?? this.toString();
};

logger.info('start script');

const publicProvider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
const traderContract = new Contract(process.env.TRADER_CONTRACT, UniTraderAbi, publicProvider);
const WETH = process.env.WETH_CONTRACT!.toLowerCase();
const tradingToken = process.env.TRADING_TOKEN_CONTRACT;
const pk = process.env.TRADER_PRIVATE_KEY;
const signer = new Wallet(pk, publicProvider);
let lastTrade = 0;

publicProvider.on('block', async (blockNumber) => {
  const block = await publicProvider.getBlock(blockNumber, true);
  const transactions = block?.transactions;
  let needToTrade = false;
  for (const idx in transactions) {
    const txHash = transactions[idx];
    try {
      const tx = await publicProvider.getTransaction(txHash);
      if (
        tx &&
        checkTxForTokenSwap(tx, process.env.UNISWAP_ROUTER_CONTRACT, process.env.LOOKING_METHOD, tradingToken)
      ) {
        logger.info('fount uni v2 usdt swap', { txHash });
        needToTrade = true;
        break;
      }
    } catch (error) {
      logger.error('Error fetching transaction:', { txHash });
    }
  }
  const now = +new Date() / 1000;
  if (!needToTrade && now - lastTrade > 300) {
    needToTrade = true;
  }
  if (needToTrade) {
    doTrade(traderContract, signer, WETH, tradingToken);
    lastTrade = now;
  }
});
