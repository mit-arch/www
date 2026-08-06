const basePath = process.env.SITE_BASE_PATH;

module.exports = {
  title: "MIT Architecture Research Group",
  shortTitle: "MIT ARCH",
  basePath,
  description:
    "Research in computer architecture, systems, compilers, and hardware-software co-design.",
  groupName: "MIT ARCH Group",
  location: "Massachusetts Institute of Technology",
  // All three are rendered by the homepage hero. `title` is the display line;
  // the machine timeline underneath it is what makes the claim checkable.
  hero: {
    eyebrow: "Cambridge, Massachusetts",
    title: "Six decades of computer architecture.",
    body:
      "The MIT Architecture Group has been designing state of the art tools and systems across the hardware, software, and system abstractions for six decades."
  },
  // Matches the three columns of the homepage news strip.
  newsHomepageCount: 3,
  currentSeminarTerm: "fall-2026",
  seminarBlurb:
    "The architecture seminar convenes researchers from academia and industry to discuss computer architecture, systems, machine learning infrastructure, and adjacent hardware research."
};
