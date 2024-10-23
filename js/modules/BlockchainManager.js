export class BlockchainManager {
    constructor(eventManager) {
        this.provider = null;
        this.currentBlock = null;
        this.lastBlockTime = null;
        this.eventManager = eventManager;
    }

    async connect(wsRpc) {
        this.provider = new ethers.providers.WebSocketProvider(wsRpc);
    }

    isConnected() {
        return this.provider !== null;
    }

    startListening() {
        if (!this.isConnected()) {
            throw new Error('Provider is not connected');
        }
        this.provider.on('block', (blockNumber) => this.handleNewBlock(blockNumber));
    }

    async handleNewBlock(blockNumber) {
        this.currentBlock = blockNumber;
        this.lastBlockTime = new Date();
        window.app.uiManager.updateInfoHeader();

        const block = await this.provider.getBlock(blockNumber);
        for (const txHash of block.transactions) {
            const tx = await this.provider.getTransactionReceipt(txHash);
            await this.checkForEvents(tx);
        }
    }

    async checkForEvents(tx) {
        for (const log of tx.logs) {
            const eventType = await this.getEventType(log, tx);
            if (eventType) {
                const eventData = await this.parseEventData(eventType, log, tx);
                this.eventManager.addEvent(eventType, eventData);
            }
        }
    }

    async getEventType(log, tx) {
        const topics = {
            'Transfer(address,address,uint256)': ['erc20Transfer', 'erc721Transfer'],
            'TransferSingle(address,address,address,uint256,uint256)': 'erc1155Transfer',
        };

        const topicHash = log.topics[0];
        for (const [signature, eventType] of Object.entries(topics)) {
            if (topicHash === ethers.utils.id(signature)) {
                // Check if this is a mint (from zero address)
                const fromAddress = log.topics[1] ? '0x' + log.topics[1].slice(26).toLowerCase() : null;
                const isFromZero = fromAddress === '0x0000000000000000000000000000000000000000';
                
                if (Array.isArray(eventType)) {
                    // Differentiate between ERC20 and ERC721
                    const baseType = log.topics.length === 3 ? 'erc20' : 'erc721';
                    return isFromZero ? `${baseType}Mint` : `${baseType}Transfer`;
                }
                return isFromZero ? 'erc1155Mint' : 'erc1155Transfer';
            }
        }

        // Check for contract creation
        if (log.address === tx.contractAddress) {
            const code = await this.provider.getCode(log.address);
            if (code.includes('80ac58cd')) { // ERC721 interface id
                return 'newErc721Contract';
            } else if (code.includes('d9b67a26')) { // ERC1155 interface id
                return 'newErc1155Contract';
            } else {
                return 'newErc20Contract';
            }
        }

        return null;
    }

    async parseEventData(eventType, log, tx) {
        const contract = new ethers.Contract(log.address, ['function name() view returns (string)', 'function symbol() view returns (string)'], this.provider);
        const [name, symbol] = await Promise.all([contract.name(), contract.symbol()]);

        const baseData = {
            name,
            symbol,
            txHash: tx.transactionHash,
        };

        switch (eventType) {
            case 'erc20Transfer':
            case 'erc721Transfer':
            case 'erc20Mint':
            case 'erc721Mint':
                return {
                    ...baseData,
                    from: '0x' + log.topics[1].slice(26),
                    to: '0x' + log.topics[2].slice(26),
                    value: ethers.BigNumber.from(log.topics[3] || log.data).toString(),
                };
            case 'erc1155Transfer':
            case 'erc1155Mint':
                const [, from, to, id, value] = ethers.utils.defaultAbiCoder.decode(['address', 'address', 'address', 'uint256', 'uint256'], log.data);
                return {
                    ...baseData,
                    from,
                    to,
                    id: id.toString(),
                    value: value.toString(),
                };
            case 'newContract':
                return {
                    ...baseData,
                    contractAddress: log.address,
                };
            default:
                return baseData;
        }
    }

    getCurrentBlock() {
        return this.currentBlock;
    }

    getLastBlockTime() {
        return this.lastBlockTime;
    }
}