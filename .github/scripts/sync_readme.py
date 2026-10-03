"""Regenerate the auto-synced regions of README.md from profile-sync.json.

Source of truth: https://rxerium.com/about/ (via data/profile-sync.json).
Managed regions in README.md:
  <!-- SYNC:START --> ... <!-- SYNC:END -->   stats overview table
  <!-- CVES:START --> ... <!-- CVES:END -->   disclosed-CVE table

Usage: python .github/scripts/sync_readme.py /tmp/profile-sync.json [README.md]
Idempotent: exits 0 with no change when already in sync.
"""

import json
import re
import sys
from pathlib import Path

SYNC_START = "<!-- SYNC:START -->"
SYNC_END = "<!-- SYNC:END -->"
CVES_START = "<!-- CVES:START -->"
CVES_END = "<!-- CVES:END -->"


def severity_label(cvss: str) -> str:
    if cvss.startswith("9."):
        return f"\U0001f534 Critical \u00b7 {cvss}"
    if cvss.startswith("7."):
        return f"\U0001f7e0 High \u00b7 {cvss}"
    return cvss


def split_cve_name(name: str) -> tuple[str, str]:
    """Split 'CVE-… — Product (impact)' into (product, impact)."""
    rest = name.split(" \u2014 ", 1)[-1]
    m = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", rest)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return rest.strip(), ""


def build_sync_block(stats: dict) -> str:
    lines = [
        SYNC_START,
        "## \U0001f4ca At a glance",
        "",
        "| | |",
        "|---|---|",
        f"| \U0001f6e1\ufe0f Nuclei templates | **{stats['nuclei_templates_display']}** authored \u00b7 **{stats['upstream_templates_estimate']}+** merged upstream \u00b7 **{stats['kev_coverage']}** covering CISA KEV |",
        f"| \U0001f3a4 Conference talks | **{stats['conference_talks']}** sessions across **{stats['countries']}** countries \u00b7 **2** workshops |",
        f"| \U0001f3db\ufe0f Gov & CERT citations | **{stats['gov_citations']}** \u2014 NCSC (UK), CERT Polska, NIST/NVD, INCIBE (ES), CIRCL (LU), Cal-CSIC, Vietnam |",
        f"| \U0001f41b CVEs disclosed | **{stats['cves_total']}** \u2014 **{stats['cves_critical']}** Critical (CVSS 9.8) \u00b7 **{stats['cves_high']}** High (CVSS 7.5) |",
        "",
        "> \U0001f504 Stats auto-synced daily from [rxerium.com/about](https://rxerium.com/about/) \u2014 the website is the source of truth.",
        SYNC_END,
    ]
    return "\n".join(lines)


def build_cves_block(cves: list[dict]) -> str:
    lines = [
        CVES_START,
        "## \U0001f41b Disclosed CVEs",
        "",
        "| CVE | Product | Impact | Severity |",
        "|---|---|---|---|",
    ]
    for cve in cves:
        product, impact = split_cve_name(cve.get("name", ""))
        impact = impact[:1].upper() + impact[1:] if impact else impact
        lines.append(
            f"| [{cve['id']}]({cve['url']}) | {product} | {impact} | {severity_label(cve.get('cvss', ''))} |"
        )
    lines += [
        "",
        "Full details: [rxerium.com/about/#cves](https://rxerium.com/about/#cves)",
        CVES_END,
    ]
    return "\n".join(lines)


def replace_region(text: str, start: str, end: str, block: str) -> str:
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.DOTALL)
    if not pattern.search(text):
        raise ValueError(f"Region {start}…{end} not found in README")
    return pattern.sub(block, text)


def main() -> None:
    sync_path = (
        Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/profile-sync.json")
    )
    readme_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("README.md")
    payload = json.loads(sync_path.read_text())
    text = readme_path.read_text()
    updated = replace_region(
        text, SYNC_START, SYNC_END, build_sync_block(payload["stats"])
    )
    updated = replace_region(
        updated, CVES_START, CVES_END, build_cves_block(payload["cves"])
    )
    if updated != text:
        readme_path.write_text(updated)
        print("README.md updated from profile-sync.json")
    else:
        print("README.md already in sync")


if __name__ == "__main__":
    main()
