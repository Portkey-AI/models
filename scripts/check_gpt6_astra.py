#!/usr/bin/env python3
"""Check Astra catalog data against published pricing; no gateway or API calls.

Run with: python3 scripts/check_gpt6_astra.py
See scripts/README.md for sources, scope, and the Azure logprobs probe.
"""

import json
import unittest
from decimal import Decimal
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
MODELS = ("gpt-6-astra", "gpt-6-astra-2026-09-03")
UNITS = (
    "request_token",
    "cache_read_input_token",
    "cache_write_input_token",
    "response_token",
)
STANDARD_USD_PER_MILLION = {
    "lte-272k": (Decimal("10"), Decimal("1"), Decimal("12.5"), Decimal("50")),
    "gt-272k": (Decimal("20"), Decimal("2"), Decimal("25"), Decimal("75")),
}
MODE_MULTIPLIERS = {
    "standard": Decimal("1"),
    "batch": Decimal("0.5"),
    "flex": Decimal("0.5"),
    "priority": Decimal("2"),
    "fast": Decimal("2"),
}


def load_config(category, provider):
    with (ROOT / category / f"{provider}.json").open(encoding="utf-8") as handle:
        return json.load(handle, parse_float=Decimal)


class AstraConfigTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pricing = {
            provider: load_config("pricing", provider)
            for provider in ("openai", "azure-ai", "azure-openai")
        }
        cls.general = {
            provider: load_config("general", provider)
            for provider in ("openai", "open-ai", "azure-ai", "azure-openai")
        }

    def model_entries(self):
        for provider, data in self.pricing.items():
            for model in MODELS:
                yield provider, model, data[model]

    def test_metadata(self):
        for provider, data in self.general.items():
            with self.subTest(provider=provider):
                model = data[MODELS[0]]
                params = {param["key"]: param for param in model["params"]}
                self.assertEqual(params["max_completion_tokens"]["maxValue"], 128000)
                self.assertEqual(
                    set(model["removeParams"]),
                    {"max_tokens", "temperature", "top_p", "top_logprobs", "logprobs"},
                )
                self.assertFalse(set(params) & set(model["removeParams"]))
                self.assertEqual(model["type"]["primary"], "responses")
                self.assertEqual(set(model["type"]["supported"]), {"tools", "image", "chat"})
                self.assertEqual(model["type"]["unsupported"], ["messages"])

    def test_alias_snapshot_and_azure_provider_parity(self):
        for provider, data in self.pricing.items():
            with self.subTest(provider=provider):
                self.assertEqual(data[MODELS[0]], data[MODELS[1]])
        for model in MODELS:
            self.assertEqual(self.pricing["azure-ai"][model], self.pricing["azure-openai"][model])

    def test_context_region_and_mode_mappings(self):
        for provider, model, entry in self.model_entries():
            with self.subTest(provider=provider, model=model):
                custom = entry["custom_pricing"]
                self.assertEqual(custom["context_tier_map"], {"0": "lte-272k", "272000": "gt-272k"})
                regions = custom["regions"]
                names = [name for group in regions for name in group.split(",")]
                self.assertEqual(len(names), len(set(names)), "Overlapping region groups")
                expected_regions = {"default"}
                if provider == "openai":
                    expected_regions.update({"us", "eu", "au", "ca", "jp", "in", "sg", "kr", "gb", "ae"})
                    self.assertIn("eu", regions, "EU must have its own mode restrictions")
                self.assertEqual(set(names), expected_regions)
                for region, region_config in regions.items():
                    expected_modes = {"standard"}
                    if provider == "openai":
                        expected_modes.update({"batch", "flex"})
                        if region != "eu":
                            expected_modes.update({"priority", "fast"})
                    self.assertEqual(set(region_config["execution_modes"]), expected_modes)
                    for mode in region_config["execution_modes"].values():
                        self.assertEqual(set(mode["context_tiers"]), set(STANDARD_USD_PER_MILLION))

    def test_published_rates_and_tool_fees(self):
        for provider, model, entry in self.model_entries():
            fees = {"web_search": {"price": 1}, "file_search": {"price": Decimal("0.25")}}
            if provider != "openai":
                fees["routing_units"] = {"price": Decimal("0.000014")}
            for region, region_config in entry["custom_pricing"]["regions"].items():
                uplift = Decimal("1") if region == "default" else Decimal("1.1")
                for mode, mode_config in region_config["execution_modes"].items():
                    for tier, tier_config in mode_config["context_tiers"].items():
                        with self.subTest(provider=provider, model=model, region=region, mode=mode, tier=tier):
                            rates = tier_config["pricing_config"]["pay_as_you_go"]
                            self.assertEqual(set(rates), set(UNITS) | {"additional_units"})
                            for unit, dollars in zip(UNITS, STANDARD_USD_PER_MILLION[tier]):
                                self.assertEqual(
                                    rates[unit],
                                    {"price": dollars * uplift * MODE_MULTIPLIERS[mode] / Decimal("10000")},
                                    unit,
                                )
                            self.assertEqual(rates["additional_units"], fees)

    def test_base_and_batch_rates(self):
        for provider, model, entry in self.model_entries():
            with self.subTest(provider=provider, model=model):
                modes = entry["custom_pricing"]["regions"]["default"]["execution_modes"]
                short = modes["standard"]["context_tiers"]["lte-272k"]["pricing_config"]["pay_as_you_go"]
                self.assertEqual(entry["pricing_config"]["pay_as_you_go"], short)
                if provider == "openai":
                    batch = entry["pricing_config"]["batch_config"]
                    self.assertEqual(set(batch), set(UNITS))
                    for unit in UNITS:
                        self.assertEqual(batch[unit]["price"], short[unit]["price"] / 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
