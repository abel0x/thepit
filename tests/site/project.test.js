/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// Ownership, licensing, versions and publishing for the whole repository.
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var Pit = require("../../shared/js/pit.js");

var root = path.resolve(__dirname, "../..");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };
var pkg = JSON.parse(read("package.json"));
var PAGES = ["index.html"].concat(Object.keys(Pit.TABLES).map(function (id) { return "games/" + id + "/index.html"; }));
// Dependencies, private notes and hidden folders hold no source of the pit.
var IGNORED = ["node_modules", "audits"];

function sourceFiles(dir) {
  var found = [];
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).forEach(function (entry) {
    var rel = dir ? dir + "/" + entry.name : entry.name;
    if (entry.isDirectory()) {
      if (IGNORED.indexOf(entry.name) === -1 && entry.name.charAt(0) !== ".") found = found.concat(sourceFiles(rel));
    } else if (/\.(?:html|css|c?js|sh)$/.test(entry.name)) {
      found.push(rel);
    }
  });
  return found;
}

test("every source file names abel0x as its copyright holder and the license", function () {
  assert.equal(pkg.author, "abel0x");
  assert.equal(pkg.license, "AGPL-3.0-or-later");
  var files = sourceFiles("");
  assert.ok(files.length > 40, "found " + files.length + " source files");
  files.forEach(function (file) {
    var head = read(file).slice(0, 400);
    assert.match(head, /ThePit · Copyright \(C\) 2026 abel0x/, file);
    assert.match(head, /SPDX-License-Identifier: AGPL-3\.0-or-later/, file);
  });
});

test("the license texts stay verbatim", function () {
  // The AGPL's own terms forbid changing it, and GitHub only recognizes the
  // license when it matches the published text.
  var license = read("LICENSE");
  assert.match(license, /^\s+GNU AFFERO GENERAL PUBLIC LICENSE\n\s+Version 3, 19 November 2007\n/);
  assert.match(license, /END OF TERMS AND CONDITIONS/);
  assert.match(read("shared/fonts/OFL.txt"), /SIL OPEN FONT LICENSE/);
});

test("every page, the README and the changelog carry the same version", function () {
  var version = pkg.version.replace(/\./g, "\\.");
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  PAGES.forEach(function (page) {
    var about = read(page).match(/<section class="about"[\s\S]*?<\/section>/);
    assert.ok(about, page + " has an about section");
    assert.match(about[0], new RegExp("</span> " + version + "</span>"), page);
    ["disclaimerTitle", "disclaimerPlayMoney", "disclaimerOdds", "disclaimerWarranty", "licenseNotice", "sourceCode"].forEach(function (key) {
      assert.match(about[0], new RegExp('data-i18n="' + key + '"'), page + " " + key);
    });
  });
  assert.match(read("CHANGELOG.md"), new RegExp("## \\[" + version + "\\]"));
  assert.match(read("README.md"), new RegExp("Version " + version));
});

