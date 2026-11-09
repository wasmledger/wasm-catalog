// SPDX-License-Identifier: Apache-2.0
// The gates this project is under (docs/GATES.md): shown in the header and the hero.
import { GateBadge } from './kit';

export const GATES = (
  <>
    <GateBadge kind="mainnet-read-only" />
    <GateBadge kind="unaudited" />
    <GateBadge kind="gate" gateId="G-VALUE" state="closed" />
  </>
);
