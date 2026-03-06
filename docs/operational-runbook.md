# Operational Runbook

## Scope
This runbook covers production incidents for deploy, discovery ingestion, admin backlog, and SEO publishing.

## Incident Severity
- P1: Hard outage or critical reliability breach.
- P2: Major degradation with business impact.
- P3: Partial degradation, workaround available.

## Contract Baseline
- Score payload contract:
  - `payload_version`, `opportunity`, `viral`, `filter`, `metadata`.
  - `viral` must include `score_components`, `decision_reason`, and `score_version`.
- Status transition contract:
  - `new -> reviewing|approved|rejected|saved`
  - `reviewing -> approved|rejected|saved`
  - `saved -> reviewing|approved|rejected`
- Error taxonomy:
  - `P1`: `pipeline_down`, `critical_baseline_breach`, `schema_drift_blocking_write`
  - `P2`: `collector_degraded`, `seo_publish_retry_exhausted`, `batch_partial_failure`
  - `P3`: `quality_gate_filtered`, `idempotent_skip`, `non_critical_signal_missing`

## Severity Matrix
- P1 when any of the following is true:
  - `pipeline_status != OK` in production cycle.
  - Deploy active SHA differs from `origin/main` for required release.
  - Critical discovery alert is open and intake baseline is below threshold.
- P2 when any of the following is true:
  - Backlog over SLA threshold without complete outage.
  - SEO DLQ ratio above configured governance limit.
  - Repeated retry exhaustion in release scheduler.
- P3 when any of the following is true:
  - Partial metric degradation with workaround available.
  - Non-critical alert accumulation requiring scheduled triage.

## Command Map (Fast Triage)
- Deploy and sync:
  - `git rev-parse HEAD`
  - `git ls-remote --heads origin main`
  - `npm run system_deployment_check`
- Pipeline health:
  - `npm run pipeline_final_health`
  - `npm run discovery_risk_report`
  - `npm run alert_routing`
  - `npm run e2e_discovery_seo_flow` (auto-seed enabled by default when queue is empty)
- Discovery operations:
  - `npm run discovery_intelligence_run`
  - `npm run viral_momentum_refresh`
  - `npm run viral_momentum_observability`
  - Admin: `/admin/ops` and `/admin/discovery`
- Cron cadence (required):
  - `30min`: `npm run discovery_intelligence_daemon_start` (or `npm run ml_30m_sync_cron_start`)
  - `2h`: `npm run price_maintenance_2h_cron_start`
  - `6h`: `npm run viral_momentum_6h_cron_start`
  - `24h`: `npm run score_recalc_24h_cron_start`
- SEO operations:
  - `npm run seo_release_scheduler`
  - Admin: `/admin/seo-health`
  - Optional category gates: `SEO_CATEGORY_MIN_QUALITY_MAP='{"creatina":0.62,"whey":0.58}'`

## 1) Deploy Failure
- Detect: `pipeline_status != OK`, failed checks in deployment report, or failed published deploy.
- Immediate actions:
  - Run `npm run system_deployment_check`.
  - Run `npm run pipeline_final_health`.
  - Verify latest publish SHA matches `origin/main`.
  - Validate runtime import tracking with `npm run check_runtime_imports_tracked`.
- Safe rollback:
  - Revert only the failing deployment commit(s).
  - Re-run build/lint/test/checks before publishing.

## 2) Discovery Ingestion Drop
- Detect: ingestion below baseline, `discovery_alerts` critical with `pipeline_issue`.
- Immediate actions:
  - Run `npm run discovery_intelligence_run`.
  - Inspect `reports/discovery-intelligence-report.json` and collector errors.
  - Confirm lock state in `discovery_job_locks`.
- Containment:
  - Keep pipeline running in degraded mode; do not block the whole cycle due to item-level failures.
  - Open incident if below baseline persists for 3 cycles.

## 2.1) Alert Routing, SLA and Escalation
- Source of truth:
  - `discovery_alerts.severity` maps to priority `P1/P2/P3`.
  - `payload.routing` stores SLA, escalation level and dispatch evidence.
- SLA targets:
  - `P1`: 15 minutes.
  - `P2`: 60 minutes.
  - `P3`: 240 minutes.
- Runbook command:
  - Execute `npm run alert_routing` every cycle.
  - Configure external routes by channel and priority:
    - `ALERT_ROUTING_SLACK_P1_WEBHOOK`, `ALERT_ROUTING_SLACK_P2_WEBHOOK`, `ALERT_ROUTING_SLACK_P3_WEBHOOK`
    - `ALERT_ROUTING_EMAIL_P1_WEBHOOK`, `ALERT_ROUTING_EMAIL_P2_WEBHOOK`, `ALERT_ROUTING_EMAIL_P3_WEBHOOK`
    - `ALERT_ROUTING_PAGER_P1_WEBHOOK`, `ALERT_ROUTING_PAGER_P2_WEBHOOK`, `ALERT_ROUTING_PAGER_P3_WEBHOOK`
  - Compatibility fallback still accepted: `ALERT_ROUTING_P1_WEBHOOK`, `ALERT_ROUTING_P2_WEBHOOK`, `ALERT_ROUTING_P3_WEBHOOK`.
- Escalation policy:
  - `L1`: within SLA.
  - `L2`: after SLA breach.
  - `L3`: after 2x SLA breach.

## 2.2) Viral Momentum Monitoring
- Health checks:
  - Run `npm run viral_momentum_observability`.
  - Confirm `metrics.scored_24h >= baseline.expected_min_scored_24h`.
- Baseline breach behavior:
  - Script emits `pipeline_issue` alert with severity `critical` for triage.

## 3) High Backlog In Admin Queue
- Detect: backlog (new/reviewing) over operational threshold.
- Immediate actions:
  - Open `/admin/ops`.
  - Apply global filters (status/score/category/date/origin/owner).
  - Use batch approve/reject/save in `/admin/discovery`.
- Controls:
  - Reject in batch requires a reason.
  - Track actor, operation_id, context in event payload.

## 4) SEO Publish Failure
- Detect: high `failed`/`dlq_count` in `seo-release-scheduler-report`.
- Immediate actions:
  - Run `npm run seo_release_scheduler`.
  - Inspect `reports/seo-release-scheduler-report.json` and DLQ file.
  - Validate quality gates and anti-cannibalization reasons.
- Recovery:
  - Retry via scheduler (built-in backoff).
  - Fix low quality pages before requeue.
  - If category quality gate fails, either raise content quality or adjust `SEO_CATEGORY_MIN_QUALITY_MAP` under controlled change.

## 4.1) Viral Refresh Lock
- `npm run viral_momentum_refresh` acquires lock `viral-momentum-refresh-6h` in `discovery_job_locks`.
- If locked, script exits as `ok=true` with `skipped=true` to avoid concurrent writes.

## 5) Safe Rollback Procedure
- Create rollback commit scoped to failing change only.
- Preserve compatibility routes and do not remove legacy entrypoints without migration.
- Re-run mandatory checks:
  - `npm run build`
  - `npm run lint`
  - `npm run test`
  - `npm run system_deployment_check`
  - `npm run pipeline_final_health`

## Evidence Checklist
- Incident timeline with UTC timestamps.
- Root cause (`pre-existing` vs `introduced`).
- Commands executed and output summary.
- Validation status after mitigation.
