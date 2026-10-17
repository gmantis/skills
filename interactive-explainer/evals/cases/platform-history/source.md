# Northwind Freight: twelve years on the data platform

*Account history (synthetic eval source; a fictional company).*

**Era 1 — Pilot (2014–2016).** 2014-03 first production graphs on a single Linux host · 2014-09 nightly billing feed
live · 2015-05 second host added for disaster recovery · 2016-02 first upgrade (3.2 → 3.3) · 2016-11 move to a shared
EME for version control.

**Era 2 — Scale-out (2017–2021).** 2017-04 migration to a 4-node cluster · 2017-10 continuous flows for shipment events
· 2018-06 metadata hub introduced for lineage · 2019-01 major upgrade to 4.0 · 2019-08 Oracle → PostgreSQL for the
operational store · 2020-03 remote-run during the pandemic (no outage) · 2020-12 data quality checks on the billing feed
· 2021-07 second region added.

**Era 3 — Cloud (2022–2026).** 2022-02 first workloads on Kubernetes · 2022-09 object storage replaces the NAS · 2023-05
upgrade to 4.2 · 2024-01 metadata hub upgraded, 1 200 datasets catalogued · 2025-03 last on-premises host retired ·
2026-06 self-service portal for analysts.

Counts: 5 events in era 1, 8 in era 2, 6 in era 3 (19 in total). The biggest single shift was the 2022–2025 cloud move.
