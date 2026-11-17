"""Convert an exported official MCP Registry response to Starlight discovery records.

Offline only. No network calls, package installation, or trust certification.
Input: JSON response containing servers[].server (MCP Registry v0.1 shape).
"""
import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit


def convert(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get("servers"), list):
        raise ValueError("expected MCP registry response with servers array")
    records = []
    for index, entry in enumerate(payload["servers"]):
        if not isinstance(entry, dict) or not isinstance(entry.get("server"), dict):
            raise ValueError(f"servers[{index}] missing server object")
        server = entry["server"]
        name, version = server.get("name"), server.get("version")
        repository = server.get("repository")
        if not isinstance(name, str) or not name.strip() or not isinstance(version, str) or not version.strip():
            raise ValueError(f"servers[{index}] requires name and version")
        if not isinstance(repository, dict) or not isinstance(repository.get("url"), str):
            # Missing repo provenance: skip instead of inventing a source URL.
            continue
        url = repository["url"]
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError(f"servers[{index}] invalid repository URL")
        # Version is a published registry version, not a source commit SHA.
        # Downstream verification must independently resolve the immutable source.
        records.append({
            "source": "official-mcp-registry",
            "kind": "mcp",
            "name": name,
            "url": url,
            "revision": "registry-version:" + version,
            "license": None,
        })
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    records = convert(json.loads(args.input.read_text(encoding="utf-8")))
    result = json.dumps(records, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(result, encoding="utf-8")
    else:
        print(result, end="")


if __name__ == "__main__":
    main()
