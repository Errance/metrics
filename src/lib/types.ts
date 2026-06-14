export type Day = {
  d: string;
  u: number;
  dau: number;
  nu: number;
  tx: number;
  pv: number;
  ev: number;
  fv: number;
  pmv: number;
  ff: number;
  pf: number;
  ef: number;
  tf: number;
  pr: number;
  ssr: number;
  hr: number;
  tvlBscBridgeUsdt: number;
  tvlBscBridgeUsdc: number;
  tvlBscFireblocksUsdt: number;
  tvlBscFireblocksUsdc: number;
  tvlSolBridgeUsdt: number;
  tvlSolBridgeUsdc: number;
  tvlSolFireblocksUsdt: number;
  tvlSolFireblocksUsdc: number;
  tvlBridgeOnly: number;
  tvlFireblocks: number;
  tvlTotal: number;
};

export type Snapshot = {
  bsc: { usdt: number; usdc: number };
  solana: { usdt: number; usdc: number };
  subtotal: number;
  fireblocksPending: boolean;
  fireblocksGapEstimate?: number;
};

export type Bundle = {
  asOf: string;
  genesis: string;
  daily: Day[];
  snapshot: Snapshot;
};

export type Window = '30d' | '90d' | '180d' | 'all';
