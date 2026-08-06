#!/usr/bin/env node
//
// Generates a term file for src/_data/seminars/ — one row per week, all sharing
// the term's standing slot.
//
//   node scripts/new-seminar.js --day friday --time "1:00 PM" --room 34-401 --weeks 12
//
// The four options above are the whole interface. --start defaults to the next
// occurrence of --day, and --term is inferred from the month that start falls
// in, so neither has to be supplied unless the default is wrong.
//
// This writes exactly one file and nothing else. It deliberately does not touch
// src/_data/site.js: making a term the current one is a decision about when the
// site should start pointing at it, which is not the same moment as writing the
// schedule down. The reminder printed at the end says how to do it by hand.

const fs = require("node:fs");
const path = require("node:path");

const SEMINARS_DIR = path.join(__dirname, "..", "src", "_data", "seminars");
const DEFAULT_HOST = "MIT Architecture Research Group";

const WEEKDAYS = [
  { name: "sunday", short: "sun", plural: "Sundays" },
  { name: "monday", short: "mon", plural: "Mondays" },
  { name: "tuesday", short: "tue", plural: "Tuesdays" },
  { name: "wednesday", short: "wed", plural: "Wednesdays" },
  { name: "thursday", short: "thu", plural: "Thursdays" },
  { name: "friday", short: "fri", plural: "Fridays" },
  { name: "saturday", short: "sat", plural: "Saturdays" }
];

// The same shape src/seminar/all.11ty.js accepts. A time this regex rejects
// would silently downgrade every calendar entry to an all-day event, so the
// script refuses it here instead.
const TIME_PATTERN = /^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i;

const USAGE = `Usage:
  node scripts/new-seminar.js --day <weekday> --time <time> --room <room> --weeks <n>

Required:
  --day <weekday>     Day the seminar meets, e.g. friday or fri
  --time <time>       Start time, e.g. "1:00 PM" or 13:00
  --room <room>       Room the seminar meets in, e.g. 34-401
  --weeks <n>         Number of weekly slots to generate (1-52)

Optional:
  --start <date>      First meeting, YYYY-MM-DD. Defaults to the next --day.
                      Must fall on --day if given.
  --term <slug>       Term slug, e.g. fall-2027. Inferred from --start if omitted.
  --host <name>       Term host. Defaults to "${DEFAULT_HOST}".
  --force             Overwrite the term file if it already exists.
  --dry-run           Print the file to stdout instead of writing it.
`;

function fail(message) {
  process.stderr.write(`new-seminar: ${message}\n\n${USAGE}`);
  process.exit(1);
}

function parseArgs(argv) {
  const flags = { "--force": true, "--dry-run": true };
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      process.stdout.write(USAGE);
      process.exit(0);
    }

    if (!arg.startsWith("--")) {
      fail(`unexpected argument "${arg}"`);
    }

    const key = arg.slice(2);

    if (flags[arg]) {
      options[key] = true;
      continue;
    }

    const value = argv[index + 1];

    if (value === undefined || value.startsWith("--")) {
      fail(`${arg} needs a value`);
    }

    options[key] = value;
    index += 1;
  }

  return options;
}

function resolveWeekday(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const index = WEEKDAYS.findIndex(
    (day) => day.name === normalized || day.short === normalized
  );

  if (index === -1) {
    fail(`--day must be a weekday name, got "${value}"`);
  }

  return { index, ...WEEKDAYS[index] };
}

function resolveTime(value) {
  const trimmed = String(value || "").trim();

  if (!TIME_PATTERN.test(trimmed)) {
    fail(`--time must look like "1:00 PM" or "13:00", got "${value}"`);
  }

  // Normalise the meridiem to a single uppercase form so a term file never
  // mixes "1:00 pm" and "1:00 PM" across its rows.
  return trimmed.replace(/\s*([ap]m)$/i, (_, meridiem) => ` ${meridiem.toUpperCase()}`);
}

function resolveWeeks(value) {
  const weeks = Number(value);

  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
    fail(`--weeks must be a whole number from 1 to 52, got "${value}"`);
  }

  return weeks;
}

