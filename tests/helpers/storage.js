/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// Browser storage and Web Locks stand-ins shared by the wallet tests.

function memoryStorage() {
  var data = {};
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; },
    dump: function () { return data; }
  };
}

// A single-origin Web Locks stand-in: one holder at a time, FIFO waiters.
function fakeLocks() {
  var holder = null;
  var queue = [];
  function grant(entry) {
    holder = entry;
    Promise.resolve().then(function () { return entry.callback({ name: entry.name }); }).then(function (value) {
      holder = null;
      entry.resolve(value);
      next();
    }, function (error) {
      holder = null;
      entry.reject(error);
      next();
    });
  }
  function next() {
    var entry = queue.shift();
    if (entry) grant(entry);
  }
  return {
    request: function (name, options, callback) {
      return new Promise(function (resolve, reject) {
        var entry = { name: name, callback: callback, resolve: resolve, reject: reject };
        if (options.ifAvailable && holder) {
          Promise.resolve(callback(null)).then(resolve, reject);
          return;
        }
        if (options.signal) {
          options.signal.addEventListener("abort", function () {
            var index = queue.indexOf(entry);
            if (index !== -1) {
              queue.splice(index, 1);
              var error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            }
          });
        }
        if (holder) queue.push(entry);
        else grant(entry);
      });
    }
  };
}

module.exports = { memoryStorage: memoryStorage, fakeLocks: fakeLocks };
