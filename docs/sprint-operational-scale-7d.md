# Sprint Escala Operacional (7 dias)

## Dia 1 - Baseline e Planejamento

### Baseline tecnico atual
- Producao publicada com SHA sincronizado entre local/remoto/deploy.
- Admin Operating OS, Discovery batch actions, SEO scheduler governado e dashboard de confiabilidade ja existentes.
- Validacoes padrao de engenharia (build/lint/test/deployment/pipeline) estao operacionais.

### Metas de resultado
- Aumentar throughput de triagem/admin sem quebrar rotas existentes.
- Reduzir risco de incidente em deploy e pipeline.
- Dar visibilidade operacional em tempo real para decisao (P1/P2/P3 + backlog + cadencia SEO).

### Backlog de implementacao
1. Admin Operating OS v2
- KPI de throughput por hora, aging de backlog e fila priorizada por SLA.
- Filtros globais com presets rapidos de operacao.
- Tabela de produtividade por owner/ator.

2. Discovery Queue v2
- Auditoria visivel por operacao em lote.
- Endurecimento de idempotencia por chave de operacao.
- Rejeicao destrutiva com motivo obrigatorio em fluxo individual e batch.

3. SEO Governance v2
- KPI de qualidade (draft abaixo de threshold).
- Detecao de canibalizacao por keyword em paginas released.
- Melhor visibilidade de falhas DLQ e retry.

4. Discovery Hardening v2
- Dedupe defensivo adicional antes de persistencia.
- Relatorio de risco de ingestao (erro por fonte, baseline, saude).
- Classificacao de risco operacional para alerta.

5. Observabilidade e Runbook v2
- Dashboard consolidado com tendencia 24h/72h.
- Feed de incidentes recentes para triagem.
- Runbook com matriz de severidade, comando de mitigacao e criterio de rollback.

### Riscos e mitigacoes
- Risco: regressao em rotas admin.
  Mitigacao: manter rotas existentes; adicionar apenas caminhos novos e compativeis.
- Risco: query pesada no client.
  Mitigacao: limites paginados e agregacao local controlada.
- Risco: impacto em fluxo discovery com APIs externas instaveis.
  Mitigacao: degradacao graciosa, dedupe e alerta por baseline.

### Dependencias
- Supabase remoto com migracao discovery aplicada.
- Netlify deploy com build de main.
- Tabelas discovery/seo acessiveis para usuario admin.

### Criterios de aceite por fase
- Zero regressao de rota/admin.
- Build/lint/test/system_deployment_check/pipeline_final_health = OK.
- Evidencias por commit e resumo objetivo por fase.

## Dia 2-3 (planejado)
- Evoluir /admin/ops para produtividade de escala (SLA, presets, ownership).

## Dia 4 (planejado)
- Endurecer lote e auditoria em /admin/discovery.

## Dia 5 (planejado)
- Endurecer governanca SEO e visibilidade de risco em /admin/seo-health.

## Dia 6 (planejado)
- Endurecer discovery runner e relatorio de risco operacional.

## Dia 7 (planejado)
- Consolidar observabilidade e runbook final de operacao.
