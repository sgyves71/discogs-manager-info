"""Generate Demo 3 Markdown from GitHub job data and Playwright HTML artifacts."""

import argparse
import base64
from collections import Counter
import io
import json
from pathlib import Path
import re
import subprocess
import tempfile
from zipfile import ZipFile


def gh(*args):
    return subprocess.check_output(["gh", *args], encoding="utf-8")


def api(repository, suffix):
    return json.loads(gh("api", f"repos/{repository}/actions/{suffix}"))


def browser_results(report):
    """Read the embedded report using the lockfile-pinned Playwright format."""
    archive = re.search(r"data:application/zip;base64,([A-Za-z0-9+/=]+)", report)
    if archive is None:
        return None
    with ZipFile(io.BytesIO(base64.b64decode(archive[1]))) as payload:
        summary = json.loads(payload.read("report.json"))
        counts = Counter()
        for file in summary["files"]:
            details = json.loads(payload.read(f'{file["fileId"]}.json'))
            for test in details["tests"]:
                attempts = test["results"]
                counts["first_failures"] += bool(attempts and attempts[0]["status"] not in {"passed", "skipped"})
                counts["retries"] += sum(attempt["retry"] > 0 for attempt in attempts)
        stats = summary["stats"]
        return {
            "passed": stats["expected"],
            "failed": stats["unexpected"],
            "skipped": stats["skipped"],
            "flaky": stats["flaky"],
            "first_failures": counts["first_failures"],
            "retries": counts["retries"],
        }


def node_summaries(log):
    """Read Node's count records in order from the backend and safety steps."""
    blocks = re.split(r"^.*?ℹ tests \d+\s*$", log, flags=re.MULTILINE)[1:]
    summaries = []
    for block in blocks:
        counts = dict(re.findall(r"ℹ (pass|fail|cancelled|skipped|todo) (\d+)\b", block))
        if len(counts) == 5:
            summaries.append(counts)
    return summaries if len(summaries) == 2 else [None, None]


def step_result(steps, name):
    result = steps.get(name)
    return "not run" if result == "skipped" else result or "unavailable"


def collect(repository, run_id):
    run = api(repository, f"runs/{run_id}")
    if run["status"] != "completed":
        raise ValueError(f"Run {run_id} is still in progress.")
    artifacts = {item["name"]: item for item in api(repository, f"runs/{run_id}/artifacts")["artifacts"]}
    jobs = []
    for job in api(repository, f"runs/{run_id}/attempts/{run['run_attempt']}/jobs")["jobs"]:
        steps = {step["name"]: step["conclusion"] for step in job["steps"]}
        log = gh("run", "view", str(run_id), "--repo", repository, "--job", str(job["id"]), "--log")
        checkout = re.search(r"git.exe.+?log -1 --format=%H[^\n]*\n[^\n]*?\b([a-f0-9]{40})\b", log)
        artifact = artifacts.get(job["name"].replace("Stage demo ", "stage-demo-"))
        browser = None
        if artifact and not artifact["expired"]:
            with tempfile.TemporaryDirectory(prefix="discogs-demo3-report-") as folder:
                gh("run", "download", str(run_id), "--repo", repository, "--name", artifact["name"], "--dir", folder)
                report = Path(folder) / "e2e/playwright-report/index.html"
                if report.is_file():
                    browser = browser_results(report.read_text(encoding="utf-8"))
        backend, safety = node_summaries(log)
        jobs.append({
            "name": job["name"],
            "conclusion": job["conclusion"],
            "checkout": checkout[1] if checkout else "unavailable",
            "steps": steps,
            "backend": backend,
            "safety": safety,
            "browser": browser,
            "artifact": f'{run["html_url"]}/artifacts/{artifact["id"]}' if artifact and not artifact["expired"] else None,
        })
    return run, sorted(jobs, key=lambda job: job["name"])

def node_label(status, counts):
    if counts is None:
        return f"{status}; counts unavailable"
    return f"{status}; {counts['pass']} passed, {counts['fail']} failed, {counts['skipped']} skipped, {counts['cancelled']} cancelled, {counts['todo']} todo"


