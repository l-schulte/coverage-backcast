import json
import tempfile
import unittest
from pathlib import Path

import duckdb

from backcast_importer import build, discover, parse_lcov

LCOV_MAIN = """TN:
SF:/src/app/main.ts
FN:1,run
FNF:1
FNH:1
FNDA:3,run
DA:1,3
DA:2,0
DA:3,7
LF:3
LH:2
BRF:4
BRH:2
end_of_record
SF:/src/app/util.ts
LF:5
LH:5
BRF:2
BRH:2
FNF:1
FNH:1
end_of_record
"""

LCOV_NO_SUMMARY = """TN:
SF:/src/app/legacy.ts
DA:10,0
DA:11,4
DA:12,1
end_of_record
"""


def write_run(root: Path, prefix: str, suites: dict[str, tuple[str, int]]) -> None:
    run = root / prefix
    run.mkdir()
    for name, (content, code) in suites.items():
        (run / f"{name}.lcov").write_text(content, encoding="utf-8")
        (run / f"{name}.exit_code").write_text(str(code), encoding="utf-8")


class ParserTest(unittest.TestCase):
    def test_parses_summary_and_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "x.lcov"
            path.write_text(LCOV_MAIN + LCOV_NO_SUMMARY, encoding="utf-8")
            records = {r.path: r for r in parse_lcov(path)}
            main = records["/src/app/main.ts"]
            self.assertEqual((main.lf, main.lh, main.brf, main.brh, main.fnf, main.fnh), (3, 2, 4, 2, 1, 1))
            legacy = records["/src/app/legacy.ts"]
            self.assertEqual((legacy.lf, legacy.lh), (3, 2))  # derived from DA lines


class DiscoverTest(unittest.TestCase):
    def test_statuses(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_run(root, "1000_aa", {"unit": (LCOV_MAIN, 0)})
            write_run(root, "2000_bb", {"unit": (LCOV_MAIN, 1)})
            (root / "3000_cc.error").write_text("boom", encoding="utf-8")
            (root / "4000_dd.not_applicable").write_text("n/a", encoding="utf-8")

            commits = discover(root)
            self.assertEqual([c.prefix for c in commits], ["1000_aa", "2000_bb", "3000_cc", "4000_dd"])
            self.assertEqual(
                [c.status for c in commits], ["ok", "tests_failed", "error", "not_applicable"]
            )
            self.assertEqual([c.commit_id for c in commits], [0, 1, 2, 3])


class BuildTest(unittest.TestCase):
    def test_multi_suite_import_and_merge(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "coverage"
            out = Path(tmp) / "data"
            root.mkdir()
            # commit 0: unit + integration (one file hit more by integration)
            write_run(
                root,
                "1000_aa",
                {
                    "unit": (LCOV_MAIN, 0),
                    "integration": (LCOV_MAIN.replace("LH:2", "LH:3"), 0),
                },
            )
            # commit 1: unit only, falling back to DA-derived metrics
            write_run(root, "2000_bb", {"unit": (LCOV_NO_SUMMARY, 1)})

            meta = build(root, out, strip=None)
            self.assertEqual(meta["commit_count"], 2)
            self.assertEqual(sorted(meta["suites"]), ["integration", "unit"])
            self.assertEqual(meta["prefix_stripped"], "/src")
            self.assertEqual(meta["statuses"], {"ok": 1, "tests_failed": 1})

            con = duckdb.connect()
            cov = (out / "coverage.parquet").as_posix()
            summ = (out / "summary.parquet").as_posix()
            rows = con.execute(
                f"SELECT path, suite, lf, lh FROM '{cov}' "
                "WHERE commit_id = 0 ORDER BY path, suite"
            ).fetchall()
            paths = {r[0] for r in rows}
            self.assertEqual(paths, {"/app/main.ts", "/app/util.ts"})

            merged = con.execute(
                f"SELECT path, max(lf) lf, max(lh) lh FROM '{cov}' "
                "WHERE commit_id = 0 GROUP BY path ORDER BY path"
            ).fetchall()
            self.assertEqual(merged, [("/app/main.ts", 3, 3), ("/app/util.ts", 5, 5)])

            summaries = con.execute(
                f"SELECT suite, lf, lh FROM '{summ}' WHERE commit_id = 0 ORDER BY suite"
            ).fetchall()
            self.assertEqual(summaries, [("integration", 8, 8), ("unit", 8, 7)])

            meta_file = json.loads((out / "meta.json").read_text(encoding="utf-8"))
            self.assertEqual(meta_file["coverage_records"], 5)

    def test_skip_gaps(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "coverage"
            out = Path(tmp) / "data"
            root.mkdir()
            write_run(root, "1000_aa", {"unit": (LCOV_MAIN, 0)})
            (root / "2000_bb.error").write_text("boom", encoding="utf-8")
            meta = build(root, out, strip=None, include_gaps=False)
            self.assertEqual(meta["commit_count"], 1)


if __name__ == "__main__":
    unittest.main()
