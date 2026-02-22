# Auditoria Técnica — Etapa 1 e 2

Data: 2026-02-21
Escopo: mapeamento read-only + baseline funcional (sem alterar robô/monitoramento)

## Resultado executivo
- Status: **NO-GO temporário** para fechamento da etapa de estabilidade.
- Motivo: 1 teste automatizado falhando na regra de pricing (`tests/pricingRules.test.js`).
- Build de produção: **OK**.

## Evidências
- `npm test`: 96 pass, 1 fail.
- `npm run build`: build concluído sem erro.

## Arquitetura operacional mapeada
- SPA React/Vite com rotas principais e tutorial de monitoramento (`/como-monitorar`).
- Funções serverless Netlify para auth e APIs auxiliares.
- Supabase com automações por cron para `price-check-scheduler`, `catalog-ingest`, `price-sync-report`, `affiliate-reliability-monitor` e autopilot.
- Dashboard administrativo com ações de auditoria/recheck e GO/NO-GO operacional.

## Matriz de risco (P0 / P1 / P2)

### P0
- Nenhum bloqueio P0 confirmado no código versionado durante esta etapa read-only.

### P1
1. **Gate de qualidade quebrado pela suíte de testes**
   - Evidência: falha em `resolveFinalPriceInfo hides scraper list price even when fresh`.
   - Impacto: risco de regressão silenciosa nas regras de apresentação/preço.
   - Ação recomendada: corrigir regra ou teste com validação dirigida.

2. **Segredos sensíveis presentes em arquivo local de ambiente**
   - Observação: `supabase/.env` contém credenciais reais no workspace local.
   - Estado Git: arquivo **não rastreado** (não versionado).
   - Impacto: risco operacional local (vazamento por cópia/backup indevido).
   - Ação recomendada: rotação preventiva de credenciais e higienização local.

### P2
1. **Headers de segurança incompletos no edge config**
   - Há `X-Content-Type-Options` e `X-Frame-Options`, porém sem CSP explícita.
   - Impacto: superfície maior para vetores client-side.
   - Ação recomendada: definir CSP mínima compatível com app atual.

2. **Bundle principal grande no build**
   - Aviso de chunks >500KB.
   - Impacto: performance inicial (LCP/TBT) em dispositivos móveis.
   - Ação recomendada: code-splitting progressivo por rotas.

## Checklist baseline (Etapa 2)
- [x] Build de produção
- [x] Verificação de erros de editor (Problems)
- [x] Testes automatizados executados
- [ ] Testes automatizados 100% verdes
- [x] Rotas críticas presentes (`/produto/:slug`, `/carrinho`, `/como-monitorar`)
- [x] Funções de auth e API com `Cache-Control: no-store`

## Próxima etapa sugerida (Etapa 3)
1. Corrigir falha única de pricing test (ou ajustar expectativa se regra mudou por decisão explícita).
2. Reexecutar `npm test` até 100% pass.
3. Aplicar endurecimento de headers (CSP) em rollout controlado.
4. Abrir plano de rollback para regras de pricing (feature-flag ou fallback de função).
