# MIT Architecture Research Group Site

Static site for the MIT Architecture Research group, built with Eleventy and designed for straightforward GitHub-based updates.

## Local development

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

The generated site is written to `dist/`.

## Content locations

- `src/_data/people/faculty.yaml`
- `src/_data/people/students.yaml`
- `src/_data/people/affiliates.yaml`
- `src/_data/people/alumni.yaml`
- `src/_data/news.yaml`
- `src/_data/seminars/config.yaml`
- `src/_data/seminars/*.yaml`

All sample names, talks, and links are placeholders for a computer architecture research group and should be replaced before publication.

## Updating people

Add a new YAML item to the appropriate file under `src/_data/people/`.

Required fields:

- `name`
- one display field such as `title`, `program`, or `current_role`

Recommended fields:

- `website`
- `image`
- `affiliation`

If `website` is present, the person’s name and image become links. If `image` points to a missing file, the site falls back to the built-in placeholder portrait.

## Updating news

Append a new item to `src/_data/news.yaml` with:

- `date` in `YYYY-MM-DD`
- `title`
- `summary`

Optional fields:

- `link`
- `category`

News is sorted automatically from newest to oldest.

## Updating the seminar

Each term lives in its own YAML file inside `src/_data/seminars/`, such as `spring-2026.yaml`.

Each file has:

- a `term:` block with `slug`, `title`, and optional `theme`, `host`, `schedule_note`
- a `talks:` list with `date`, `speaker`, `affiliation`, `title`, and optional supporting fields such as `time`, `location`, `format`, `abstract`, and `link`

To add a talk, append a new entry under `talks:` in the relevant term file.

To start a new term:

1. Copy an existing term file.
2. Rename it to the new slug, for example `fall-2026.yaml`.
3. Update `term.slug`, `term.title`, and the schedule metadata.
4. Replace the old `talks:` list with the new term’s talks.

To switch the active seminar page:

1. Open `src/_data/seminars/config.yaml`.
2. Set `active_term` to the new term slug.

Older terms automatically remain available in the archive.

## Calendar subscription

The site generates a single calendar feed for all seminar talks across all terms at `/seminar/all.ics`.

If a talk includes `time`, the feed exports it as a timed event. If `time` is omitted, the event is exported as an all-day entry.
