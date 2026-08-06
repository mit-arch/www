const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const TIMELINE_FILE = path.join(__dirname, "machines", "timeline.yaml");

// Every field here is displayed except `source`, which exists to make the claim
// checkable. See the header of timeline.yaml for the year convention.
const REQUIRED_FIELDS = ["year", "name", "people", "blurb", "source"];

function describe(entry, index) {
  return entry && entry.name ? `"${entry.name}"` : `entry #${index + 1}`;
}

// A machine with no citation is a machine nobody can check, and this timeline
// makes factual claims about real people's work. Fail the build rather than
// publish one: a broken build is cheap, a wrong attribution on a public page is
// not.
function validate(entries) {
  const problems = entries.flatMap((entry, index) => {
    const missing = REQUIRED_FIELDS.filter((field) => !entry || !entry[field]);
    return missing.length ? [`${describe(entry, index)} is missing: ${missing.join(", ")}`] : [];
  });

  if (problems.length) {
    throw new Error(
      `[machines] ${problems.length} invalid entr${problems.length === 1 ? "y" : "ies"} in ${TIMELINE_FILE}:\n  - ${problems.join("\n  - ")}`,
    );
  }

  return entries;
}

module.exports = function machines() {
  if (!fs.existsSync(TIMELINE_FILE)) {
    throw new Error(`[machines] missing ${TIMELINE_FILE}`);
  }

  const entries = yaml.load(fs.readFileSync(TIMELINE_FILE, "utf8")) || [];

  if (!Array.isArray(entries)) {
    throw new Error(`[machines] ${TIMELINE_FILE} must contain a list`);
  }

  return validate(entries)
    .slice()
    .sort((left, right) => Number(left.year) - Number(right.year));
};
