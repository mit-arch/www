#!/usr/bin/env python3
"""Scrape recently published papers with at least one MIT faculty author.

Sources
-------
1. CSrankings (https://github.com/emeryberger/CSrankings) supplies the curated
   faculty roster.  ``csrankings-[a-z].csv`` lists each faculty member's
   DBLP-canonical name and affiliation; MIT's affiliation string is exactly
   "Massachusetts Inst. of Technology".  ``dblp-aliases.csv`` maps DBLP alias
   spellings onto canonical names, which we invert so alternate spellings of an
   MIT author still match.

2. DBLP's search API (https://dblp.org/search/publ/api) supplies the papers.
   We query one *publication stream* (DBLP's identifier for a venue) per year
   and filter locally, rather than querying per author, because it is far fewer
   requests and gives complete venue coverage.

Venue naming is deliberately data-driven: there is no reliable mapping from a
conference's marketing name to its DBLP stream.  FSE lives under ``conf/sigsoft``
(``conf/fse`` is Formal Methods Europe), ASE lives under ``conf/kbse``, and the
four SIGPLAN conferences no longer have their own proceedings at all -- since
2017 they publish as issues of the journal PACMPL (``journals/pacmpl``, "Proc.
ACM Program. Lang."), where the *issue number* field carries the conference
name.  Both cases are handled explicitly below.

Rate limiting
-------------
DBLP's crawling policy (https://dblp.org/faq/Am+I+allowed+to+crawl+the+dblp+website.html)
asks for "at least one or two second between two consecutive requests" and
returns HTTP 429 with a ``Retry-After`` header when you exceed the limit.  This
script defaults to a 2.0s minimum spacing, honours ``Retry-After`` exactly, and
backs off exponentially on 5xx responses (dblp.org returns transient 503s under
load).  It also sends an identifiable User-Agent, and caches every fetch so
re-runs cost nothing.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import random
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

CSRANKINGS_RAW = "https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages"
DBLP_PUBL_API = "https://dblp.org/search/publ/api"

MIT_AFFILIATION = "Massachusetts Inst. of Technology"

DEFAULT_USER_AGENT = (
    "mit-papers-scraper/1.0 (+https://github.com/mit-arch; polite crawler, "
    "see --contact)"
)


# --------------------------------------------------------------------------
# Venues
# --------------------------------------------------------------------------


class Venue:
    """A CSrankings-tracked venue and the DBLP stream that publishes it.

    ``stream``   DBLP publication stream key, e.g. ``conf/isca``.
    ``label``    Human-facing conference name to report.
    ``accept``   DBLP ``venue`` strings that count as the main research track.
                 Streams carry more than the conference itself -- ``conf/sc``
                 also holds "SC Workshops", ASPLOS has a companion volume --
                 and the SIGPLAN/SIGSOFT streams report their venue as the
                 journal that now publishes them.  Defaults to ``{label}``.
    ``issue_map`` For journal streams that stand in for several conferences
                 (PACMPL, PACMSE), maps the DBLP issue-number field onto the
                 conference name.  ``None`` for ordinary conference streams.
    """

    def __init__(
        self,
        stream: str,
        label: str,
        accept: Optional[Iterable[str]] = None,
        issue_map: Optional[Dict[str, str]] = None,
    ):
        self.stream = stream
        self.label = label
        self.accept = set(accept) if accept is not None else {label}
        self.issue_map = issue_map

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return "Venue(%r, %r)" % (self.stream, self.label)


# PACMPL (Proc. ACM Program. Lang.) carries the four SIGPLAN conferences as
# issues.  DBLP records them in the "number" field.  OOPSLA has been split into
# two issues per year since 2023; ECOOP shares the OOPSLA2 issue in some years.
PACMPL_ISSUES = {
    "POPL": "POPL",
    "PLDI": "PLDI",
    "ICFP": "ICFP",
    "OOPSLA": "OOPSLA",
    "OOPSLA1": "OOPSLA",
    "OOPSLA2": "OOPSLA",
}

# PACMSE (Proc. ACM Softw. Eng.) does the same for FSE and ISSTA.
PACMSE_ISSUES = {
    "FSE": "FSE",
    "ISSTA": "ISSTA",
}

# DBLP reports the venue of a modern SIGPLAN paper as the journal, because the
# conference proceedings *are* journal issues.  Each conference keeps its own
# stream, though, so stream membership -- not the venue string -- tells us which
# conference a paper belongs to.
PACMPL_NAMES = ["PACMPL", "Proc. ACM Program. Lang."]
PACMSE_NAMES = ["PACMSE", "Proc. ACM Softw. Eng."]

VENUE_GROUPS: Dict[str, List[Venue]] = {
    # CSrankings "Computer architecture" -- selected by default on the site.
    "arch": [
        Venue("conf/asplos", "ASPLOS"),
        Venue("conf/isca", "ISCA"),
        Venue("conf/micro", "MICRO"),
        Venue("conf/hpca", "HPCA"),
    ],
    # CSrankings "Programming languages" -- selected by default.  Since 2017 the
    # four SIGPLAN conferences publish as PACMPL issues; DBLP cross-lists those
    # papers into the per-conference streams, so querying the conference streams
    # covers both the old proceedings and the modern journal issues.  The
    # journal stream is queried last as a backstop for anything not cross-listed.
    "pl": [
        Venue("conf/pldi", "PLDI", accept=["PLDI"] + PACMPL_NAMES),
        Venue("conf/popl", "POPL", accept=["POPL"] + PACMPL_NAMES),
        Venue("conf/icfp", "ICFP", accept=["ICFP"] + PACMPL_NAMES),
        Venue("conf/oopsla", "OOPSLA", accept=["OOPSLA", "OOPSLA/ECOOP"] + PACMPL_NAMES),
        Venue("journals/pacmpl", "PACMPL", accept=PACMPL_NAMES, issue_map=PACMPL_ISSUES),
    ],
    # CSrankings "Logic & verification" -- tracked, off by default.
    "logic": [
        Venue("conf/cav", "CAV"),
        Venue("conf/lics", "LICS", accept=["LICS", "CSL-LICS"]),
    ],
    # CSrankings "Design automation" -- tracked, off by default.
    "eda": [
        Venue("conf/dac", "DAC"),
        Venue("conf/iccad", "ICCAD"),
    ],
    # CSrankings "Embedded & real-time systems" -- tracked, off by default.
    "embedded": [
        Venue("conf/emsoft", "EMSOFT"),
        Venue("conf/rtss", "RTSS"),
        Venue("conf/rtas", "RTAS"),
    ],
    # CSrankings "High-performance computing" -- tracked, off by default.
    # conf/sc also carries "SC Workshops", which the accept set drops.
    "hpc": [
        Venue("conf/sc", "SC"),
        Venue("conf/hpdc", "HPDC"),
        Venue("conf/ics", "ICS"),
    ],
    # CSrankings "Software engineering" -- tracked, off by default.  FSE lives
    # under conf/sigsoft (conf/fse is Formal Methods Europe) and ASE under
    # conf/kbse; FSE and ISSTA now publish as PACMSE issues.
    "se": [
        Venue("conf/icse", "ICSE"),
        Venue("conf/sigsoft", "FSE", accept=["SIGSOFT FSE", "ESEC/SIGSOFT FSE", "FSE"] + PACMSE_NAMES),
        Venue("conf/kbse", "ASE"),
        Venue("conf/issta", "ISSTA", accept=["ISSTA"] + PACMSE_NAMES),
        Venue("journals/pacmse", "PACMSE", accept=PACMSE_NAMES, issue_map=PACMSE_ISSUES),
    ],
    # CSrankings "Operating systems" -- selected by default; adjacent to
    # architecture and where much MIT systems work lands.
    "os": [
        Venue("conf/sosp", "SOSP"),
        Venue("conf/osdi", "OSDI"),
        Venue("conf/eurosys", "EuroSys"),
        Venue("conf/fast", "FAST"),
        Venue("conf/usenix", "USENIX ATC", accept=[
            "USENIX ATC", "USENIX Annual Technical Conference",
            "USENIX ATC, General Track",
            "USENIX Annual Technical Conference, General Track",
        ]),
    ],
}

DEFAULT_GROUPS = ["arch", "pl"]


# --------------------------------------------------------------------------
# Rate-limited, caching HTTP
# --------------------------------------------------------------------------


class Fetcher:
    """HTTP client that respects dblp.org's crawling policy.

    Enforces a minimum interval between requests, honours ``Retry-After`` on
    429, retries transient 5xx/socket errors with exponential backoff and
    jitter, and caches successful responses on disk.
    """

    def __init__(
        self,
        cache_dir: str,
        min_interval: float = 2.0,
        max_retries: int = 6,
        user_agent: str = DEFAULT_USER_AGENT,
        cache_ttl: float = 7 * 24 * 3600,
        verbose: bool = True,
    ):
        self.cache_dir = cache_dir
        self.min_interval = min_interval
        self.max_retries = max_retries
        self.user_agent = user_agent
        self.cache_ttl = cache_ttl
        self.verbose = verbose
        self._last_request = 0.0
        os.makedirs(cache_dir, exist_ok=True)

    def log(self, msg: str) -> None:
        if self.verbose:
            sys.stderr.write(msg + "\n")
            sys.stderr.flush()

    def _cache_path(self, url: str) -> str:
        safe = re.sub(r"[^A-Za-z0-9]+", "-", url).strip("-")[:120]
        # hashlib, not hash(): str hashing is salted per process, so hash()
        # would give a different filename on every run and never hit cache.
        digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]
        return os.path.join(self.cache_dir, "%s-%s.cache" % (safe, digest))

    def _read_cache(self, path: str) -> Optional[str]:
        if self.cache_ttl <= 0 or not os.path.exists(path):
            return None
        if time.time() - os.path.getmtime(path) > self.cache_ttl:
            return None
        with open(path, "r", encoding="utf-8") as fh:
            return fh.read()

    def _throttle(self) -> None:
        elapsed = time.time() - self._last_request
        wait = self.min_interval - elapsed
        if wait > 0:
            time.sleep(wait)
        self._last_request = time.time()

    def get(self, url: str, use_cache: bool = True) -> str:
        path = self._cache_path(url)
        if use_cache:
            cached = self._read_cache(path)
            if cached is not None:
                return cached

        last_error = None
        for attempt in range(self.max_retries):
            self._throttle()
            request = urllib.request.Request(url, headers={"User-Agent": self.user_agent})
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    body = response.read().decode("utf-8", "replace")
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(body)
                return body
            except urllib.error.HTTPError as err:
                last_error = err
                if err.code == 429:
                    # dblp tells us exactly how long the timeout lasts.
                    retry_after = err.headers.get("Retry-After") if err.headers else None
                    delay = self._parse_retry_after(retry_after, attempt)
                    self.log("  429 Too Many Requests; sleeping %.1fs as instructed" % delay)
                    time.sleep(delay)
                    continue
                if 500 <= err.code < 600:
                    delay = self._backoff(attempt)
                    self.log("  HTTP %d from dblp; retrying in %.1fs" % (err.code, delay))
                    time.sleep(delay)
                    continue
                raise
            except (urllib.error.URLError, OSError) as err:
                last_error = err
                delay = self._backoff(attempt)
                self.log("  network error (%s); retrying in %.1fs" % (err, delay))
                time.sleep(delay)

        raise RuntimeError("giving up on %s after %d attempts: %s" % (url, self.max_retries, last_error))

    @staticmethod
    def _parse_retry_after(value: Optional[str], attempt: int) -> float:
        if value:
            try:
                return max(1.0, float(value.strip()))
            except ValueError:
                pass
        return min(300.0, 30.0 * (2 ** attempt))

    @staticmethod
    def _backoff(attempt: int) -> float:
        return min(120.0, (2.0 ** attempt) * 2.0) + random.uniform(0, 1.5)

    def get_json(self, url: str) -> dict:
        text = self.get(url)
        try:
            return json.loads(text)
        except ValueError:
            # A truncated or error page got cached; drop it and retry once.
            path = self._cache_path(url)
            if os.path.exists(path):
                os.remove(path)
            return json.loads(self.get(url, use_cache=False))


# --------------------------------------------------------------------------
# Faculty roster
# --------------------------------------------------------------------------


def normalize_name(name: str) -> str:
    """Fold a name to a comparable key: accents stripped, casefolded.

    DBLP's homonym suffixes ("Daniel Sanchez 0004") are preserved, because they
    are exactly what distinguishes two different people with the same name.
    """
    decomposed = unicodedata.normalize("NFKD", name)
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", stripped).strip().casefold()


def load_extra_faculty(path: str) -> Dict[str, str]:
    """Read additional DBLP author names, one per line ('#' comments allowed).

    CSrankings only lists tenure-track faculty, so people like professors of
    the practice and research staff are missing from its roster even though
    they are MIT faculty.  Names must be spelled exactly as DBLP does,
    including any homonym suffix (e.g. "Daniel Sanchez 0004").
    """
    extra: Dict[str, str] = {}
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            name = line.split("#", 1)[0].strip()
            if name:
                extra[normalize_name(name)] = name
    return extra


def load_faculty(fetcher: Fetcher, affiliation: str) -> Tuple[Set[str], Dict[str, str]]:
    """Return (normalized name keys, normalized key -> display name).

    Reads all 26 CSrankings faculty shards, keeps rows whose affiliation
    matches, then folds in every DBLP alias that resolves to one of those
    names so alternate spellings in a paper record still match.
    """
    canonical: Dict[str, str] = {}
    for letter in "abcdefghijklmnopqrstuvwxyz":
        url = "%s/csrankings-%s.csv" % (CSRANKINGS_RAW, letter)
        text = fetcher.get(url)
        for row in csv.DictReader(text.splitlines()):
            if (row.get("affiliation") or "").strip() == affiliation:
                name = (row.get("name") or "").strip()
                if name:
                    canonical[normalize_name(name)] = name
    if not canonical:
        raise SystemExit(
            "No faculty found for affiliation %r. CSrankings may have renamed it; "
            "check csrankings-a.csv for the exact string." % affiliation
        )

    # dblp-aliases.csv is "alias,name": add any alias whose canonical name is
    # one of ours.
    alias_text = fetcher.get("%s/dblp-aliases.csv" % CSRANKINGS_RAW)
    for row in csv.DictReader(alias_text.splitlines()):
        target = normalize_name((row.get("name") or "").strip())
        alias = (row.get("alias") or "").strip()
        if alias and target in canonical:
            canonical.setdefault(normalize_name(alias), canonical[target])

    return set(canonical), canonical


# --------------------------------------------------------------------------
# DBLP querying
# --------------------------------------------------------------------------


def as_list(value) -> List:
    """DBLP's JSON collapses single-element lists into bare objects."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def venue_names(info: dict) -> List[str]:
    """Venue strings on a record.

    DBLP returns a list here when a record belongs to several venues at once
    (a conference and its LNCS volume, say), so always treat it as a list.
    """
    return [str(v).strip() for v in as_list(info.get("venue")) if str(v).strip()]


