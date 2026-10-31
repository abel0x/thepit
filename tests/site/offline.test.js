/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// The whole pit runs from local files: every page, from file:// or from the
// offline cache of the installed app.
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");
var Pit = require("../../shared/js/pit.js");

var root = path.resolve(__dirname, "../..");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };
var PAGES = ["index.html"].concat(Object.keys(Pit.TABLES).map(function (id) { return "games/" + id + "/index.html"; }));

// Site-relative path of something a page or stylesheet refers to.
function resolve(from, ref) {
  return path.posix.normalize(path.posix.join(path.posix.dirname(from), ref));
}

function pageRefs(page) {
  var html = read(page);
  var refs = [];
  var pattern = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"'#]+)["']/g;
  var match;
  while ((match = pattern.exec(html))) refs.push(match[1]);
  return refs;
}

function scripts(page) {
  return Array.from(read(page).matchAll(/<script\b[^>]*src=["']([^"']+)["']/g), function (match) {
    return resolve(page, match[1]);
  });
}

function stylesheets(page) {
  return pageRefs(page).filter(function (ref) { return /\.css$/.test(ref); }).map(function (ref) { return resolve(page, ref); });
}

function precached() {
  var block = read("sw.js").match(/var ASSETS = \[([\s\S]*?)\];/);
  assert.ok(block, "ASSETS list");
  return Array.from(block[1].matchAll(/"\.\/([^"]*)"/g), function (match) { return match[1]; });
}

function runtimeFiles() {
  var files = PAGES.slice();
  PAGES.forEach(function (page) { files.push.apply(files, scripts(page).concat(stylesheets(page))); });
  files.push("sw.js", "manifest.json");
  return files.filter(function (file, index) { return files.indexOf(file) === index; });
}

