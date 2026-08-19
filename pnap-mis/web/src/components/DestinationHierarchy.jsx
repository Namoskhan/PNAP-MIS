// Where a chosen destination sits in the organization, as returned by
// the server's destination-preview endpoint. Display only — the
// backend re-resolves the destination on every create, so nothing
// rendered here is ever trusted as input.
//
//   Pakistan → KPK Province → Mardan District → Takht Bhai Area
//
// The last node is the destination itself and is highlighted; the
// leading nodes are context, not parties to the transfer.

export function unitLabel(n) {
  if (!n) return '—';
  if (!n.name) return n.levelLabel;
  // Center is a singleton with a proper name of its own, so it reads
  // as just that name.
  if (n.level === 'CENTRAL') return n.name;
  return `${n.name} ${n.levelLabel}`;
}

// Vertical chain, for the selected-destination panel. Markers are real
// elements rather than pseudo-element dots so they can carry the tier
// colour and be sized for legibility.
export default function DestinationHierarchy({ path = [] }) {
  if (!path.length) return null;
  const steps = [{ id: '__root__', name: 'Pakistan', levelLabel: null, level: null }, ...path];
  return (
    <ol className="dh-chain">
      {steps.map((n, i) => {
        const isDestination = i === steps.length - 1;
        return (
          <li
            key={n.id}
            className={`dh-step${isDestination ? ' destination' : ''}${i === 0 ? ' root' : ''}`}
            data-level={n.level || undefined}
          >
            <span className="dh-marker" aria-hidden="true">
              <span className="dh-dot" />
              {!isDestination && <span className="dh-line" />}
            </span>
            <span className="dh-body">
              <span className="dh-name">{n.name}</span>
              {n.levelLabel && <span className="dh-level">{n.levelLabel}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// Single-line form, for the confirmation dialog.
export function DestinationHierarchyInline({ path = [] }) {
  if (!path.length) return null;
  return (
    <span className="dh-inline">
      <span className="dh-inline-node">Pakistan</span>
      {path.map((n, i) => (
        <span key={n.id}>
          <span className="dh-inline-sep" aria-hidden="true"> › </span>
          <span className={`dh-inline-node${i === path.length - 1 ? ' destination' : ''}`}>
            {n.name}
          </span>
        </span>
      ))}
    </span>
  );
}
