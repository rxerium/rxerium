#!/usr/bin/env node
/**
 * sync-stats.mjs — rebuild the auto-synced Stats block in the profile README.
 *
 * Source of truth: https://rxerium.com/api/about (same shape as
 * website/data/about.json). Only the lines between the STATS markers are
 * rewritten; everything else in README.md is left untouched.
 *
 * Usage:
 *   node scripts/sync-stats.mjs --source <url|file> --readme <path>
 *
 * Exit 0 with "updated" / "no-change" messaging.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const START = '<!-- STATS:START -->';
const END = '<!-- STATS:END -->';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source') out.source = argv[++i];
    else if (a === '--fallback') out.fallback = argv[++i];
    else if (a === '--readme') out.readme = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

async function fetchJson(source) {
  const res = await fetch(source, {
    headers: {
      // GitHub runners egress from datacenter IPs; Cloudflare's bot
      // protection challenges non-browser clients, so identify as one.
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadSource(source, fallback) {
  if (/^https?:\/\//i.test(source)) {
    try {
      return await fetchJson(source);
    } catch (err) {
      if (!fallback) {
        console.error(`Failed to fetch ${source}: ${err.message}`);
        process.exit(1);
      }
      console.log(`Primary source failed (${err.message}); trying fallback ${fallback}...`);
      try {
        return /^https?:\/\//i.test(fallback)
          ? await fetchJson(fallback)
          : JSON.parse(readFileSync(resolve(fallback), 'utf8'));
      } catch (err2) {
        console.error(`Fallback also failed: ${err2.message}`);
        process.exit(1);
      }
    }
  }
  const raw = readFileSync(resolve(source), 'utf8');
  return JSON.parse(raw);
}

function heroStat(data, re) {
  const hit = (data.heroStats ?? []).find((s) => re.test(s.label ?? ''));
  return hit?.value != null ? String(hit.value) : null;
}

function buildRows(data) {
  const flagship = (data.projects ?? []).find((p) => p.name === 'rxerium-templates');
  const templates = flagship?.stats?.templates ?? heroStat(data, /nuclei/i) ?? '950+';
  const upstreamPRs = flagship?.stats?.mergedUpstreamPRs ?? null;

  const cves = data.cves?.summary ?? {};
  const speaking = data.speaking?.summary ?? {};
  const govCitations = heroStat(data, /gov/i);

  const rows = [];
  rows.push(`| Nuclei templates | ${templates} |`);
  if (cves.total != null) {
    const sev =
      cves.critical != null && cves.high != null
        ? ` (${cves.critical} Critical / ${cves.high} High)`
        : '';
    rows.push(`| CVEs disclosed | ${cves.total}${sev} |`);
  }
  if (speaking.sessions != null) rows.push(`| Conference talks | ${speaking.sessions} |`);
  if (upstreamPRs != null) rows.push(`| Upstream PRs merged | ${upstreamPRs} |`);
  if (govCitations != null) rows.push(`| Government and CERT citations | ${govCitations} |`);
  return rows;
}

function buildInner(data) {
  const header = '| Metric | Count |';
  const sep = '|---|---|';
  const lines = [header, sep, ...buildRows(data), '', '_Stats synced automatically from rxerium.com._'];
  return lines.join('\n');
}

async function main() {
  const { source, fallback, readme, help } = parseArgs(process.argv);
  if (help || !source || !readme) {
    console.log('Usage: node scripts/sync-stats.mjs --source <url|file> [--fallback <url|file>] --readme <path>');
    process.exit(help ? 0 : 2);
  }

  const data = await loadSource(source, fallback);
  const readmePath = resolve(readme);
  const content = readFileSync(readmePath, 'utf8');

  const startIdx = content.indexOf(START);
  const endIdx = content.indexOf(END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    console.error('STATS markers not found in README (expected <!-- STATS:START --> / <!-- STATS:END -->).');
    process.exit(1);
  }

  const inner = buildInner(data);
  const before = content.slice(0, startIdx + START.length);
  const after = content.slice(endIdx);
  const next = `${before}\n${inner}\n${after}`;

  if (next === content) {
    console.log('no-change: stats block already up to date.');
    process.exit(0);
  }

  writeFileSync(readmePath, next);
  console.log('updated: stats block rewritten from source.');
  process.exit(0);
}

main().catch((err) => {
  console.error(`sync-stats failed: ${err?.message ?? err}`);
  process.exit(1);
});
