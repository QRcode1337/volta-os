---
id: r-deliverables
name: deliverables tracker sync
time: "11:00"
days: [M, W, F]
runner: hermes
mode: active
---

# Deliverables Tracker Sync

Reconcile every active client's deliverables between `business/clients/*.md`, the shared tracker and the
calendar. Hermes runs this; it writes results here and never edits client files directly.

## Steps
1. For each client with status ACTIVE, list deliverables due in the next 14 days.
2. Compare with the shared tracker; flag drift (date moved, owner missing, status stale > 3 days).
3. Write a drift table below and propose fixes as RUBRIC Recos candidates.

## Last run
- 2026-10-22 11:00 · 3 clients · 11 deliverables · 1 drift (Northwind onboarding playbook owner missing)
