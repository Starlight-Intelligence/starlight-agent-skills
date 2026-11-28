"""Deterministic, metadata-only external capability registry.

No network access, code execution, installation or license inference.
Input: JSON array of source records. Output: normalized JSON with provenance.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

KINDS = {"skill", "mcp", "harness", "workflow", "agent"}
REQUIRED = {"source", "url", "kind", "name", "revision"}


def canonical_url(value):
    p = urlsplit(value.strip())
    if p.scheme != "https" or not p.hostname or p.username or p.password or p.query or p.fragment:
        raise ValueError("source URL must be an absolute HTTPS URL without credentials, query or fragment")
    host = p.hostname.lower()
    port = f":{p.port}" if p.port and p.port != 443 else ""
    return urlunsplit(("https", host + port, p.path.rstrip("/") or "/", "", ""))


def normalize(raw):
    if not isinstance(raw, dict) or not REQUIRED <= raw.keys():
        raise ValueError("missing required source, url, kind, name or revision")
    kind = raw["kind"]
    if kind not in KINDS:
        raise ValueError("unsupported capability kind")
    source = str(raw["source"]).strip()
    name = str(raw["name"]).strip()
    revision = str(raw["revision"]).strip()
    if not source or not name or not revision:
        raise ValueError("empty required value")
    url = canonical_url(str(raw["url"]))
    identity = hashlib.sha256(f"{kind}\n{url}".encode()).hexdigest()[:24]
    license_id = raw.get("license")
    # License evidence is supplied by the source; it is never inferred.
    license_id = license_id.strip() if isinstance(license_id, str) and license_id.strip() else None
    return {
        "id": identity, "kind": kind, "name": name, "url": url,
        "revision": revision, "license": license_id,
        "verification": "unverified",
        "sources": [source],
    }


def ingest(records):
    result = {}
    for raw in records:
        item = normalize(raw)
        old = result.get(item["id"])
        if old is None:
            result[item["id"]] = item
            continue
        if old["revision"] != item["revision"]:
            raise ValueError(f"conflicting revisions for {item['url']}; ingest one pinned snapshot")
        if old["license"] != item["license"]:
            raise ValueError(f"conflicting license evidence for {item['url']}")
        old["sources"] = sorted(set(old["sources"] + item["sources"]))
    return sorted(result.values(), key=lambda r: (r["kind"], r["url"]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    records = json.loads(args.input.read_text(encoding="utf-8"))
    if not isinstance(records, list):
        parser.error("input must be a JSON array")
    payload = json.dumps({"schema_version": 1, "capabilities": ingest(records)}, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(payload, encoding="utf-8")
    else:
        print(payload, end="")


if __name__ == "__main__":
    main()
