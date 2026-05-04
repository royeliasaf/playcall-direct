export default function StatsBar({ assignments, plays }) {
  const numFT = assignments.filter(a => a.kind === 'ft').length;
  const numPlayClips = assignments.filter(a => a.kind === 'play').length;
  const numLeftover = assignments.filter(a => a.kind === 'leftover').length;

  return (
    <div className="stats-bar">
      <Stat n={plays.length} label="Excel Plays" />
      <Stat n={assignments.filter(a => a.kind !== 'leftover').length} label="Offense Clips" />
      <Stat n={numFT} label="Auto-FT" variant="good" />
      <Stat n={numPlayClips} label="Matched" variant="good" />
      {numLeftover > 0 && <Stat n={numLeftover} label="Unmatched" variant="warn" />}
    </div>
  );
}

function Stat({ n, label, variant }) {
  return (
    <div className={`stat${variant ? ` stat-${variant}` : ''}`}>
      <div className="stat-n">{n}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}
