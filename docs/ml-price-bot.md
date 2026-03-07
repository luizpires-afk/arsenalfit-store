# Robo Mercado Livre (Python)

Arquivo: `tools/mercadolivre_price_bot.py`

## Requisitos

- Python 3.10+
- Dependencia: `requests`

Instalacao:

```bash
pip install requests
```

## Uso rapido

Executar uma vez:

```bash
python tools/mercadolivre_price_bot.py --once "creatina growth" "https://www.mercadolivre.com.br/p/MLB12345678"
```

Executar em loop (a cada 5 minutos):

```bash
python tools/mercadolivre_price_bot.py --interval-seconds 300 "whey protein"
```

Usar lista de alvos em arquivo:

```bash
python tools/mercadolivre_price_bot.py --targets-file docs/daily-strict-sources.txt
```

## Saida

- CSV em `logs/precos_mercadolivre.csv` (configuravel via `--output`).
- Campos: timestamp, item_id, titulo, preco, vendedor, frete_gratis e permalink.

## Robustez

- Retry automatico para erros de rede e 5xx.
- Backoff para rate limit 429.
- Suporta termo de busca, URL ou item_id `MLB...`.
