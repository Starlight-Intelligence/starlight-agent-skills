"""Metadata registry safety and determinism tests. Run: python3 -m unittest discover -s tests -p 'test_capability_registry.py'"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from capability_registry import ingest, normalize


def record(**changes):
    r = {"source": "github", "url": "https://github.com/example/skill", "kind": "skill",
         "name": "Example", "revision": "0123456789abcdef", "license": "MIT"}
    r.update(changes)
    return r


class CapabilityRegistryTests(unittest.TestCase):
    def test_idempotent(self):
        self.assertEqual(ingest([record()]), ingest([record(), record()]))

    def test_order_independent(self):
        a = record(source="github")
        b = record(source="directory")
        self.assertEqual(ingest([a, b]), ingest([b, a]))
        self.assertEqual(ingest([a, b])[0]["sources"], ["directory", "github"])

    def test_unknown_license_is_not_verified(self):
        item = normalize(record(license=None))
        self.assertIsNone(item["license"])
        self.assertEqual(item["verification"], "unverified")

    def test_revision_conflict_rejected(self):
        with self.assertRaisesRegex(ValueError, "conflicting revisions"):
            ingest([record(), record(revision="different")])

    def test_license_conflict_rejected(self):
        with self.assertRaisesRegex(ValueError, "conflicting license"):
            ingest([record(), record(license="GPL-3.0")])

    def test_reject_non_https_and_credentials(self):
        for url in ["http://github.com/a/b", "file:///tmp/skill", "https://user:pass@github.com/a/b",
                    "https://github.com/a/b?token=secret", "https://github.com/a/b#section"]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                normalize(record(url=url))

    def test_canonical_identity(self):
        self.assertEqual(normalize(record(url="https://GITHUB.COM/example/skill/"))["id"],
                         normalize(record())["id"])

    def test_reject_bad_kind(self):
        with self.assertRaises(ValueError):
            normalize(record(kind="script"))


if __name__ == "__main__":
    unittest.main()
