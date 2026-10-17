# How many confirmations are enough?

*Study note on §11 of a proof-of-work ledger paper (synthetic eval source).*

An honest chain and an attacker race to add blocks. Each new block is found by the honest side with probability
p and by the attacker with probability q = 1 − p. The probability the attacker **ever** catches up from z blocks behind
is like a gambler's ruin:

  q_z = 1 if p ≤ q, else (q/p)^z.

A merchant waits for z confirmations. In the meantime the attacker's progress is Poisson with mean λ = z·q/p, so the
chance the attacker still succeeds is

  P = 1 − Σ_{k=0..z} (λ^k e^{−λ} / k!) · (1 − (q/p)^{z−k}).

| q | z | P |
|---|---|---|
| 0.1 | 0 | 1.0000000 |
| 0.1 | 1 | 0.2045873 |
| 0.1 | 2 | 0.0509779 |
| 0.1 | 3 | 0.0131722 |
| 0.1 | 4 | 0.0034552 |
| 0.1 | 5 | 0.0009137 |
| 0.1 | 10 | 0.0000012 |
| 0.3 | 5 | 0.1773523 |
| 0.3 | 10 | 0.0416605 |
| 0.3 | 50 | 0.0000006 |

To keep the risk below 0.1 %, z = 5 is enough at q = 10 %, but z = 24 is needed at q = 30 %.
