"use client";

const BETA_HINT =
  "Beta — Dateiformat kann geändert werden und inkompatibel werden.";

/** Corner ribbon; tooltip warns that the file format may break compatibility. */
export function BetaRibbon() {
  return (
    <div className="beta-ribbon" aria-hidden={false}>
      <span title={BETA_HINT} aria-label={BETA_HINT} tabIndex={0} role="note">
        Beta
      </span>
    </div>
  );
}
