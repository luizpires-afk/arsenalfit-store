# Operations Stack Professional

## Objetivo
Consolidar todos os robos criticos em um fluxo unico, com operacao previsivel para start, stop, status e readiness de producao.

## Componentes controlados pelo stack
- `ml_30m_sync_cron`: ciclo de descoberta + ingest + validacao + sinais.
- `price_maintenance_2h_cron`: manutencao de preco e coerencia operacional.
- `viral_momentum_6h_cron`: refresh de momentum viral e observabilidade.
- `score_recalc_24h_cron`: recalculo diario de score para estabilidade do ranking.
- `auto_recover_daemon`: recuperacao automatica de produtos Mercado Livre.

## Comandos unificados
- Subir tudo: `npm run ops_stack_start`
- Ver status de tudo: `npm run ops_stack_status`
- Reiniciar tudo: `npm run ops_stack_restart`
- Parar tudo: `npm run ops_stack_stop`
- Rodar readiness completa: `npm run ops_stack_readiness`
- GO/NO-GO automatico (progressivo): `npm run go_no_go_gate`
- GO/NO-GO automatico (estrito): `npm run go_no_go_gate_strict`

## Modo de agendamento (auto)
- Em ambiente com `crontab`, o stack usa cron jobs nativos.
- Em ambiente sem `crontab` (ex.: alguns containers), o stack usa daemons internos automaticamente.
- O log de status mostra `scheduler_mode=cron` ou `scheduler_mode=daemon`.

## Readiness de producao
O readiness (`scripts/run-production-readiness.sh`) valida:
- deployment e saude de pipeline
- discovery + viral + seo scheduler + alert routing
- coerencia de preco (`sanity_price_promo`, `validate_reference_pricing`)
- snapshot operacional estrito
- readiness consolidado (`system_production_readiness`)
- build/lint/test
- fluxo e2e (quando habilitado)

## Flags de operacao
Variaveis para controlar profundidade do readiness:
- `PRODUCTION_SMOKE_RUN_E2E=true|false`
- `PRODUCTION_SMOKE_RUN_BUILD_VALIDATION=true|false`
- `PRODUCTION_SMOKE_RUN_FULL_PRICING=true|false`
- `PRODUCTION_SMOKE_RUN_OPERATIONAL_SNAPSHOT=true|false`
- `PRODUCTION_SMOKE_STRICT_CONFIG=true|false` (padrao `true`)

Chaves minimas obrigatorias em modo estrito:
- `MELI_ACCESS_TOKEN` ou `MERCADOLIVRE_ACCESS_TOKEN`
- Pelo menos um webhook: `ALERT_ROUTING_P1_WEBHOOK`, `ALERT_ROUTING_P2_WEBHOOK` ou `ALERT_ROUTING_P3_WEBHOOK`

Exemplo de rotina rapida sem E2E:

```bash
PRODUCTION_SMOKE_RUN_E2E=false npm run ops_stack_readiness
```

Exemplo de rotina completa com auditoria total de precos:

```bash
PRODUCTION_SMOKE_RUN_FULL_PRICING=true npm run ops_stack_readiness
```

## Rotina recomendada (diaria)
1. `npm run ops_stack_status`
2. `PRODUCTION_SMOKE_RUN_E2E=false npm run ops_stack_readiness`
3. Se houver alerta critico: `npm run ops_stack_restart`
4. Validar novamente: `npm run ops_stack_status`

## Operacao de incidente
- Se `ops_stack_status` falhar em qualquer componente, tratar como degradacao.
- Se readiness reprovar em preco/catalogo, priorizar `sanity_price_promo` e `validate_reference_pricing`.
- Se houver falha recorrente no ciclo de 30m, revisar `logs/ml-30m-sync-cycle.log` e `reports/pipeline-final-health.json`.

## Criterios do GO/NO-GO
O comando `go_no_go_gate` gera `reports/go-no-go-gate.json` e marca `NO_GO` quando detectar qualquer item abaixo:
- stack inativo (`ops_stack_status`)
- readiness com falha
- token do Mercado Livre ausente
- webhook de alerta ausente
- pipeline diferente de `OK`
- `active_healthy` abaixo do minimo
- proporcao de standby acima do limite
- alertas P1 sem dispatch acima do limite

## Webhook via Netlify
Voce pode usar Netlify como destino de `ALERT_ROUTING_P1_WEBHOOK`.

URL sugerida:
- `https://SEU-SITE.netlify.app/.netlify/functions/alert-webhook`
- ou `https://SEU-SITE.netlify.app/api/alert-webhook` (redirect ja configurado)

Env vars recomendadas no Netlify:
- `ALERT_WEBHOOK_LOG_ONLY=true` (padrao seguro para bootstrap)
- `ALERT_WEBHOOK_TOKEN=<segredo-opcional>`
- `RESEND_API_KEY=<opcional para envio por email>`
- `ALERT_WEBHOOK_TO_EMAIL=seu-email@dominio.com` (opcional com Resend)
- `ALERT_WEBHOOK_FROM_EMAIL=ArsenalFit Alerts <onboarding@resend.dev>` (opcional)

Se usar token no webhook, configure assim no scheduler:
- `ALERT_ROUTING_P1_WEBHOOK=https://SEU-SITE.netlify.app/api/alert-webhook?token=<mesmo-token>`
