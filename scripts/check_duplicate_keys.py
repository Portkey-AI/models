#!/usr/bin/env python3

import argparse
import glob
import json
import os
import re
import sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple


def gha_error(file_path: str, message: str, line: Optional[int] = None) -> None:
    safe_message = message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    # Keep file path in message body too, since some GitHub views truncate annotation metadata.
    message_with_file = f"{file_path}: {safe_message}"
    if line is not None and line > 0:
        print(f"::error file={file_path},line={line}::{message_with_file}")
        return

    print(f"::error file={file_path}::{message_with_file}")


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


def index_to_line(content: str, char_index: int) -> int:
    return content.count("\n", 0, char_index) + 1


def find_matching_closer(content: str, start_index: int, opener: str, closer: str) -> Optional[int]:
    if start_index < 0 or start_index >= len(content) or content[start_index] != opener:
        return None

    depth = 0
    in_string = False
    escaped = False

    for index in range(start_index, len(content)):
        char = content[index]

        if escaped:
            escaped = False
            continue

        if char == "\\":
            escaped = True
            continue

        if char == '"':
            in_string = not in_string
            continue

        if in_string:
            continue

        if char == opener:
            depth += 1
        elif char == closer:
            depth -= 1
            if depth == 0:
                return index

    return None


def find_json_key_lines(content: str, key: str) -> List[int]:
    pattern = re.compile(rf'"{re.escape(key)}"\s*:')
    return [index_to_line(content, match.start()) for match in pattern.finditer(content)]


def find_param_key_lines(content: str, path_parts: List[str], param_key: str) -> List[int]:
    if not path_parts or path_parts[-1] != "params":
        return []

    current_start = 0
    current_end = len(content)

    # Walk all object keys before "params" to narrow down to the target model/object block.
    for key in path_parts[:-1]:
        key_pattern = re.compile(rf'"{re.escape(key)}"\s*:\s*')
        key_match = key_pattern.search(content, current_start, current_end)
        if not key_match:
            return []

        # Move to first non-space token after the colon.
        value_start = key_match.end()
        while value_start < len(content) and content[value_start] in (" ", "\t", "\r", "\n"):
            value_start += 1

        if value_start >= len(content) or content[value_start] != "{":
            return []

        value_end = find_matching_closer(content, value_start, "{", "}")
        if value_end is None:
            return []

        current_start = value_start + 1
        current_end = value_end

    params_pattern = re.compile(r'"params"\s*:\s*\[')
    params_match = params_pattern.search(content, current_start, current_end)
    if not params_match:
        return []

    array_start = params_match.end() - 1
    array_end = find_matching_closer(content, array_start, "[", "]")
    if array_end is None:
        return []

    key_pattern = re.compile(rf'"key"\s*:\s*"{re.escape(param_key)}"')
    return [index_to_line(content, match.start()) for match in key_pattern.finditer(content, array_start, array_end + 1)]


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
        key_lines = find_json_key_lines(content, key)
        line_hint = key_lines[0] if key_lines else None
        if key_lines:
            gha_error(
                file_path,
                f'Duplicate JSON object key "{key}" found (occurrences at lines: {", ".join(map(str, key_lines[:12]))})',
                line=line_hint,
            )
        else:
            gha_error(file_path, f'Duplicate JSON object key "{key}" found')
        errors += 1

    params_key_errors: List[str] = []
    find_duplicate_param_keys(parsed, [], params_key_errors)
    for message in params_key_errors:
        match = re.match(r'^Duplicate params key "([^"]+)" in array at (\$\.[^ ]+)', message)
        if not match:
            gha_error(file_path, message)
            errors += 1
            continue

        param_key = match.group(1)
        param_path = match.group(2)
        path_parts = param_path.removeprefix("$.").split(".")
        line_numbers = find_param_key_lines(content, path_parts, param_key)
        line_hint = line_numbers[0] if line_numbers else None

        if line_numbers:
            gha_error(
                file_path,
                f'{message}; lines: {", ".join(map(str, line_numbers))}',
                line=line_hint,
            )
        else:
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