# DBLP currently returns at most 100 hits per request even when `h` asks for
# more, so every venue-year has to be paginated.  The loop below advances by the
# batch size actually returned rather than by `h`, so it stays correct whatever
# cap the server applies.
PAGE_SIZE = 1000


def fetch_venue_year(fetcher: Fetcher, venue: Venue, year: int, page_size: int = PAGE_SIZE) -> List[dict]:
    """Fetch every DBLP record for one stream in one year, paginating."""
    records: List[dict] = []
    offset = 0
    while True:
        query = urllib.parse.urlencode(
            {
                "q": "stream:%s: year:%d:" % (venue.stream, year),
                "format": "json",
                "h": str(page_size),
                "f": str(offset),
            }
        )
        payload = fetcher.get_json("%s?%s" % (DBLP_PUBL_API, query))
        hits = payload.get("result", {}).get("hits", {})
        batch = as_list(hits.get("hit"))
        records.extend(batch)
        total = int(hits.get("@total", "0"))
        offset += len(batch)
        if not batch or offset >= total:
            break
        # dblp's search API refuses offsets beyond 10000.
        if offset >= 10000:
            break
    return records


def resolve_conference(venue: Venue, info: dict) -> Optional[str]:
    """Report the conference a record belongs to, or None to drop it.

    For journal streams that stand in for conferences (PACMPL, PACMSE) the
    issue-number field names the conference; issues we do not recognise (e.g. a
    PACMPL issue for a venue outside our list) are dropped rather than guessed.
    """
    if venue.issue_map is None:
        return venue.label
    number = (info.get("number") or "").strip()
    return venue.issue_map.get(number)


