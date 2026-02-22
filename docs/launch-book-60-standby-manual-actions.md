# Plano manual — 7 itens em standby (launch_book_60_unique_wave)

## Objetivo
Fechar os 7 itens que ainda não foram publicados (`standby`) com o menor risco de regressão.

## Resumo por classe
- `data_health_not_healthy`: 3 itens
- `no_recent_api_base_confirmation`: 2 itens
- `none:`: 2 itens

## Ações por item

### 1) `3f139ec1-a04a-4130-a389-63db154c1352`
- Nome: Kit 3 Bermuda Masculina Tactel Com Elastano Academia Treino
- Motivo: `data_health_not_healthy`
- Estado: `NEEDS_REVIEW`, mismatch `RESOLVED`, source `scraper`, SEC ok, MLB ok
- Ação sugerida: normalizar health para `HEALTHY`; se continuar sem mismatch aberto, ativar (`status=active`, `is_active=true`).

### 2) `20ed6b62-f1ff-4b73-92af-c776fb3eb059`
- Nome: Smartwatch Samsung Galaxy Fit3 Display 1.6" Rosé
- Motivo: `no_recent_api_base_confirmation`
- Estado: `NEEDS_REVIEW`, mismatch `NONE`, source `scraper`, SEC ok, MLB ok
- Ação sugerida: atualizar confirmação de preço (fonte recente), depois normalizar health e ativar.

### 3) `63f28287-50e5-4e75-8a27-420f8f36c256`
- Nome: Smartwatch Xiaomi Redmi Watch 5 Active Tela Lcd 2.00 Preto
- Motivo: `none:`
- Estado: `HEALTHY`, mismatch `NONE`, SEC ausente
- Ação sugerida: manter em `standby` (não publicar). Esse item já está inválido no batch por `affiliate_link_already_used`.

### 4) `71573129-e5c5-4982-854d-f814ee6fee45`
- Nome: Kit Halteres 6 Em 1 Peso Musculação Até 40kg Ajustável Halter, Kettlebell, Anilha Cor Preto-Vermelho + E-book
- Motivo: `none:`
- Estado: `HEALTHY`, mismatch `NONE`, SEC ausente
- Ação sugerida: manter em `standby` (não publicar). Esse item já está inválido no batch por `affiliate_link_already_used`.

### 5) `4b94e8fa-7ab3-47b0-9376-7f58174dc3a4`
- Nome: Relógio Smartwatch Redmi Watch 5 Active Hyperos Alexa Prata
- Motivo: `data_health_not_healthy`
- Estado: `NEEDS_REVIEW`, mismatch `NONE`, source `catalog_ingest`, SEC ok, MLB ok
- Ação sugerida: normalizar health para `HEALTHY`; se continuar sem mismatch aberto, ativar.

### 6) `22da2fc2-fa62-40ad-809c-5a8fb607e128`
- Nome: Super Band 4.5cm Odin Fit Elastico Extensor - Extra Forte
- Motivo: `no_recent_api_base_confirmation`
- Estado: `NEEDS_REVIEW`, mismatch `NONE`, source `catalog_ingest`, SEC ok, MLB ok
- Ação sugerida: atualizar confirmação de preço (fonte recente), depois normalizar health e ativar.

### 7) `db69cc1f-5668-4f54-b688-845f6ea1c029`
- Nome: Par Halter 3 Kg Emborrachado Academia Treino Cor Preto
- Motivo: `data_health_not_healthy`
- Estado: `NEEDS_REVIEW`, mismatch `NONE`, source `catalog_ingest`, SEC ok, MLB ok
- Ação sugerida: normalizar health para `HEALTHY`; se continuar sem mismatch aberto, ativar.

## Ordem de execução recomendada
1. Tratar os 3 de `data_health_not_healthy` (1, 5, 7).
2. Tratar os 2 de `no_recent_api_base_confirmation` (2, 6).
3. Manter os 2 com `none:` em standby por falta de SEC (3, 4).

## Resultado esperado
- Publicáveis imediatos após ação manual: até 5 itens.
- Itens para permanecer em standby: 2 inválidos de link duplicado (3 e 4).
