export const VAULT_ABI = [
  {
    name: 'totalTrades',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'realizedPnL',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'int256' }],
  },
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
