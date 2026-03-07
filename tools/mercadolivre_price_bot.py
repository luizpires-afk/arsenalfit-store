#!/usr/bin/env python3
"""Mercado Livre price bot.

Features:
- Accepts item URL, item id (MLB123...), or free-text query.
- Uses Mercado Libre public API.
- Handles transient failures with retry/backoff (including HTTP 429).
- Stores snapshots in CSV with timestamp.
- Can run once or in loop with configurable interval.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import re
import sys
import time
from pathlib import Path
from typing import Dict, Iterable, List, Optional

import requests

API_BASE = "https://api.mercadolibre.com"
DEFAULT_TIMEOUT = 12
DEFAULT_INTERVAL_SECONDS = 300
MAX_RETRIES = 3

ITEM_ID_REGEX = re.compile(r"(MLB\d{6,14})", re.IGNORECASE)


def normalize_item_id(raw: str) -> Optional[str]:
    if not raw:
        return None
    match = ITEM_ID_REGEX.search(raw)
    if match:
        return match.group(1).upper()
    return None


def parse_input_as_item_id(value: str) -> Optional[str]:
    value = (value or "").strip()
    if not value:
        return None
    return normalize_item_id(value)


def search_first_item_id(query: str, timeout: int) -> Optional[str]:
    response = requests.get(
        f"{API_BASE}/sites/MLB/search",
        params={"q": query, "limit": 1},
        timeout=timeout,
    )
    response.raise_for_status()
    payload = response.json()
    results = payload.get("results") or []
    if not results:
        return None
    item_id = results[0].get("id")
    return normalize_item_id(str(item_id))


def fetch_item(item_id: str, timeout: int) -> Dict:
    response = requests.get(f"{API_BASE}/items/{item_id}", timeout=timeout)
    response.raise_for_status()
    return response.json()


def request_with_retry(target: str, timeout: int) -> Optional[Dict]:
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            item_id = parse_input_as_item_id(target)
            if not item_id:
                item_id = search_first_item_id(target, timeout)
            if not item_id:
                print(f"[warn] sem resultado para: {target}")
                return None

            data = fetch_item(item_id, timeout)
            data["_resolved_item_id"] = item_id
            return data
        except requests.HTTPError as error:
            status = error.response.status_code if error.response is not None else None
            if status == 429:
                wait = min(60, attempt * 20)
                print(f"[rate-limit] aguardando {wait}s antes de tentar novamente...")
                time.sleep(wait)
                continue
            if status in (500, 502, 503, 504):
                wait = attempt * 4
                print(f"[retry] erro {status}, nova tentativa em {wait}s...")
                time.sleep(wait)
                continue
            print(f"[error] falha HTTP para '{target}': {error}")
            return None
        except (requests.Timeout, requests.ConnectionError) as error:
            wait = attempt * 3
            print(f"[retry] erro de rede '{target}': {error}. tentando em {wait}s...")
            time.sleep(wait)
        except ValueError as error:
            print(f"[error] resposta JSON invalida para '{target}': {error}")
            return None

    print(f"[error] esgotadas tentativas para '{target}'")
    return None


def extract_row(target: str, payload: Dict) -> Dict[str, object]:
    seller = payload.get("seller") or {}
    shipping = payload.get("shipping") or {}
    return {
        "timestamp": dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "input": target,
        "item_id": payload.get("_resolved_item_id") or payload.get("id") or "",
        "title": payload.get("title") or "",
        "price": payload.get("price"),
        "original_price": payload.get("original_price"),
        "currency_id": payload.get("currency_id") or "BRL",
        "condition": payload.get("condition") or "",
        "seller": seller.get("nickname") or "",
        "seller_id": seller.get("id") or "",
        "free_shipping": bool(shipping.get("free_shipping")),
        "permalink": payload.get("permalink") or "",
        "status": payload.get("status") or "",
    }


def append_rows_to_csv(rows: List[Dict[str, object]], output_file: Path) -> None:
    fieldnames = [
        "timestamp",
        "input",
        "item_id",
        "title",
        "price",
        "original_price",
        "currency_id",
        "condition",
        "seller",
        "seller_id",
        "free_shipping",
        "permalink",
        "status",
    ]

    output_file.parent.mkdir(parents=True, exist_ok=True)
    file_exists = output_file.exists()
    with output_file.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()
        for row in rows:
            writer.writerow(row)


def parse_targets_from_file(path: Path) -> List[str]:
    if not path.exists():
        return []
    lines = path.read_text(encoding="utf-8").splitlines()
    return [line.strip() for line in lines if line.strip() and not line.strip().startswith("#")]


def run_cycle(targets: Iterable[str], timeout: int, output_file: Path) -> int:
    collected: List[Dict[str, object]] = []
    for target in targets:
        payload = request_with_retry(target, timeout=timeout)
        if not payload:
            continue
        row = extract_row(target, payload)
        collected.append(row)
        print(
            "[ok]",
            row["item_id"],
            row["title"],
            f"R$ {row['price']}",
            "frete_gratis=" + str(row["free_shipping"]),
        )

    if collected:
        append_rows_to_csv(collected, output_file)
        print(f"[saved] {len(collected)} linhas em {output_file}")
    return len(collected)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Mercado Livre price bot")
    parser.add_argument(
        "targets",
        nargs="*",
        help="Produto por termo, URL ou item_id (MLB...)",
    )
    parser.add_argument(
        "--targets-file",
        type=Path,
        default=None,
        help="Arquivo .txt com um alvo por linha",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("logs/precos_mercadolivre.csv"),
        help="CSV de saida",
    )
    parser.add_argument(
        "--interval-seconds",
        type=int,
        default=DEFAULT_INTERVAL_SECONDS,
        help="Intervalo do loop em segundos (padrao: 300)",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Executa apenas um ciclo",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT,
        help="Timeout HTTP em segundos",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    targets = list(args.targets)
    if args.targets_file:
        targets.extend(parse_targets_from_file(args.targets_file))
    targets = [target.strip() for target in targets if target.strip()]

    if not targets:
        print("[error] informe alvos por argumento ou --targets-file")
        return 1

    print(f"[start] monitorando {len(targets)} alvo(s)")

    while True:
        started = dt.datetime.now()
        run_cycle(targets, timeout=args.timeout, output_file=args.output)

        if args.once:
            break

        elapsed = (dt.datetime.now() - started).total_seconds()
        sleep_for = max(1, args.interval_seconds - int(elapsed))
        print(f"[wait] aguardando {sleep_for}s para o proximo ciclo...")
        time.sleep(sleep_for)

    return 0


if __name__ == "__main__":
    sys.exit(main())
