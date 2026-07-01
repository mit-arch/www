const fs = require("node:fs");
const path = require("node:path");
const site = require("./src/_data/site");

function shortYear(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  const stringValue = String(value);
  return stringValue.length >= 2 ? stringValue.slice(-2) : stringValue;
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/static": "." });
  eleventyConfig.addPassthroughCopy({ "src/assets/images": "assets/images" });
  eleventyConfig.addPassthroughCopy({ "src/assets/css/site.css": "assets/css/site.css" });

  eleventyConfig.addCollection("newsItems", (collectionApi) =>
    collectionApi
      .getFilteredByGlob("src/news-items/*.md")
      .sort((a, b) => b.date - a.date),
  );

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
  eleventyConfig.addFilter("siteUrl", (value) => {
    const stringValue = String(value || "");

    if (!stringValue || /^https?:\/\//.test(stringValue) || stringValue.startsWith("mailto:")) {
      return stringValue;
    }

    const normalizedBase = (site.basePath || "").replace(/\/$/, "");
    const normalizedPath = stringValue.startsWith("/") ? stringValue : `/${stringValue}`;

    return normalizedBase ? `${normalizedBase}${normalizedPath}` : normalizedPath;
  });

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "dist"
    },
    pathPrefix: site.basePath,
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html", "11ty.js"]
  };
};
