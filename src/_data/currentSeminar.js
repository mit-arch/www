const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");
const site = require("./site");
const seminarTerms = require("./seminarTerms");

module.exports = function currentSeminar() {
  const configPath = path.join(__dirname, "seminars", "config.yaml");
  const config = fs.existsSync(configPath)
    ? yaml.load(fs.readFileSync(configPath, "utf8")) || {}
    : {};
  const terms = seminarTerms();
  return (
    terms.find((term) => term.slug === config.active_term) ||
    terms.find((term) => term.slug === site.currentSeminarTerm) ||
    terms[0] || {
      slug: "",
      label: "Seminar",
      talks: []
    }
  );
};