test("the README leads with the play-money disclaimer and names the license", function () {
  var readme = read("README.md");
  assert.match(readme, /^# ThePit\n/);
  assert.ok(readme.indexOf("**Disclaimer:**") < readme.indexOf("## Play"), "the disclaimer comes first");
  assert.match(readme, /play money only/i);
  assert.match(readme, /## License\n\nCopyright \(C\) 2026 abel0x\n/);
  assert.match(readme, /GNU Affero General Public License/);
});

test("the only way out of the pit is its source code, in a new tab", function () {
  PAGES.forEach(function (page) {
    var external = (read(page).match(/<a\b[^>]*>/gi) || []).filter(function (link) { return /href="https?:/.test(link); });
    assert.equal(external.length, 1, page);
    assert.match(external[0], /href="https:\/\/github\.com\/abel0x\/thepit"/, page);
    assert.match(external[0], /target="_blank"/, page);
    assert.match(external[0], /rel="noopener"/, page);
  });
  assert.equal(pkg.repository.url, "git+https://github.com/abel0x/thepit.git");
});

test("GitHub Pages serves the files as they are, with a matching link preview", function () {
  assert.ok(fs.existsSync(path.join(root, ".nojekyll")), "without .nojekyll Pages runs the site through Jekyll");
  var homepage = pkg.homepage;
  assert.equal(homepage, "https://abel0x.github.io/thepit/");
  PAGES.forEach(function (page) {
    var html = read(page);
    var meta = function (property) {
      var match = html.match(new RegExp('<meta property="' + property + '" content="([^"]+)"'));
      assert.ok(match, page + " " + property);
      return match[1];
    };
    assert.equal(meta("og:url"), homepage + page.replace(/index\.html$/, ""), page);
    assert.equal(meta("og:site_name"), "ThePit", page);
    var image = meta("og:image");
    assert.equal(image, homepage + "assets/social-preview.jpg", page);
    var jpeg = fs.readFileSync(path.join(root, image.slice(homepage.length)));
    assert.equal(jpeg.readUInt16BE(0), 0xffd8, "JPEG");
    var size = null;
    for (var offset = 2; offset < jpeg.length && !size; offset += 2 + jpeg.readUInt16BE(offset + 2)) {
      var marker = jpeg.readUInt16BE(offset);
      if (marker === 0xffc0 || marker === 0xffc2) size = jpeg.readUInt16BE(offset + 7) + "x" + jpeg.readUInt16BE(offset + 5);
    }
    assert.equal(size, meta("og:image:width") + "x" + meta("og:image:height"), page);
  });
});

test("search engines find every page once, under its published address", function () {
  var urls = PAGES.map(function (page) { return pkg.homepage + page.replace(/index\.html$/, ""); });
  PAGES.forEach(function (page, i) {
    var canonical = read(page).match(/<link rel="canonical" href="([^"]+)" \/>/g) || [];
    assert.deepEqual(canonical, ['<link rel="canonical" href="' + urls[i] + '" />'], page);
  });
  var sitemap = read("sitemap.xml");
  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">\n/);
  var listed = (sitemap.match(/<loc>[^<]*<\/loc>/g) || []).map(function (loc) { return loc.slice(5, -6); });
  assert.deepEqual(listed, urls);
  // Search Console keeps the site verified only while the lobby carries its token.
  var tokens = PAGES.map(function (page) { return (read(page).match(/name="google-site-verification"/g) || []).length; });
  assert.deepEqual(tokens, PAGES.map(function (page) { return page === "index.html" ? 1 : 0; }));
  assert.match(read("index.html"), /<meta name="google-site-verification" content="XacY5y52KIxRIvYicwvR-VJYq8Yw1od7nXy4N9m9evI" \/>/);
});

test("the lobby and every table name ThePit on home screens", function () {
  PAGES.forEach(function (page) {
    var html = read(page);
    assert.match(html, /<meta name="application-name" content="ThePit" \/>/, page);
    // Without it iOS names the home-screen icon after the page title.
    assert.match(html, /<meta name="apple-mobile-web-app-title" content="ThePit" \/>/, page);
  });
  assert.match(read("index.html"), /<title>ThePit<\/title>/);
});

test("continuous integration runs the core suite without installing anything", function () {
  var workflow = read(".github/workflows/tests.yml");
  assert.match(workflow, /node: \[22, 24, 26\]/);
  assert.match(workflow, /- run: npm test/);
  assert.doesNotMatch(workflow, /npm (?:install|ci)/);
  assert.match(pkg.scripts.test, /^node --test /);
});

test("the site is published only from main and only after the core suite passes", function () {
  var workflow = read(".github/workflows/tests.yml");
  var pages = workflow.slice(workflow.indexOf("\n  pages:"));
  assert.ok(pages.length > 1, "the workflow has a pages job");
  assert.match(pages, /\n    needs: core\n/);
  assert.match(pages, /\n    if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'\n/);
  assert.match(pages, /uses: actions\/deploy-pages@v\d+/);
  assert.match(pages, /cancel-in-progress: false/);
});