# Page-count rules mirroring CSrankings' countPaper(): short entries are demos,
# posters and abstracts rather than research papers.
PAGE_COUNT_THRESHOLD = 6
ASE_LONG_PAPER_THRESHOLD = 10

_PAGES_NORMAL = re.compile(r"([0-9]+)-([0-9]+)")
_PAGES_COLON = re.compile(r"[0-9]+:([1-9][0-9]*)-[0-9]+:([1-9][0-9]*)")


def page_count(pages: Optional[str]) -> int:
    """Number of pages in a DBLP page range, or -1 when it cannot be told.

    Handles both "117-128" and the article-number form "138:1-138:28" that
    PACMPL and other modern ACM journals use.
    """
    if not pages:
        return -1
    match = _PAGES_NORMAL.match(pages) or _PAGES_COLON.match(pages)
    if match is None:
        return -1
    return int(match.group(2)) - int(match.group(1)) + 1


def is_research_paper(info: dict, conference: str) -> bool:
    """Filter out editorials, front matter, demos and other non-papers.

    DBLP marks conference records as "Conference and Workshop Papers" and
    PACMPL/PACMSE records as "Journal Articles"; anything else (Editorship,
    Informal Publications) is not a research paper.  Beyond that we apply
    CSrankings' page-count heuristics, including its per-venue exceptions.
    """
    kind = (info.get("type") or "").strip()
    if kind not in ("Conference and Workshop Papers", "Journal Articles"):
        return False
    title = (info.get("title") or "").strip()
    if not title:
        return False
    lowered = title.rstrip(".").casefold()
    boilerplate = (
        "front matter", "back matter", "title page", "table of contents",
        "editorial", "preface", "foreword", "message from the",
        "author index", "subject index", "program committee",
    )
    if any(lowered.startswith(prefix) for prefix in boilerplate):
        return False

    # ICS shares a stream with "Innovations in Computing"-style entries.
    if conference == "ICS" and "innovations" in (info.get("url") or ""):
        return False

    count = page_count(info.get("pages"))
    if count == -1:
        # DBLP omits page ranges for plenty of legitimate papers; don't guess.
        return True
    if conference == "ASE" and count < ASE_LONG_PAPER_THRESHOLD:
        return False  # ASE short papers are demos and posters.
    if count < PAGE_COUNT_THRESHOLD:
        # ISCA is the one venue where short page ranges are still full papers.
        return conference == "ISCA" and count >= 3
    return True


