const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const TERMS_DIR = path.join(__dirname, "seminars");
const termRank = {
  spring: 1,
  summer: 2,
  fall: 3,
  winter: 4
};

function parseTermSlug(slug) {
  const [yearPart, termPart] = slug.split("-");
  return {
    year: Number(yearPart),
    term: termPart || "",
    rank: termRank[termPart] || 0
  };
}

module.exports = function seminarTerms() {
  if (!fs.existsSync(TERMS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(TERMS_DIR)
    .filter((file) => file.endsWith(".yaml") && file !== "config.yaml")
    .map((file) => {
      const slug = file.replace(/\.yaml$/, "");
      const raw = fs.readFileSync(path.join(TERMS_DIR, file), "utf8");
      const parsed = yaml.load(raw) || {};
      const term = parsed.term || {};
      // Time and room are a property of the term's standing slot, not of any
      // one talk, so they live on `term` and are folded into each row here.
      // A talk may still carry its own `time`/`location` for the odd week that
      // moves; whatever it sets wins over the term default.
      const talks = Array.isArray(parsed.talks)
        ? parsed.talks
            .slice()
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .map((talk) => ({
              time: term.time || "",
              location: term.location || "",
              ...talk
            }))
        : [];

      return {
        slug: term.slug || slug,
        label: term.title || slug,
        // The line above the schedule is the standing slot spelled out, so it
        // is built from the same three fields rather than repeated by hand.
        // `schedule_note` still wins if a term needs to say something else.
        description:
          term.schedule_note ||
          [term.day, term.time, term.location].filter(Boolean).join(", "),
        theme: term.theme || "",
        host: term.host || "",
        time: term.time || "",
        location: term.location || "",
        talks
      };
    })
    .sort((a, b) => {
      const left = parseTermSlug(a.slug);
      const right = parseTermSlug(b.slug);

      if (left.year !== right.year) {
        return right.year - left.year;
      }

      return right.rank - left.rank;
    });
};