test("every page loads only local files that exist", function () {
  PAGES.forEach(function (page) {
    pageRefs(page).forEach(function (ref) {
      assert.doesNotMatch(ref, /^(?:https?:)?\/\//, page + " loads a remote file: " + ref);
      assert.ok(fs.existsSync(path.join(root, resolve(page, ref))), page + " is missing " + ref);
    });
    stylesheets(page).forEach(function (sheet) {
      Array.from(read(sheet).matchAll(/url\("?([^")]+)"?\)/g), function (match) { return match[1]; })
        .filter(function (ref) { return !/^data:/.test(ref) && ref.charAt(0) !== "#"; })
        .forEach(function (ref) {
          assert.ok(fs.existsSync(path.join(root, resolve(sheet, ref))), sheet + " is missing " + ref);
        });
    });
  });
});

test("every page loads the shared module first and the app bootstrap last", function () {
  PAGES.forEach(function (page) {
    var list = scripts(page);
    assert.equal(list[0], "shared/js/pit.js", page);
    assert.equal(list[list.length - 1], "shared/js/pwa.js", page);
    assert.match(read(page), /<link rel="manifest" href="(?:\.\.\/\.\.\/)?manifest\.json" \/>/, page);
    assert.match(read(page), /<link rel="apple-touch-icon" href="(?:\.\.\/\.\.\/)?apple-touch-icon\.png" \/>/, page);
  });
});

test("the offline cache holds everything every page loads", function () {
  var cached = precached();
  PAGES.forEach(function (page) {
    [page].concat(pageRefs(page).map(function (ref) { return resolve(page, ref); })).forEach(function (file) {
      assert.ok(cached.indexOf(file) !== -1, "not precached: " + file);
    });
    stylesheets(page).forEach(function (sheet) {
      Array.from(read(sheet).matchAll(/url\("?([^")]+\.woff2)"?\)/g), function (match) { return resolve(sheet, match[1]); })
        .forEach(function (font) { assert.ok(cached.indexOf(font) !== -1, "font not precached: " + font); });
    });
  });
  // A table opened by its folder address works offline too.
  Object.keys(Pit.TABLES).forEach(function (id) {
    assert.ok(cached.indexOf("games/" + id + "/") !== -1, "games/" + id + "/");
  });
});

test("the offline cache lists each existing file once", function () {
  var cached = precached();
  assert.equal(new Set(cached).size, cached.length, "duplicate entries");
  cached.forEach(function (asset) {
    if (asset === "") return;
    assert.match(asset, /^[A-Za-z0-9_./-]+$/);
    assert.doesNotMatch(asset, /\.\./);
    var file = path.join(root, asset);
    assert.ok(fs.existsSync(/\/$/.test(asset) ? path.join(file, "index.html") : file), "missing cached file: " + asset);
  });
  assert.match(read("sw.js"), /var CACHE_VERSION = "pit-v\d+";/);
});

// The sound modules a page loads, with the folder their samples live in and
// the tool that rebuilds them: a table's own sounds, or the card-table sounds.
var SOUND_MODULES = {
  "shared/js/card-sound.js": { audio: "shared/audio/", generator: "tools/generate-card-audio.sh" },
  "games/roulette/js/sound.js": { audio: "games/roulette/assets/audio/", generator: "tools/generate-roulette-audio.sh" }
};

test("every sound a table plays is real, cached in both formats and rebuildable", function () {
  var cached = precached();
  Object.keys(Pit.TABLES).forEach(function (id) {
    var page = "games/" + id + "/index.html";
    var modules = scripts(page).filter(function (file) { return SOUND_MODULES[file]; });
    assert.equal(modules.length, 1, page + " loads one sound module");
    var module = SOUND_MODULES[modules[0]];
    var samples = Array.from(read(modules[0]).matchAll(/["'](?:assets\/audio\/)?([\w-]+)\.ogg["']/g), function (match) {
      return module.audio + match[1];
    });
    assert.ok(samples.length >= 8, page);
    var generator = read(module.generator);
    assert.match(generator, new RegExp('audio_dir="\\$project_dir/' + module.audio.replace(/\/$/, "") + '"'));
    samples.forEach(function (sample) {
      [".ogg", ".m4a"].forEach(function (ext) {
        assert.ok(fs.existsSync(path.join(root, sample + ext)), sample + ext);
        assert.ok(cached.indexOf(sample + ext) !== -1, "not precached: " + sample + ext);
      });
      var ogg = fs.readFileSync(path.join(root, sample + ".ogg"));
      assert.equal(ogg.subarray(0, 4).toString("ascii"), "OggS", sample + ".ogg");
      var aac = fs.readFileSync(path.join(root, sample + ".m4a"));
      assert.equal(aac.subarray(4, 8).toString("ascii") + aac.subarray(8, 11).toString("ascii"), "ftypM4A", sample + ".m4a");
      assert.ok(ogg.length > 1024 && aac.length > 1024, sample);
      assert.ok(generator.indexOf(path.basename(sample) + ".ogg") !== -1, "the generator rebuilds " + sample);
    });
  });
});

test("the interface font ships once, for every page, as real WOFF2", function () {
  var fonts = fs.readdirSync(path.join(root, "shared/fonts")).filter(function (name) { return /\.woff2$/.test(name); });
  assert.deepEqual(fonts.sort(), ["thepit-sans-regular.woff2", "thepit-sans-semibold.woff2"]);
  fonts.forEach(function (name) {
    var buffer = fs.readFileSync(path.join(root, "shared/fonts", name));
    assert.equal(buffer.subarray(0, 4).toString("ascii"), "wOF2", name);
    assert.ok(buffer.length > 1024, name);
  });
  // Declared once, in the stylesheet every page loads first.
  var shared = read("shared/css/pit.css");
  assert.equal((shared.match(/@font-face \{/g) || []).length, 2);
  Array.from(shared.matchAll(/url\("?([^")]+\.woff2)"?\)/g), function (match) { return resolve("shared/css/pit.css", match[1]); })
    .forEach(function (font) { assert.match(font, /^shared\/fonts\/thepit-sans-(?:regular|semibold)\.woff2$/); });
  PAGES.forEach(function (page) {
    assert.equal(stylesheets(page)[0], "shared/css/pit.css", page + " loads the shared look first");
    stylesheets(page).slice(1).forEach(function (sheet) {
      assert.doesNotMatch(read(sheet), /@font-face/, sheet + " declares the font again");
    });
  });
});

test("every table loads the shared table look between the pit's and its own", function () {
  PAGES.filter(function (page) { return page !== "index.html"; }).forEach(function (page) {
    var sheets = stylesheets(page);
    var own = path.posix.dirname(page) + "/css/styles.css";
    assert.deepEqual(sheets.slice(0, 2), ["shared/css/pit.css", "shared/css/table.css"], page);
    assert.equal(sheets[sheets.length - 1], own, page + " ends with its own look");
    // Every table draws the pit's chips. A card table also draws the pit's
    // playing cards, and a table where a chip is picked from the tray and then
    // placed on a layout shares that frame; each look comes with its script.
    var extras = [];
    var html = read(page);
    assert.ok(scripts(page).indexOf("shared/js/chips.js") !== -1, page + " draws the pit's chips");
    if (scripts(page).indexOf("shared/js/cards.js") !== -1) extras.push("shared/css/cards.css");
    if (/class="chips-tray"[^>]*role="radiogroup"/.test(html)) extras.push("shared/css/chip-tables.css");
    assert.deepEqual(sheets.slice(2, -1), extras, page);
  });
  assert.deepEqual(stylesheets("index.html"), ["shared/css/pit.css", "lobby/css/styles.css"]);
});

test("runtime files are clean UTF-8 that never reach the network", function () {
  runtimeFiles().forEach(function (file) {
    var buffer = fs.readFileSync(path.join(root, file));
    assert.ok(buffer.length > 0, file);
    assert.notDeepEqual(Array.from(buffer.subarray(0, 3)), [0xef, 0xbb, 0xbf], "BOM in " + file);
    // A plain <a href> only navigates when followed; it never loads anything.
    var source = buffer.toString("utf8").replace(/<a\b[^>]*>/gi, "").replace(/<meta property="og:[^>]*>/gi, "");
    assert.doesNotMatch(source, /\uFFFD/, file);
    assert.doesNotMatch(source, /(?:src|href)\s*=\s*["']https?:\/\//i, file);
    assert.doesNotMatch(source, /url\(\s*["']?https?:\/\//i, file);
    assert.doesNotMatch(source, /fetch\(\s*["']https?:\/\//i, file);
    assert.doesNotMatch(source, /\b(?:XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/, file);
  });
});

test("runtime scripts parse and never execute generated code", function () {
  runtimeFiles().filter(function (file) { return /\.js$/.test(file); }).forEach(function (file) {
    var source = read(file);
    assert.doesNotThrow(function () { new vm.Script(source, { filename: file }); }, file);
    assert.doesNotMatch(source, /\beval\s*\(|\bnew\s+Function\b/, file);
  });
  PAGES.forEach(function (page) { assert.doesNotMatch(read(page), /\son[a-z]+\s*=/i, page + " has an inline handler"); });
});

test("the manifest describes a relative, standalone, offline ThePit", function () {
  var manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.name, "ThePit");
  assert.equal(manifest.short_name, "ThePit");
  assert.equal(manifest.start_url, "./index.html");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.id, "./");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.orientation, "any");
  assert.equal(manifest.lang, "en");
  assert.deepEqual(manifest.categories, ["games", "entertainment"]);
});

test("install icons are local, honest about their size, and include a maskable one", function () {
  var icons = JSON.parse(read("manifest.json")).icons;
  icons.forEach(function (icon) {
    assert.doesNotMatch(icon.src, /^(?:https?:)?\/\//);
    assert.ok(fs.existsSync(path.join(root, icon.src)), icon.src);
    assert.ok(icon.purpose === "any" || icon.purpose === "maskable", icon.src);
    if (icon.type === "image/svg+xml") { assert.equal(icon.sizes, "any"); return; }
    // Declared PNG sizes must match the pixels, or launchers rescale the art.
    var png = fs.readFileSync(path.join(root, icon.src));
    assert.equal(png.subarray(1, 4).toString(), "PNG", icon.src);
    assert.equal(png.readUInt32BE(16) + "x" + png.readUInt32BE(20), icon.sizes, icon.src);
  });
  var any = icons.filter(function (icon) { return icon.purpose === "any" && icon.type === "image/png"; });
  assert.deepEqual(any.map(function (icon) { return icon.sizes; }).sort(), ["192x192", "512x512"]);
  assert.ok(icons.some(function (icon) { return icon.purpose === "maskable" && icon.sizes === "512x512"; }));
});

test("iOS gets an opaque 180 px home-screen icon that is cached offline", function () {
  var png = fs.readFileSync(path.join(root, "apple-touch-icon.png"));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 180);
  assert.equal(png.readUInt32BE(20), 180);
  assert.equal(png[25], 2, "RGB without alpha, so iOS shows no black corners");
  assert.ok(precached().indexOf("apple-touch-icon.png") !== -1);
});

test("every icon is a self-contained scalable vector", function () {
  ["icon.svg"].concat(Object.keys(Pit.TABLES).map(function (id) { return "games/" + id + "/icon.svg"; })).forEach(function (file) {
    var icon = read(file);
    assert.match(icon, /^<svg\b/, file);
    assert.match(icon, /viewBox="0 0 512 512"/, file);
    assert.doesNotMatch(icon, /<(?:image|script|foreignObject)\b/i, file);
    assert.doesNotMatch(icon, /\b(?:href|src)=["'](?:https?:)?\/\//i, file);
  });
});

test("every cloth dresses every page, with a swatch in each picker", function () {
  var shared = read("shared/css/pit.css");
  var tableLook = read("shared/css/table.css");
  Pit.THEMES.filter(function (theme) { return theme !== Pit.DEFAULT_THEME; }).forEach(function (theme) {
    var block = new RegExp('body\\[data-theme="' + theme + '"\\]\\s*\\{([^}]*)\\}');
    var felt = shared.match(block);
    assert.ok(felt, "pit.css dresses " + theme);
    ["--page-highlight", "--page-mid", "--page-edge", "--felt-1", "--felt-2", "--topbar-top", "--modal-top", "--modal-bottom"].forEach(function (token) {
      assert.ok(felt[1].indexOf(token + ":") !== -1, theme + " " + token);
    });
    assert.match(tableLook, block, "table.css dresses " + theme);
  });
  PAGES.forEach(function (page) {
    var html = read(page);
    var offered = Array.from(html.matchAll(/data-set-theme="([^"]+)"/g), function (match) { return match[1]; });
    assert.deepEqual(offered, Pit.THEMES, page);
    var css = stylesheets(page).map(read).join("\n");
    Pit.THEMES.filter(function (theme) { return theme !== Pit.DEFAULT_THEME; }).forEach(function (theme) {
      assert.match(css, new RegExp('\\.theme-option\\[data-set-theme="' + theme + '"\\]'), page + " swatch for " + theme);
    });
  });
});
