#!/usr/bin/env node
/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// Draws assets/social-preview.jpg, the 1200×630 picture that link previews
// and the repository page show, from the lobby itself: every table's felt
// miniature and name, laid out in two rows under the pit's top bar. Since it
// reads the tables from index.html, a new table appears in the picture the
// next time this runs. Needs Puppeteer (the browser tests' dev dependency)
// and ImageMagick, which scales the double-size shot down and writes the JPEG.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const puppeteer = require("puppeteer");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "assets", "social-preview.jpg");
const WIDTH = 1200;
const HEIGHT = 630;

// The lobby, restyled for one still picture: no balance or buttons, no rules
// or limits, and the tables in rows as wide as the picture.
const STYLE = `
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  .topbar { position: static; }
  .topbar-actions { display: none; }
  .preview-tagline {
    font-size: 13px; letter-spacing: 3px; text-transform: uppercase;
    color: rgba(244, 239, 226, .66);
  }
  .floor { padding: 40px 34px 0; gap: 30px; }
  .floor-intro h2 { font-size: 34px; }
  .floor-intro p { font-size: 16px; }
  .table-list { --cols: 7; --gap: 14px; row-gap: 18px; }
  .table-card { border-radius: 14px; box-shadow: 0 12px 26px rgba(0, 0, 0, .45); }
  .table-card-felt { margin: 7px 7px 0; border-width: 5px; border-radius: 11px; }
  .table-card-body { padding: 9px 10px 11px; gap: 0; }
  .table-card-summary, .table-card-foot { display: none; }
  .table-card-link { flex-direction: column; align-items: flex-start; gap: 5px; }
  .table-lockup { font-size: 11px; letter-spacing: 2px; gap: 5px; }
  .table-number { min-width: 24px; padding: 1px 5px 2px; }
  .table-game {
    margin-left: 0; font-size: 10px; letter-spacing: 1.5px; line-height: 1.25;
    color: rgba(244, 239, 226, .7);
  }
  .floor-note {
    position: absolute; left: 0; right: 0; bottom: 24px; margin: 0;
    text-align: center; font-size: 13px;
  }
`;

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--lang=en-US"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(path.join(ROOT, "index.html")).href, { waitUntil: "load" });
    const tables = await page.evaluate((style) => {
      const sheet = document.createElement("style");
      sheet.textContent = style;
      document.head.append(sheet);
      const count = document.querySelectorAll(".table-card").length;
      const words = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
        "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
        "nineteen", "twenty"];
      const number = words[count] || String(count);
      const tagline = document.createElement("p");
      tagline.className = "preview-tagline";
      tagline.textContent = "Free · Open source · Works offline";
      document.querySelector(".topbar").append(tagline);
      document.querySelector(".floor-intro h2").textContent =
        number[0].toUpperCase() + number.slice(1) + " tables, one play-money balance";
      document.querySelector(".floor-intro p").textContent =
        "Card tables, wheels, dice and machines in English and Turkish, played entirely on your own device.";
      return count;
    }, STYLE);
    await page.evaluate(() => document.fonts.ready);

    // Everything has to fit: the last row of tables must end above the note.
    const overflow = await page.evaluate(() => {
      const last = [...document.querySelectorAll(".table-card")].pop().getBoundingClientRect();
      const foot = document.querySelector(".floor-note").getBoundingClientRect();
      return last.bottom > foot.top - 8;
    });
    if (overflow) throw new Error("The tables do not fit in the picture; tighten the layout.");

    const shot = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pit-preview-")), "shot.png");
    await page.screenshot({ path: shot });
    execFileSync("magick", [shot, "-resize", `${WIDTH}x${HEIGHT}!`, "-strip", "-quality", "88",
      "-sampling-factor", "4:2:0", "-interlace", "JPEG", OUT]);
    fs.rmSync(path.dirname(shot), { recursive: true, force: true });
    console.log(`Wrote ${path.relative(ROOT, OUT)} with ${tables} tables.`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