// Dates are handled entirely in UTC. A term spans a daylight-saving boundary
// more often than not, and local-time arithmetic would slip a day across it.
function todayUtc() {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

function resolveStart(value, weekday) {
  if (value === undefined) {
    const today = todayUtc();
    const offset = (weekday.index - new Date(today).getUTCDay() + 7) % 7;
    return today + offset * 86400000;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(`--start must be YYYY-MM-DD, got "${value}"`);
  }

  const parsed = Date.parse(`${value}T00:00:00Z`);

  if (Number.isNaN(parsed)) {
    fail(`--start is not a real date: "${value}"`);
  }

  if (new Date(parsed).getUTCDay() !== weekday.index) {
    fail(`--start ${value} is not a ${weekday.name}`);
  }

  return parsed;
}

function formatDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

// Matches how src/_data/seminarTerms.js ranks terms, so a generated slug sorts
// into the archive alongside the hand-written ones.
function inferTerm(startTimestamp) {
  const start = new Date(startTimestamp);
  const month = start.getUTCMonth() + 1;
  const season = month <= 5 ? "spring" : month <= 7 ? "summer" : "fall";

  return `${season}-${start.getUTCFullYear()}`;
}

function resolveTerm(value, startTimestamp) {
  const slug = value === undefined ? inferTerm(startTimestamp) : String(value).trim();

  if (!/^[a-z]+-\d{4}$/.test(slug)) {
    fail(`--term must look like fall-2027, got "${slug}"`);
  }

  const [season, year] = slug.split("-");
  return { slug, title: `${season[0].toUpperCase()}${season.slice(1)} ${year}` };
}

// Quotes only when a plain scalar would be ambiguous, so generated files read
// like the hand-written ones rather than like a serialiser's output.
function scalar(value) {
  const text = String(value);
  const needsQuotes =
    text === "" ||
    text !== text.trim() ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(text) ||
    /: |\s#/.test(text) ||
    /^(true|false|null|yes|no|on|off|~)$/i.test(text);

  return needsQuotes ? `"${text.replace(/(["\\])/g, "\\$1")}"` : text;
}

function buildYaml({ term, weekday, time, room, host, weeks, startTimestamp }) {
  const note = `${weekday.plural}, ${time}, ${room}`;

  const talks = Array.from({ length: weeks }, (_, week) => {
    const date = formatDate(startTimestamp + week * 7 * 86400000);

    return [
      `  - date: ${date}`,
      `    time: ${scalar(time)}`,
      `    location: ${scalar(room)}`,
      `    speaker: TBD`,
      `    title: TBD`
    ].join("\n");
  });

  return `${[
    `# Generated by scripts/new-seminar.js.`,
    `# ${weeks} weekly slot${weeks === 1 ? "" : "s"} from ${formatDate(startTimestamp)}.`,
    `# Replace the TBD speakers and titles as talks are confirmed; add`,
    `# "cancelled: true" with a title to keep a skipped week on the schedule.`,
    `term:`,
    `  slug: ${scalar(term.slug)}`,
    `  title: ${scalar(term.title)}`,
    `  host: ${scalar(host)}`,
    `  schedule_note: ${scalar(note)}`,
    ``,
    `talks:`
  ].join("\n")}\n${talks.join("\n\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  for (const required of ["day", "time", "room", "weeks"]) {
    if (options[required] === undefined) {
      fail(`--${required} is required`);
    }
  }

  const weekday = resolveWeekday(options.day);
  const time = resolveTime(options.time);
  const room = String(options.room).trim();

  if (!room) {
    fail("--room cannot be empty");
  }

  const weeks = resolveWeeks(options.weeks);
  const startTimestamp = resolveStart(options.start, weekday);
  const term = resolveTerm(options.term, startTimestamp);
  const host = options.host === undefined ? DEFAULT_HOST : String(options.host).trim();

  const yaml = buildYaml({ term, weekday, time, room, host, weeks, startTimestamp });

  if (options["dry-run"]) {
    process.stdout.write(yaml);
    return;
  }

  const target = path.join(SEMINARS_DIR, `${term.slug}.yaml`);

  if (fs.existsSync(target) && !options.force) {
    fail(`${path.relative(process.cwd(), target)} already exists; pass --force to overwrite`);
  }

  fs.mkdirSync(SEMINARS_DIR, { recursive: true });
  fs.writeFileSync(target, yaml);

  const last = formatDate(startTimestamp + (weeks - 1) * 7 * 86400000);

  process.stdout.write(
    `Wrote ${path.relative(process.cwd(), target)}\n` +
      `  ${term.title}, ${weeks} week${weeks === 1 ? "" : "s"}, ${formatDate(startTimestamp)} to ${last}\n` +
      `\nThe term is now in the archive. To make it the current one, set\n` +
      `currentSeminarTerm: "${term.slug}" in src/_data/site.js yourself —\n` +
      `this script does not edit site configuration.\n`
  );
}

main();
