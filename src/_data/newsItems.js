const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const NEWS_PATH = path.join(__dirname, "news.yaml");

module.exports = function newsItems() {
  if (!fs.existsSync(NEWS_PATH)) {
    return [];
  }

  return yaml.load(fs.readFileSync(NEWS_PATH, "utf8")) || [];
};
