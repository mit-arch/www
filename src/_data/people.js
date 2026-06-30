const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const PEOPLE_DIR = path.join(__dirname, "people");
const SECTIONS = ["faculty", "students", "affiliates", "alumni"];

function readYamlArray(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return yaml.load(fs.readFileSync(filePath, "utf8")) || [];
}

function sortAlumni(items) {
  return items.slice().sort((left, right) => {
    return Number(right.graduation_year || 0) - Number(left.graduation_year || 0);
  });
}

module.exports = function people() {
  return SECTIONS.reduce((accumulator, section) => {
    const items = readYamlArray(path.join(PEOPLE_DIR, `${section}.yaml`));
    accumulator[section] = section === "alumni" ? sortAlumni(items) : items;
    return accumulator;
  }, {});
};
