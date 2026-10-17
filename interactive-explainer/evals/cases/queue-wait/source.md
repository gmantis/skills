# Why the help desk queue explodes at 90 % busy

*Internal note, operations team (synthetic eval source).*

Our help desk has one agent. Calls arrive at random (a Poisson process) and each call takes on average **4 minutes**,
also at random (exponentially distributed). The fraction of time the agent is busy is the **utilisation** ρ = arrival
rate × mean service time.

The average time a caller waits *before* being served (M/M/1 queue) is

  Wq = ρ / (1 − ρ) × service time.

| Utilisation ρ | Mean wait before service |
|---|---|
| 50 % | 4 minutes |
| 80 % | 16 minutes |
| 90 % | 36 minutes |
| 95 % | 76 minutes |

Going from 80 % to 90 % busy more than doubles the wait, and at 100 % the queue never settles: it grows without limit.
Two levers help: a second agent (M/M/2), or making call length less variable (a script: M/D/1 halves the wait of M/M/1 at
the same utilisation). Management asked: "at what utilisation do we cross a 20-minute average wait?" (Answer: about 83 %.)
