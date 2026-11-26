#!/usr/bin/env python3
"""Flag prices that are probably wrong.

The JSON checks only catch syntax. These catch values that parse fine but
don't make sense, which is how swapped or mis-scaled prices get merged:

  1. cache_read_input_token priced above request_token for the same model
     (cached input is a discount, so this is almost always a swapped field)
  2. the same model id priced 50x or more apart across providers
     (usually a cents/dollars or per-1K/per-1M slip)
  3. cache read and cache write swapped compared with the same model id in
     another provider

Warnings only by default, so a known exception never blocks a PR.
Pass --strict to exit 1 when anything is flagged.
"""

import argparse
import glob
import json
import os
import re
import sys
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

RATIO_LIMIT = 50


def gha_warning(file_path: str, message: str, line: Optional[int] = None) -> None:
    safe_message = message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    message_with_file = f"{file_path}: {safe_message}"
    if line is not None and line > 0:
        print(f"::warning file={file_path},line={line}::{message_with_file}")
        return
    print(f"::warning file={file_path}::{message_with_file}")


def per_million(price: float) -> str:
    # Prices in this repo are cents per token; this is dollars per 1M tokens.
    return f"${price * 10_000:g}/1M"


def model_line(content: str, model: str) -> Optional[int]:
    match = re.search(r'^\s*"' + re.escape(model) + r'"\s*:', content, re.MULTILINE)
    if not match:
        return None
    return content.count("\n", 0, match.start()) + 1


def token_price(payg: Dict, key: str) -> Optional[float]:
    entry = payg.get(key)
    if isinstance(entry, dict) and isinstance(entry.get("price"), (int, float)):
        return float(entry["price"])
    return None


def load_prices(pricing_dir: str) -> Tuple[Dict[str, Dict[str, Dict[str, Optional[float]]]], Dict[str, str]]:
    prices: Dict[str, Dict[str, Dict[str, Optional[float]]]] = {}
    contents: Dict[str, str] = {}
    for file_path in sorted(glob.glob(os.path.join(pricing_dir, "*.json"))):
        provider = os.path.basename(file_path)[: -len(".json")]
        with open(file_path, encoding="utf-8") as handle:
            content = handle.read()
        contents[provider] = content
        data = json.loads(content)
        provider_prices = {}
        for model, config in data.items():
            if model == "default" or not isinstance(config, dict):
                continue
            payg = (config.get("pricing_config") or {}).get("pay_as_you_go") or {}
            if not isinstance(payg, dict):
                continue
            provider_prices[model] = {
                "input": token_price(payg, "request_token"),
                "cache_read": token_price(payg, "cache_read_input_token"),
                "cache_write": token_price(payg, "cache_write_input_token"),
            }
        prices[provider] = provider_prices
    return prices, contents


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pricing-dir", default="pricing")
    parser.add_argument("--strict", action="store_true", help="exit 1 if anything is flagged")
    args = parser.parse_args()

    prices, contents = load_prices(args.pricing_dir)
    findings: List[Tuple[str, str, Optional[int]]] = []

    def flag(provider: str, model: str, message: str) -> None:
        file_path = os.path.join(args.pricing_dir, f"{provider}.json")
        findings.append((file_path, message, model_line(contents[provider], model)))

    by_model: Dict[str, List[Tuple[str, Dict[str, Optional[float]]]]] = defaultdict(list)
    for provider, models in prices.items():
        for model, p in models.items():
            by_model[model].append((provider, p))
            if p["input"] and p["cache_read"] and p["cache_read"] > p["input"]:
                flag(
                    provider,
                    model,
                    f"{model}: cache_read_input_token ({per_million(p['cache_read'])}) is higher than "
                    f"request_token ({per_million(p['input'])}); cached input should be cheaper",
                )

    for model, entries in by_model.items():
        inputs = [(provider, p["input"]) for provider, p in entries if p["input"]]
        if len(inputs) > 1:
            low = min(price for _, price in inputs)
            high = max(price for _, price in inputs)
            if high / low >= RATIO_LIMIT:
                listing = ", ".join(f"{provider} {per_million(price)}" for provider, price in inputs)
                for provider, price in inputs:
                    if price in (low, high):
                        flag(provider, model, f"{model}: request_token differs {high / low:.0f}x across providers ({listing})")

        cached = [(provider, p) for provider, p in entries if p["cache_read"] is not None and p["cache_write"]]
        for i, (provider_a, a) in enumerate(cached):
            for provider_b, b in cached[i + 1 :]:
                if a["cache_read"] == b["cache_write"] and a["cache_write"] == b["cache_read"] and a["cache_read"] != a["cache_write"]:
                    flag(
                        provider_a,
                        model,
                        f"{model}: cache read/write look swapped compared with {provider_b} "
                        f"(read {per_million(a['cache_read'])} vs {per_million(b['cache_read'])})",
                    )

    for file_path, message, line in findings:
        gha_warning(file_path, message, line)

    model_count = sum(len(models) for models in prices.values())
    print(f"Checked {model_count} priced models in {len(prices)} files: {len(findings)} warning(s).")
    if findings and args.strict:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
