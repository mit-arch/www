# `scrape-mit-papers.py`

Finds recently published papers with at least one MIT faculty author, at the
venues CSrankings tracks. Reports title, authors, and conference.

Python 3.7+, standard library only. No install step.

```sh
# Architecture + PL, current year and last year, as CSV
./scripts/scrape-mit-papers.py > papers.csv

# Everything CSrankings tracks in the PL/architecture families, as Markdown
./scripts/scrape-mit-papers.py --groups all --years 3 --format markdown -o papers.md

# One venue, one year
./scripts/scrape-mit-papers.py --groups arch --only ISCA --start-year 2025 --end-year 2025

# Show the venue -> DBLP stream table and exit
./scripts/scrape-mit-papers.py --list-venues
```

Run `--help` for the full option list.

## Where the data comes from

**Who counts as MIT faculty** — [CSrankings][csr] publishes its curated roster as
`csrankings-[a-z].csv` (name, affiliation, homepage). Rows whose affiliation is
exactly `Massachusetts Inst. of Technology` are MIT's, currently 150 entries.
`dblp-aliases.csv` maps DBLP's alternate spellings onto canonical names, so a
paper that credits an author under a variant spelling still matches.

**The papers** — DBLP's [search API][api]. The script queries one *publication
stream* per venue per year and matches authors locally. That is far fewer
requests than querying each of the 150 faculty individually, and it gives
complete venue coverage.

Author matching is on DBLP's canonical name string, with accents folded and case
normalised. DBLP's homonym suffixes are deliberately preserved: `Daniel Sánchez
0003` is MIT's, and a different `Daniel Sanchez` must not match.

## Venue names are not stream names

There is no reliable mapping from a conference's name to the DBLP stream that
publishes it, so every stream key in this script was verified against the live
API rather than guessed. The traps:

| Venue | DBLP stream | Why it is not obvious |
| --- | --- | --- |
| FSE | `conf/sigsoft` | `conf/fse` is Formal Methods Europe, a different conference |
| ASE | `conf/kbse` | Named for the conference's former title |
| PLDI, POPL, ICFP, OOPSLA | `conf/pldi` etc. | Since 2017 these publish as issues of the journal PACMPL, so DBLP reports their venue as `Proc. ACM Program. Lang.` |
| FSE, ISSTA | `conf/sigsoft`, `conf/issta` | Same arrangement via PACMSE, `Proc. ACM Softw. Eng.` |
| SC | `conf/sc` | The stream also carries `SC Workshops` records |

For the SIGPLAN conferences, DBLP cross-lists each PACMPL paper back into its
conference stream, and the counts partition exactly — for 2025, PLDI 89 + POPL 79
+ ICFP 36 + OOPSLA 216 = 420 = all of `journals/pacmpl`. So querying the
conference streams attributes each paper unambiguously. The journal stream is
queried last as a backstop, resolving the conference from the issue-number field
(`POPL`, `PLDI`, `ICFP`, `OOPSLA1`, `OOPSLA2`).

Venues are grouped, and groups map to CSrankings areas. `arch` and `pl` are the
defaults; `logic`, `eda`, `embedded`, `hpc`, `se` and `os` cover the adjacent
areas CSrankings tracks but leaves unselected by default. `--groups all` takes
everything.

Records are filtered to research papers using CSrankings' own heuristics: a
6-page minimum, a 10-page minimum for ASE (its short papers are demos), and an
exception for ISCA, plus dropping editorships, front matter and indices.

## Rate limiting

DBLP's [crawling policy][crawl] asks for "at least one or two second between two
consecutive requests" and answers 429 with a `Retry-After` header when exceeded.
The client:

- spaces requests at least 2.0s apart (`--min-interval`);
- honours `Retry-After` exactly on 429;
- retries 5xx and dropped connections with exponential backoff and jitter —
  dblp.org returns transient 500s and 503s and will reset connections under load;
- identifies itself in the User-Agent (pass `--contact you@mit.edu`);
- caches every response for 7 days, so re-runs and interrupted runs cost nothing.

Please do not run several copies at once. Doing so during development was enough
to get this machine throttled to connection resets.

## Known limitations

- **CSrankings lists tenure-track faculty only.** Professors of the practice and
  research staff are absent — Joel S. Emer, for one. Add such names to a file and
  pass `--extra-faculty`; `scripts/mit-extra-faculty.txt` is a starting point.
- **Affiliations are current, not historical.** A paper written at MIT by someone
  who has since moved counts for their new institution, not MIT, and vice versa.
- **Faculty only.** Papers whose only MIT authors are students or postdocs are
  not reported. That is what "at least one MIT faculty" asks for, but it does
  mean the output is not the full set of MIT-affiliated papers.
- The roster has 150 entries but slightly fewer distinct people, since CSrankings
  lists some under two spellings (`Barbara Liskov` and `Barbara H. Liskov`).

[csr]: https://github.com/emeryberger/CSrankings
[api]: https://dblp.org/faq/How+to+use+the+dblp+search+API.html
[crawl]: https://dblp.org/faq/Am+I+allowed+to+crawl+the+dblp+website.html
