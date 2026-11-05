#!/usr/bin/env bash
# ThePit · Copyright (C) 2026 abel0x
# SPDX-License-Identifier: AGPL-3.0-or-later
# Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms.

# Rebuilds the install icons of the pit from icon.svg with rsvg-convert and
# ImageMagick. The rounded tile serves browsers; iOS and maskable icons get a
# square tile of their own, since the system rounds or crops them itself.
set -euo pipefail

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
icon="$project_dir/icon.svg"
icons_dir="$project_dir/assets/icons"

# A square tile without the rim, the mark drawn at the given scale.
square_tile() {
  sed -e 's/ rx="112"//' -e '/id="rim"/d' -e "s/scale(\.8)/scale($1)/" "$icon"
}

render() {
  rsvg-convert -w "$2" -h "$2" "$1" -o "$3"
}

render "$icon" 192 "$icons_dir/icon-192.png"
render "$icon" 512 "$icons_dir/icon-512.png"

# iOS shows an icon with transparency on black, so it gets an opaque one.
square_tile .8 > "$work_dir/square.svg"
render "$work_dir/square.svg" 180 "$work_dir/apple.png"
magick "$work_dir/apple.png" -background '#04110b' -alpha remove -alpha off "PNG24:$project_dir/apple-touch-icon.png"

# A maskable icon may be cropped to a circle of 80% of its width: the mark
# shrinks to stay inside it.
square_tile .6 > "$work_dir/maskable.svg"
render "$work_dir/maskable.svg" 512 "$work_dir/maskable.png"
magick "$work_dir/maskable.png" -background '#04110b' -alpha remove -alpha off "PNG24:$icons_dir/icon-maskable-512.png"