def paper_authors(info: dict) -> List[Tuple[str, str]]:
    """Return [(display name, pid)] for a DBLP record."""
    authors = info.get("authors") or {}
    out = []
    for entry in as_list(authors.get("author")):
        if isinstance(entry, dict):
            out.append((entry.get("text", ""), entry.get("@pid", "")))
        else:
            out.append((str(entry), ""))
    return out


# --------------------------------------------------------------------------
# Driver
# --------------------------------------------------------------------------


def collect(
    fetcher: Fetcher,
    venues: Sequence[Venue],
    years: Sequence[int],
    faculty_keys: Set[str],
    faculty_display: Dict[str, str],
) -> List[dict]:
    papers: Dict[str, dict] = {}
    for venue in venues:
        for year in years:
            fetcher.log("Fetching %s (%s) %d ..." % (venue.label, venue.stream, year))
            try:
                records = fetch_venue_year(fetcher, venue, year)
            except RuntimeError as err:
                fetcher.log("  SKIPPED: %s" % err)
                continue
            matched = 0
            for record in records:
                info = record.get("info", {})
                if not any(name in venue.accept for name in venue_names(info)):
                    continue  # workshop / companion volume sharing the stream
                conference = resolve_conference(venue, info)
                if conference is None:
                    continue
                if not is_research_paper(info, conference):
                    continue
                authors = paper_authors(info)
                mit = [
                    faculty_display[normalize_name(name)]
                    for name, _pid in authors
                    if normalize_name(name) in faculty_keys
                ]
                if not mit:
                    continue
                key = info.get("key") or info.get("url") or info.get("title")
                if key in papers:
                    continue
                matched += 1
                papers[key] = {
                    "title": (info.get("title") or "").rstrip("."),
                    "authors": [name for name, _pid in authors],
                    "mit_faculty": mit,
                    "conference": conference,
                    "year": int(info.get("year") or year),
                    "doi": info.get("doi", ""),
                    "url": info.get("ee", "") or info.get("url", ""),
                    "dblp_key": info.get("key", ""),
                }
            fetcher.log("  %d records, %d with MIT faculty" % (len(records), matched))

    return sorted(
        papers.values(),
        key=lambda p: (-p["year"], p["conference"], p["title"].casefold()),
    )


