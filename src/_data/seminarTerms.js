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
      const talks = Array.isArray(parsed.talks)
        ? parsed.talks.slice().sort((a, b) => new Date(a.date) - new Date(b.date))
        : [];

      return {
        slug: term.slug || slug,
        label: term.title || slug,
        description: term.schedule_note || "",
        theme: term.theme || "",
        host: term.host || "",
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
