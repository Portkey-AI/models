#!/usr/bin/env python3

import argparse
import glob
import json
import os
import sys
from collections import defaultdict
from typing import Any, Dict, List, Tuple


def gha_error(file_path: str, message: str) -> None:
    safe_message = message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    print(f"::error file={file_path}::{safe_message}")


def parse_with_duplicate_key_detection(content: str) -> Tuple[Any, List[str]]:
    duplicate_object_keys: List[str] = []

    def object_pairs_hook(pairs: List[Tuple[str, Any]]) -> Dict[str, Any]:
        obj: Dict[str, Any] = {}
        seen = set()
        for key, value in pairs:
            if key in seen:
                duplicate_object_keys.append(key)
            seen.add(key)
            obj[key] = value
        return obj

    parsed = json.loads(content, object_pairs_hook=object_pairs_hook)
    return parsed, duplicate_object_keys


def path_str(parts: List[str]) -> str:
    if not parts:
        return "$"
    return "$." + ".".join(parts)


def find_duplicate_param_keys(node: Any, parts: List[str], errors: List[str]) -> None:
    if isinstance(node, dict):
        for key, value in node.items():
            next_parts = parts + [key]
            if key == "params" and isinstance(value, list):
                occurrences: Dict[str, List[int]] = defaultdict(list)
                for index, item in enumerate(value):
                    if isinstance(item, dict):
                        param_key = item.get("key")
                        if isinstance(param_key, str):
                            occurrences[param_key].append(index)

                for param_key, indexes in occurrences.items():
                    if len(indexes) > 1:
                        errors.append(
                            f'Duplicate params key "{param_key}" in array at {path_str(next_parts)} '
                            f"(indexes: {', '.join(map(str, indexes))})"
                        )

            find_duplicate_param_keys(value, next_parts, errors)
    elif isinstance(node, list):
        for index, item in enumerate(node):
            find_duplicate_param_keys(item, parts + [f"[{index}]"], errors)


def collect_json_files(patterns: List[str]) -> List[str]:
    files: List[str] = []
    for pattern in patterns:
        files.extend(glob.glob(pattern))
    return sorted(set([f for f in files if os.path.isfile(f)]))


def validate_file(file_path: str) -> int:
    errors = 0

    try:
        with open(file_path, "r", encoding="utf-8") as file:
            content = file.read()
    except OSError as exc:
        gha_error(file_path, f"Unable to read file: {exc}")
        return 1

    try:
        parsed, duplicate_object_keys = parse_with_duplicate_key_detection(content)
    except json.JSONDecodeError as exc:
        gha_error(file_path, f"Invalid JSON: {exc}")
        return 1

    for key in sorted(set(duplicate_object_keys)):
        gha_error(file_path, f'Duplicate JSON object key "{key}" found')
        errors += 1

    params_key_errors: List[str] = []
    find_duplicate_param_keys(parsed, [], params_key_errors)
    for message in params_key_errors:
        gha_error(file_path, message)
        errors += 1

    if errors == 0:
        print(f"OK: {file_path}")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check JSON files for duplicate object keys and duplicate params[].key entries."
    )
    parser.add_argument(
        "patterns",
        nargs="*",
        default=["general/*.json", "pricing/*.json"],
        help="Glob patterns for files to validate",
    )
    args = parser.parse_args()

    files = collect_json_files(args.patterns)
    if not files:
        print("No files matched the provided patterns.")
        return 0

    print(f"Checking {len(files)} file(s) for duplicate keys...")
    total_errors = 0
    for file_path in files:
        total_errors += validate_file(file_path)

    if total_errors > 0:
        print(f"Found {total_errors} duplicate-key error(s).")
        return 1

    print("No duplicate keys found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
