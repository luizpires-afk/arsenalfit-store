# Painel de Saude do Sistema (Admin)

## Onde fica
- Admin -> **Saude do Sistema**

## O que mostra
- Automacao: status de `price-check-scheduler`, `catalog-ingest`, `price-sync-report`.
- Catalogo: total em standby, ativos, bloqueados, erros de afiliado.
- Precos: suspeitos, divergencias abertas, produtos com Pix e com promocao.
- GO/NO-GO: resumo operacional (`OK`, `ATENCAO`, `PROBLEMA`).

## Acoes rapidas
- **Rodar auditoria de precos agora (amostra)**: enfileira amostra + executa auditoria de divergencia.
- **Rechecar precos SUSPECT agora**: re-enfileira produtos suspeitos.
- **Abrir lista de STANDBY com erros**: aplica filtro da aba de afiliados.
- **Reenviar relatorio diario**: reenvia o ultimo relatorio de variacao.
- **Exportar batch /sec/ (30)**: gera lote ordenado para validacao no Mercado Livre.

## Automacao de SUSPECT_PRICE
- Job de cron: `suspect-price-automation`.
- Janela: a cada 20 min (`05,25,45` de cada hora, UTC).
- Fluxo automatico:
  - enfileira recheck dos itens `SUSPECT_PRICE`;
  - incrementa ciclo de pendencia em ativo suspeito;
  - move para `STANDBY` ao atingir 3 ciclos consecutivos;
  - zera contador quando o item sai de `SUSPECT_PRICE`.

## Automacao de API_MISSING
- Job de cron: `api-missing-automation`.
- Janela: a cada 20 min (`10,30,50` de cada hora, UTC).
- Fluxo automatico:
  - incrementa contador dedicado de pendencia para ativos `API_MISSING`;
  - move para `STANDBY` ao atingir 3 ciclos consecutivos;
  - aplica motivo automatico `api_missing_consecutive`;
  - zera contador quando o item sai de `API_MISSING`.

## Fluxo de erro /sec/ nao permitido
- Quando o lote `/sec/` recebe linha invalida do tipo "URL nao permitido pelo Programa":
  - o item fica em `STANDBY`,
  - `affiliate_validation_status = INVALID_NOT_PERMITTED`,
  - `affiliate_validation_error` fica preenchido.
- No Admin:
  - o erro aparece na linha do produto na aba de afiliados,
  - pode manter para tentar outro link, ou
  - excluir do standby com motivo `INVALID_AFFILIATE`.

## Excluir produtos em STANDBY
- Disponivel na aba de afiliados:
  - individual (`Excluir`) ou em lote (`Excluir selecionados`).
- E um soft delete:
  - produto vai para estado arquivado/removido,
  - campos de auditoria preenchidos (`removed_at`, `removed_reason`, `removed_by`, `removed_note`).
- Produtos ativos com `/sec/` validado nao sao removidos por essa acao.

## Divergencias de Preco
- Admin -> bloco **Divergencias de preco**.
- Acoes por caso:
  - Rechecar agora
  - Aplicar preco ML
  - Marcar resolvido
  - Mover para standby
  - Excluir (quando estiver em standby)

## Gate de qualidade de promocoes (relatorio diario)
- A funcao `price-sync-report` agora considera promocao apenas quando passa no mesmo padrao da vitrine.
- O envio diario exige um minimo de promocoes qualificadas:
  - env: `PRICE_REPORT_MIN_QUALIFIED_PROMOTIONS` (padrao `5`).
  - se nao atingir o minimo, o envio retorna bloqueio por gate de qualidade.
- O resumo do relatorio inclui `promotion_quality` com:
  - `candidates`, `approved`, `rejected`, `min_required`, `pass`.

## Guard rail de binding da oferta (price-sync)
- Quando o item preferido (`ml_item_id`) nao aparece no retorno de itens do catalogo,
  o robô nao aplica preco novo automaticamente.
- O produto entra em `SUSPECT_PRICE` com motivo de binding pendente (`suspect_offer_binding`)
  para rechecagem e eventual standby pelos ciclos automaticos.
- Objetivo: evitar publicar preco de item diferente do destino esperado do afiliado.

## Guard rail de binding no ingest (ativos, standby e novos)
- No `catalog-ingest`, quando um candidato so encontra produto existente por chave canonica
  (sem bater `external_id`) ou tenta trocar o item vinculado, o fluxo força `standby`.
- Nesses casos, o produto recebe marca de suspeita de binding (`suspect_offer_binding`)
  e nao preserva ativo automaticamente.
- O ingest tambem persiste `ml_item_id` e `canonical_offer_url` a partir do item candidato,
  reforcando o vinculo explicito para standby e para produtos novos.

## Validacao operacional completa
- Conferencia por referencia:
  - `npm run validate_reference_pricing`
- Conferencia de todos os ativos:
  - `npm run validate_all_products_pricing`

