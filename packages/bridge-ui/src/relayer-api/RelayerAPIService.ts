import axios from 'axios';
import { BigNumber, Contract, ethers } from 'ethers';
import BridgeABI from '../constants/abi/Bridge';
import ERC20 from '../constants/abi/ERC20';
import TokenVault from '../constants/abi/TokenVault';
import { chains } from '../domain/chain';
import { MessageStatus } from '../domain/message';

import type { BridgeTransaction } from '../domain/transactions';
import { chainIdToTokenVaultAddress } from '../store/bridge';
import { get } from 'svelte/store';
import type {
  RelayerAPI,
  RelayerBlockInfo,
  RelayerEventsData,
} from 'src/domain/relayerApi';

export class RelayerAPIService implements RelayerAPI {
  private readonly providerMap: Map<number, ethers.providers.JsonRpcProvider>;
  private readonly baseUrl: string;

  constructor(
    providerMap: Map<number, ethers.providers.JsonRpcProvider>,
    baseUrl: string,
  ) {
    this.providerMap = providerMap;
    this.baseUrl = baseUrl;
  }

  async GetAllByAddress(
    address: string,
    chainID?: number,
  ): Promise<BridgeTransaction[]> {
    if (!address) {
      throw new Error('Address need to passed to fetch transactions');
    }
    const params = {
      address,
      chainID,
    };

    const requestURL = `${this.baseUrl}events`;

    const { data } = await axios.get<RelayerEventsData>(requestURL, { params });

    if (data?.items?.length === 0) {
      return [];
    }

    const txs: BridgeTransaction[] = data.items.map((tx) => {
      return {
        status: tx.status,
        message: {
          id: tx.data.Message.Id,
          to: tx.data.Message.To,
          data: tx.data.Message.Data,
          memo: tx.data.Message.Memo,
          owner: tx.data.Message.Owner,
          sender: tx.data.Message.Sender,
          gasLimit: BigNumber.from(tx.data.Message.GasLimit),
          callValue: tx.data.Message.CallValue,
          srcChainId: BigNumber.from(tx.data.Message.SrcChainId),
          destChainId: BigNumber.from(tx.data.Message.DestChainId),
          depositValue: BigNumber.from(`${tx.data.Message.DepositValue}`),
          processingFee: BigNumber.from(`${tx.data.Message.ProcessingFee}`),
          refundAddress: tx.data.Message.RefundAddress,
        },
        amountInWei: tx.amount,
        symbol: tx.canonicalTokenSymbol,
        fromChainId: tx.data.Message.SrcChainId,
        toChainId: tx.data.Message.DestChainId,
        hash: tx.data.Raw.transactionHash,
        from: tx.data.Message.Owner,
      };
    });

    const bridgeTxs: BridgeTransaction[] = await Promise.all(
      (txs || []).map(async (tx) => {
        if (tx.message.owner.toLowerCase() !== address.toLowerCase()) return;

        const { toChainId, fromChainId, hash, from } = tx;

        const destProvider = this.providerMap.get(toChainId);
        const srcProvider = this.providerMap.get(fromChainId);

        const receipt = await srcProvider.getTransactionReceipt(hash);

        if (!receipt) {
          return tx;
        }

        tx.receipt = receipt;

        const destBridgeAddress = chains[toChainId].bridgeAddress;
        const srcBridgeAddress = chains[fromChainId].bridgeAddress;

        const destContract: Contract = new Contract(
          destBridgeAddress,
          BridgeABI,
          destProvider,
        );

        const srcContract: Contract = new Contract(
          srcBridgeAddress,
          BridgeABI,
          srcProvider,
        );

        const events = await srcContract.queryFilter(
          'MessageSent',
          receipt.blockNumber,
          receipt.blockNumber,
        );

        // A block could have multiple events being triggered so we need to find this particular tx
        const event = events.find(
          (e) =>
            e.args.message.owner.toLowerCase() === address.toLowerCase() &&
            e.args.message.depositValue.eq(tx.message.depositValue) &&
            e.args.msgHash === tx.msgHash,
        );

        if (!event) {
          return tx;
        }

        const { msgHash, message } = event.args;

        const messageStatus: number = await destContract.getMessageStatus(
          msgHash,
        );

        let amountInWei: BigNumber;
        let symbol: string;

        if (message.data !== '0x') {
          const tokenVaultContract = new Contract(
            get(chainIdToTokenVaultAddress).get(tx.fromChainId),
            TokenVault,
            srcProvider,
          );

          const filter = tokenVaultContract.filters.ERC20Sent(msgHash);
          const erc20Events = await tokenVaultContract.queryFilter(
            filter,
            receipt.blockNumber,
            receipt.blockNumber,
          );

          const erc20Event = erc20Events.find(
            (e) => e.args.msgHash.toLowerCase() === msgHash.toLowerCase(),
          );

          if (!erc20Event) return;

          const erc20Contract = new Contract(
            erc20Event.args.token,
            ERC20,
            srcProvider,
          );

          symbol = await erc20Contract.symbol();
          amountInWei = BigNumber.from(erc20Event.args.amount);
        }

        const bridgeTx: BridgeTransaction = {
          message,
          receipt,
          msgHash,
          status: messageStatus,
          amountInWei,
          symbol,
          fromChainId,
          toChainId,
          hash,
          from,
        };

        return bridgeTx;
      }),
    );

    bridgeTxs
      .reverse()
      .sort((tx) => (tx.status === MessageStatus.New ? -1 : 1));

    return bridgeTxs;
  }

  async GetBlockInfo(): Promise<Map<number, RelayerBlockInfo>> {
    const requestURL = `${this.baseUrl}blockInfo`;
    const { data } = await axios.get(requestURL);
    const blockInfoMap: Map<number, RelayerBlockInfo> = new Map();
    if (data?.data.length > 0) {
      data.data.forEach((blockInfoByChain) => {
        blockInfoMap.set(blockInfoByChain.chainID, blockInfoByChain);
      });
    }

    return blockInfoMap;
  }
}