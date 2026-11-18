"""Offline contract tests for official MCP Registry export converter."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from import_mcp_registry import convert
from capability_registry import ingest


def entry(name="io.github.example/server", version="1.0.0", url="https://github.com/example/mcp"):
    return {"server": {"name": name, "version": version, "repository": {"url": url}}}


class MCPRegistryImportTests(unittest.TestCase):
    def test_convert_and_normalize(self):
        rows = convert({"servers": [entry()]})
        self.assertEqual(rows[0]["source"], "official-mcp-registry")
        self.assertEqual(ingest(rows)[0]["verification"], "unverified")
        self.assertIsNone(ingest(rows)[0]["license"])

    def test_missing_repository_skipped(self):
        self.assertEqual(convert({"servers": [{"server": {"name": "x", "version": "1"}}]}), [])

    def test_missing_version_rejected(self):
        with self.assertRaises(ValueError):
            convert({"servers": [{"server": {"name": "x", "repository": {"url": "https://example.org"}}}]})

    def test_invalid_payload_rejected(self):
        with self.assertRaises(ValueError):
            convert({"servers": {}})

    def test_unsafe_url_rejected(self):
        with self.assertRaises(ValueError):
            convert({"servers": [entry(url="https://user:secret@example.org/repo")]})

    def test_conflicting_versions_not_silently_collapsed(self):
        rows = convert({"servers": [entry(version="1.0"), entry(version="2.0")]})
        with self.assertRaisesRegex(ValueError, "conflicting revisions"):
            ingest(rows)


if __name__ == "__main__":
    unittest.main()
