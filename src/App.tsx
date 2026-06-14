import { useMemo, useState } from 'react';
import bundle from './data/daily.json';
import type { Bundle, Day, Window } from './lib/types';
import { fmtDateTime, fmtNum, fmtUsd } from './lib/format';
import { sliceWindow, sum } from './lib/window';
import { StatCard } from './components/StatCard';
import { WindowSelector } from './components/WindowSelector';
import { TVLChart } from './components/TVLChart';
import { VolumeChart } from './components/VolumeChart';
import { FeesChart } from './components/FeesChart';
import { UsersChart } from './components/UsersChart';
import { TxChart } from './components/TxChart';
import { BridgeCustodyDetail } from './components/BridgeCustodyDetail';

const data = bundle as unknown as Bundle;

export default function App() {
  const [win, setWin] = useState<Window>('180d');
  const slice: Day[] = useMemo(() => sliceWindow(data.daily, win), [win]);

  const lastDay = data.daily.at(-1);

  const winLabel =
    win === '30d' ? '30 days' : win === '90d' ? '90 days' : win === '180d' ? '180 days' : 'All time';

  return (
    <div className="page stack">
      <header className="section-head">
        <div>
          <h1>TurboFlow Metrics</h1>
          <div className="section-sub" style={{ marginTop: 6 }}>
            On-chain activity and bridge custody for the TurboFlow protocol on BSC + Solana.
          </div>
        </div>
        <div className="col" style={{ alignItems: 'flex-end', gap: 6 }}>
          <span className="pill">As of {fmtDateTime(data.asOf)}</span>
          <span className="pill">Genesis {data.genesis}</span>
        </div>
      </header>

      <section className="grid grid-5">
        <StatCard label="Bridge TVL (current)" value={fmtUsd(lastDay?.tvlTotal ?? 0)} sub="BSC + Solana on-chain" />
        <StatCard
          label={`Perp volume (${winLabel})`}
          value={fmtUsd(sum(slice, 'pv'))}
          sub="Perp notional"
        />
        <StatCard
          label={`Prediction volume (${winLabel})`}
          value={fmtUsd(sum(slice, 'pmv'))}
          sub="Event contracts + football"
        />
        <StatCard
          label={`Fees (${winLabel})`}
          value={fmtUsd(sum(slice, 'tf'))}
          sub="Aggregate protocol fees"
        />
        <StatCard label="Total wallets" value={fmtNum(lastDay?.u ?? 0)} sub="Cumulative" />
      </section>

      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <span className="muted">Time window applies to all charts and totals below.</span>
        <WindowSelector value={win} onChange={setWin} />
      </div>

      {data.snapshot.fireblocksPending ? (
        <div className="disclaimer">
          <strong>TVL caveat.</strong> Charts below display bridge custody only. TurboFlow uses a
          hybrid custody model: user deposits arrive at on-chain bridges (BSC + Solana) and are then
          transferred to institutional MPC wallets operated through Fireblocks. The Fireblocks
          wallet list has not been publicly disclosed yet, so its balances are excluded from these
          charts. Reported total TVL on DefiLlama will be higher than what is shown here once
          Fireblocks custody is included.
        </div>
      ) : null}

      <TVLChart daily={slice} />
      <VolumeChart daily={slice} />
      <FeesChart daily={slice} />
      <UsersChart daily={slice} />
      <TxChart daily={slice} />

      <BridgeCustodyDetail snapshot={data.snapshot} latest={data.daily.at(-1)!} />

      <footer className="footer">
        <div>
          Data sources:&nbsp;
          <a href="https://apis.turboflow.xyz/defillama/metrics" target="_blank" rel="noreferrer">
            Jerry metrics API
          </a>
          ,&nbsp;
          <a href="https://bridge-info.turboflow.xyz" target="_blank" rel="noreferrer">
            bridge-info
          </a>
          , BscScan,&nbsp;
          <a href="https://solana.com" target="_blank" rel="noreferrer">Solana RPC</a>.
        </div>
        <div>
          Refreshed daily 02:00 UTC via GitHub Actions. All amounts in USD.
        </div>
      </footer>
    </div>
  );
}
