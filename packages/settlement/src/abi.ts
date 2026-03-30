// FlageVault ABI — only the functions and events the settlement service uses
export const FLAGE_VAULT_ABI = [
  // executeTrade
  {
    name: 'executeTrade',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'payload',
        type: 'tuple',
        components: [
          { name: 'action', type: 'uint8' },
          { name: 'pair', type: 'bytes32' },
          { name: 'amount', type: 'uint256' },
          { name: 'priceLimit', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'vault', type: 'address' },
        ],
      },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  // totalTrades
  {
    name: 'totalTrades',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  // usedNonces
  {
    name: 'usedNonces',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'signer', type: 'address' },
      { name: 'nonce', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  // teeRegistrations
  {
    name: 'teeRegistrations',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'signingKey', type: 'address' }],
    outputs: [
      { name: 'signingAddress', type: 'address' },
      { name: 'tdxReportHash', type: 'bytes32' },
      { name: 'nvidiaReportHash', type: 'bytes32' },
      { name: 'registeredAt', type: 'uint256' },
      { name: 'active', type: 'bool' },
    ],
  },
  // pairs
  {
    name: 'pairs',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'pairHash', type: 'bytes32' }],
    outputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'maxPositionSize', type: 'uint256' },
      { name: 'maxDailyVolume', type: 'uint256' },
      { name: 'active', type: 'bool' },
    ],
  },
  // realizedPnL
  {
    name: 'realizedPnL',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'int256' }],
  },
  // TradeExecuted event
  {
    name: 'TradeExecuted',
    type: 'event',
    inputs: [
      { name: 'pair', type: 'bytes32', indexed: true },
      { name: 'action', type: 'uint8', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'nonce', type: 'uint256', indexed: false },
      { name: 'teeKey', type: 'address', indexed: true },
    ],
  },
] as const;
