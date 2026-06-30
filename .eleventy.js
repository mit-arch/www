const fs = require("node:fs");
const path = require("node:path");

function shortYear(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  const stringValue = String(value);
  return stringValue.length >= 2 ? stringValue.slice(-2) : stringValue;
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  eleventyConfig.addFilter("readableDate", (value, options = {}) => {
    if (!value) {
      return "";
    }

    const date = value instanceof Date ? value : new Date(value);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      ...options
    }).format(date);
  });

  eleventyConfig.addFilter("seminarDate", (value) => {
    if (!value) {
      return "";
    }

    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric"
    }).format(new Date(value));
  });

  eleventyConfig.addFilter("fileExists", (assetPath) => {
    if (!assetPath) {
      return false;
    }

    const localPath = path.join(process.cwd(), "src", assetPath.replace(/^\//, ""));
    return fs.existsSync(localPath);
  });

  eleventyConfig.addFilter("sortedNews", (items) => {
    return (items || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  });

  eleventyConfig.addFilter("personSubtitle", (person) => {
    if (!person) {
      return "";
    }

    if (person.title && person.affiliation) {
      return `${person.title}, ${person.affiliation}`;
    }

    if (person.title) {
      return person.title;
    }

    if (person.current_role) {
      return person.current_role;
    }

    if (person.program && person.year) {
      return `${person.program} '${shortYear(person.year)}`;
    }

    if (person.program) {
      return person.program;
    }

    if (person.affiliation) {
      return person.affiliation;
    }

    return "";
  });

  eleventyConfig.addFilter("isExternalUrl", (value) => /^https?:\/\//.test(value || ""));

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "dist"
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html", "11ty.js"]
  };
};
