/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// The language engine every page loads, followed by one page's own words.
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

var root = path.resolve(__dirname, "../..");

// Both scripts as one source, in the order the page loads them.
function i18nSource(stringsFile) {
  return fs.readFileSync(path.join(root, "shared/js/i18n.js"), "utf8") + "\n" +
    fs.readFileSync(path.join(root, stringsFile), "utf8");
}

// Runs them in a sandbox. saved: the language an earlier visit stored.
function loadI18n(stringsFile, saved) {
  var storage = { "pit.lang": saved };
  var sandbox = {
    localStorage: {
      getItem: function (key) { return storage[key] == null ? null : storage[key]; },
      setItem: function (key, value) { storage[key] = value; }
    },
    document: { querySelectorAll: function () { return []; }, documentElement: { setAttribute: function () {} } }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(i18nSource(stringsFile), sandbox);
  return { I18n: sandbox.I18n, storage: storage };
}

module.exports = { i18nSource: i18nSource, loadI18n: loadI18n };
