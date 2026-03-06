# Operational Runbook

## Scope
This runbook covers production incidents for deploy, discovery ingestion, admin backlog, and SEO publishing.

## Incident Severity
- P1: Hard outage or critical reliability breach.
- P2: Major degradation with business impact.
- P3: Partial degradation, workaround available.

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
- Discovery operations:
  - `npm run discovery_intelligence_run`
  - Admin: `/admin/ops` and `/admin/discovery`
- Cron cadence (required):
  - `30min`: `npm run discovery_intelligence_daemon_start` (or `npm run ml_30m_sync_cron_start`)
  - `2h`: `npm run price_maintenance_2h_cron_start`
  - `24h`: `npm run score_recalc_24h_cron_start`
- SEO operations:
  - `npm run seo_release_scheduler`
  - Admin: `/admin/seo-health`

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
  - Configure `ALERT_ROUTING_P1_WEBHOOK`, `ALERT_ROUTING_P2_WEBHOOK`, `ALERT_ROUTING_P3_WEBHOOK`.
- Escalation policy:
  - `L1`: within SLA.
  - `L2`: after SLA breach.
  - `L3`: after 2x SLA breach.

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
