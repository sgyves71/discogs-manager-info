import base64
import importlib.util
import io
import json
from pathlib import Path
from zipfile import ZipFile
import unittest

spec = importlib.util.spec_from_file_location(
    "demo_three_report", Path(__file__).with_name("report-demo-three.py")
)
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)


class ReportingTests(unittest.TestCase):
    def test_flaky_outcome_is_not_a_clean_pass(self):
        payload = io.BytesIO()
        with ZipFile(payload, "w") as archive:
            archive.writestr("report.json", json.dumps({
                "stats": {"expected": 0, "unexpected": 0, "skipped": 1, "flaky": 1},
                "files": [{"fileId": "fixture"}],
            }))
            archive.writestr("fixture.json", json.dumps({"tests": [
                {"results": [{"status": "failed", "retry": 0}, {"status": "passed", "retry": 1}]},
                {"results": [{"status": "skipped", "retry": 0}]},
            ]}))
        html = "data:application/zip;base64," + base64.b64encode(payload.getvalue()).decode()
        self.assertEqual(report.browser_results(html), {
            "passed": 0, "failed": 0, "skipped": 1, "flaky": 1,
            "first_failures": 1, "retries": 1,
        })

    def test_unavailable_and_not_run_are_distinct_from_success(self):
        self.assertIsNone(report.browser_results("<html></html>"))
        self.assertEqual(report.node_summaries("partial log"), [None, None])
        self.assertEqual(report.step_result({}, "Build and type-check"), "unavailable")
        self.assertEqual(report.step_result({"Build and type-check": "skipped"}, "Build and type-check"), "not run")

    def test_backend_counts_stay_per_job(self):
        run = {"id": 1, "conclusion": "success", "html_url": "https://example.com",
               "event": "pull_request", "created_at": "2026-11-24T12:00:00Z",
               "head_sha": "example", "run_attempt": 1}
        counts = {"pass": 40, "fail": 0, "skipped": 0, "cancelled": 0, "todo": 0}
        jobs = [
            {"name": f"Stage demo {demo}", "conclusion": "success", "checkout": "example",
             "steps": {"Backend tests and test type-check": "success"},
             "backend": counts, "safety": None, "browser": None, "artifact": None}
            for demo in ("one", "two")
        ]
        markdown = report.engineering([(run, jobs)])
        self.assertEqual(markdown.count("40 passed"), 2)
        self.assertNotIn("80 passed", markdown)


if __name__ == "__main__":
    unittest.main()
