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

module.exports = function people() {
  return SECTIONS.reduce((accumulator, section) => {
    accumulator[section] = readYamlArray(path.join(PEOPLE_DIR, `${section}.yaml`));
    return accumulator;
  }, {});
};