def write_csv(papers: List[dict], stream) -> None:
    writer = csv.writer(stream)
    writer.writerow(["title", "authors", "mit_faculty", "conference", "year", "doi", "url", "dblp_key"])
    for paper in papers:
        writer.writerow(
            [
                paper["title"],
                "; ".join(paper["authors"]),
                "; ".join(paper["mit_faculty"]),
                paper["conference"],
                paper["year"],
                paper["doi"],
                paper["url"],
                paper["dblp_key"],
            ]
        )


def write_markdown(papers: List[dict], stream) -> None:
    current = None
    for paper in papers:
        heading = "%s %d" % (paper["conference"], paper["year"])
        if heading != current:
            current = heading
            stream.write("\n## %s\n\n" % heading)
        link = paper["url"]
        title = "[%s](%s)" % (paper["title"], link) if link else paper["title"]
        stream.write("- **%s**  \n  %s\n" % (title, ", ".join(paper["authors"])))


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrape recent papers with at least one MIT faculty author from DBLP.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Venue groups: " + ", ".join(sorted(VENUE_GROUPS)) + " (or 'all').",
    )
    parser.add_argument(
        "--groups", nargs="+", default=DEFAULT_GROUPS,
        help="Venue groups to scrape (default: %s). Use 'all' for every group." % " ".join(DEFAULT_GROUPS),
    )
    parser.add_argument("--only", nargs="+", default=None, metavar="VENUE",
                        help="Restrict to these venue labels (e.g. --only ASPLOS ISCA).")
    parser.add_argument("--years", type=int, default=2, help="How many years back to include, counting this one (default: 2).")
    parser.add_argument("--start-year", type=int, default=None, help="Explicit first year; overrides --years.")
    parser.add_argument("--end-year", type=int, default=None, help="Explicit last year (default: current year).")
    parser.add_argument("--extra-faculty", default=None, metavar="FILE",
                        help="File of extra DBLP author names (one per line) to treat as faculty. "
                             "CSrankings lists only tenure-track faculty, so e.g. Joel S. Emer "
                             "and other professors of the practice are not in its MIT roster.")
    parser.add_argument("--affiliation", default=MIT_AFFILIATION, help="CSrankings affiliation string to match (default: %(default)r).")
    parser.add_argument("--format", choices=["csv", "json", "markdown"], default="csv", help="Output format (default: csv).")
    parser.add_argument("-o", "--output", default="-", help="Output file, or '-' for stdout (default).")
    parser.add_argument("--cache-dir", default=os.path.expanduser("~/.cache/mit-papers-scraper"), help="Where to cache HTTP responses.")
    parser.add_argument("--no-cache", action="store_true", help="Ignore cached responses and refetch everything.")
    parser.add_argument("--cache-ttl", type=float, default=7 * 24 * 3600, help="Seconds a cached response stays fresh (default: 7 days).")
    parser.add_argument("--min-interval", type=float, default=2.0, help="Minimum seconds between DBLP requests (default: 2.0; dblp asks for 1-2s).")
    parser.add_argument("--contact", default=None, help="Contact email to advertise in the User-Agent. Recommended when crawling.")
    parser.add_argument("--quiet", action="store_true", help="Suppress progress output on stderr.")
    parser.add_argument("--list-venues", action="store_true", help="Print the venue/stream table and exit.")
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)

    if args.list_venues:
        for group in sorted(VENUE_GROUPS):
            print("%s:" % group)
            for venue in VENUE_GROUPS[group]:
                extra = ""
                if venue.issue_map:
                    extra = "  (issues: %s)" % ", ".join(sorted(set(venue.issue_map.values())))
                print("  %-12s %s%s" % (venue.label, venue.stream, extra))
        return 0

    groups = sorted(VENUE_GROUPS) if "all" in args.groups else args.groups
    unknown = [g for g in groups if g not in VENUE_GROUPS]
    if unknown:
        raise SystemExit("Unknown venue group(s): %s. Known: %s" % (", ".join(unknown), ", ".join(sorted(VENUE_GROUPS))))

    venues: List[Venue] = []
    seen_streams = set()
    for group in groups:
        for venue in VENUE_GROUPS[group]:
            if venue.stream not in seen_streams:
                seen_streams.add(venue.stream)
                venues.append(venue)

    if args.only:
        wanted = {name.casefold() for name in args.only}
        venues = [v for v in venues if v.label.casefold() in wanted]
        if not venues:
            raise SystemExit("--only matched no venues in the selected groups.")

    end_year = args.end_year or time.gmtime().tm_year
    start_year = args.start_year if args.start_year is not None else end_year - args.years + 1
    if start_year > end_year:
        raise SystemExit("--start-year %d is after --end-year %d" % (start_year, end_year))
    years = list(range(start_year, end_year + 1))

    user_agent = DEFAULT_USER_AGENT
    if args.contact:
        user_agent = "mit-papers-scraper/1.0 (mailto:%s)" % args.contact

    fetcher = Fetcher(
        cache_dir=args.cache_dir,
        min_interval=args.min_interval,
        user_agent=user_agent,
        cache_ttl=0.0 if args.no_cache else args.cache_ttl,
        verbose=not args.quiet,
    )

    fetcher.log("Loading CSrankings roster for %r ..." % args.affiliation)
    faculty_keys, faculty_display = load_faculty(fetcher, args.affiliation)
    if args.extra_faculty:
        extra = load_extra_faculty(args.extra_faculty)
        faculty_display.update(extra)
        faculty_keys |= set(extra)
        fetcher.log("  +%d names from %s" % (len(extra), args.extra_faculty))
    # CSrankings lists some people under several spellings, so entries are name
    # spellings rather than distinct people.
    fetcher.log("  %d roster entries covering %d name spellings" % (len(set(faculty_display.values())), len(faculty_keys)))
    fetcher.log(
        "Scraping %d venue streams x %d years (%d-%d)"
        % (len(venues), len(years), years[0], years[-1])
    )

    papers = collect(fetcher, venues, years, faculty_keys, faculty_display)
    fetcher.log("Found %d papers with >=1 MIT faculty author." % len(papers))

    out = sys.stdout if args.output == "-" else open(args.output, "w", encoding="utf-8", newline="")
    try:
        if args.format == "json":
            json.dump(papers, out, indent=2, ensure_ascii=False)
            out.write("\n")
        elif args.format == "markdown":
            write_markdown(papers, out)
        else:
            write_csv(papers, out)
    finally:
        if out is not sys.stdout:
            out.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