def browser_label(status, counts):
    if counts is None:
        return f"{status}; counts unavailable"
    return (f"{status}; {counts['passed']} passed, {counts['failed']} failed, "
            f"{counts['skipped']} skipped, {counts['flaky']} eventual passes after failure, "
            f"{counts['first_failures']} initial failures, {counts['retries']} retries")


def engineering(runs):
    lines = [
        "# Demo 3 engineering report",
        "",
        "Portfolio exercise using synthetic Stage. The tables below are generated from GitHub Actions job and artifact records, checkout logs, Node test summaries, and the Playwright report.",
        "",
        "Backend and safety suites are shown per job as executions. The two jobs run the same suites, so their counts must not be added as unique cases. Skipped workflow steps are shown as not run. Missing counts are shown as unavailable. Browser eventual-pass counts follow the Playwright flaky outcome and do not establish flakiness from reruns alone.",
    ]
    for run, jobs in runs:
        lines.extend([
            "",
            f"## Run {run['id']} ({run['conclusion']})",
            "",
            f"[Run]({run['html_url']}) | trigger: `{run['event']}` | created: `{run['created_at']}` UTC | "
            f"head: `{run['head_sha']}` | workflow attempt: {run['run_attempt']} | Windows synthetic Stage",
            "",
            "| Job | Checkout | Build/type-check | Backend | Safety | Browser | Diagnostics |",
            "| --- | --- | --- | --- | --- | --- | --- |",
        ])
        for job in jobs:
            steps = job["steps"]
            build = step_result(steps, "Build and type-check")
            backend = node_label(step_result(steps, "Backend tests and test type-check"), job["backend"])
            safety = node_label(step_result(steps, "Stage safety tests"), job["safety"])
            browser = browser_label(step_result(steps, "Verify demo on synthetic Stage"), job["browser"])
            diagnostics = f"[Artifact]({job['artifact']})" if job["artifact"] else "Unavailable"
            lines.append(f"| {job['name']} ({job['conclusion']}) | `{job['checkout']}` | {build} | {backend} | {safety} | {browser} | {diagnostics} |")
        lines.append("")
    lines.extend([
        "## Diagnosis and reproduction",
        "",
        "See the [case study](demo-three.md#diagnosis-and-repair) for the affected workflow, expected and actual behavior, evidence, cause, fix, reproduction steps, and limitations. That interpretation is a Codex-assisted draft for human review. The table generation requires no AI service.",
    ])
    return "\n".join(lines) + "\n"


def digest(red, green):
    failed, red_jobs = red
    passed, green_jobs = green
    verdict = "passed the defined checks" if passed["conclusion"] == "success" else "did not pass the defined checks"
    red_results = ", ".join(f"{job['name']}: {job['conclusion']}" for job in red_jobs)
    green_results = ", ".join(f"{job['name']}: {job['conclusion']}" for job in green_jobs)
    return f"""# Demo 3 leadership digest

**Portfolio demonstration using synthetic Stage data.**

**Audience.** Fictional VP of Engineering, Engineering Manager, and QA Lead.

The experiment's [first run]({failed['html_url']}) ended in **{failed['conclusion']}** ({red_results}). The [corrected revision]({passed['html_url']}) **{verdict}** ({green_results}). The checks cover the build, backend tests, Stage safety, the catalog workflow and the synthetic sync retry. See the [engineering report](demo-three-engineering.md) for counts, tested revisions, and artifacts.

**Interpretation for human review (Codex-assisted draft).** The catalog demo detected a second save that should have been rejected. The correction restores the duplicate guard. The independent sync demo provided a comparison on the same workflow run. Concurrent writes, live integrations, and production behavior remain outside this evidence.

**Next action.** Review the repair and CI evidence before deciding whether to merge. CI success does not authorize production deployment. No stakeholder approval is implied.
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("red", type=int)
    parser.add_argument("green", type=int)
    parser.add_argument("--repository", default="sgyves71/discogs-manager-info")
    parser.add_argument("--output", type=Path, default=Path("docs"))
    args = parser.parse_args()
    red = collect(args.repository, args.red)
    green = collect(args.repository, args.green)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "demo-three-engineering.md").write_text(engineering([red, green]), encoding="utf-8")
    (args.output / "demo-three-leadership.md").write_text(digest(red, green), encoding="utf-8")


if __name__ == "__main__":
    main()
