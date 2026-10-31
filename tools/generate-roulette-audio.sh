#!/usr/bin/env bash
# ThePit · Copyright (C) 2026 abel0x
# SPDX-License-Identifier: AGPL-3.0-or-later
# Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms.

# Rebuilds the sound samples of Table 37 (roulette) with ffmpeg.
set -euo pipefail

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
audio_dir="$project_dir/games/roulette/assets/audio"
mkdir -p "$audio_dir"

encode() {
  output=$1
  shift
  ffmpeg -hide_banner -loglevel error -y "$@" -ar 44100 -ac 1 -c:a libvorbis -q:a 3 "$audio_dir/$output"
}

encode_noise() {
  output=$1
  source=$2
  filters=$3
  encode "$output" -f lavfi -i "$source" -af "$filters"
}

# --- Chips ---------------------------------------------------------------
encode_noise chip-click-1.ogg \
  "anoisesrc=color=white:amplitude=0.7:duration=0.085:sample_rate=44100:seed=11" \
  "highpass=f=2100,lowpass=f=9200,equalizer=f=3600:t=q:w=1.1:g=8,afade=t=out:st=0.012:d=0.073,volume=0.22"

encode_noise chip-click-2.ogg \
  "anoisesrc=color=white:amplitude=0.66:duration=0.095:sample_rate=44100:seed=12" \
  "highpass=f=1800,lowpass=f=8200,equalizer=f=2900:t=q:w=0.9:g=7,afade=t=out:st=0.015:d=0.08,volume=0.24"

# Layer the short impacts into a compact stack settlement.
encode chip-stack.ogg -i "$audio_dir/chip-click-1.ogg" \
  -filter_complex "[0:a]asplit=4[a][b][c][d];[b]adelay=48[b1];[c]adelay=103[c1];[d]adelay=158[d1];[a][b1][c1][d1]amix=inputs=4:normalize=0,volume=0.72"

# Low felt friction followed by three restrained chip contacts.
encode chips-push.ogg \
  -f lavfi -i "anoisesrc=color=brown:amplitude=0.8:duration=0.43:sample_rate=44100:seed=13" \
  -i "$audio_dir/chip-click-2.ogg" \
  -filter_complex "[0:a]highpass=f=180,lowpass=f=1350,afade=t=out:st=0.13:d=0.3,volume=0.2[slide];[1:a]asplit=3[c1][c2][c3];[c2]adelay=210[c2d];[c3]adelay=300[c3d];[slide][c1][c2d][c3d]amix=inputs=4:normalize=0,volume=0.78"

# --- Ball ----------------------------------------------------------------
# Modal synthesis: a resin ball striking steel is a handful of damped
# partials over a very short noise transient.
strike() {
  output=$1
  partials=$2
  duration=$3
  noise_level=$4
  level=$5
  encode "$output" \
    -f lavfi -i "aevalsrc=exprs='$partials':duration=$duration:sample_rate=44100" \
    -f lavfi -i "anoisesrc=color=white:amplitude=$noise_level:duration=0.012:sample_rate=44100:seed=21" \
    -filter_complex "[1:a]highpass=f=3000,afade=t=out:st=0:d=0.012[click];[0:a][click]amix=inputs=2:normalize=0,afade=t=out:st=$(awk "BEGIN{print $duration-0.03}"):d=0.03,volume=$level"
}

# The ball hits a deflector diamond: bright, ringing steel.
strike ball-clack.ogg \
  "0.34*sin(2*PI*2870*t)*exp(-34*t)+0.22*sin(2*PI*4710*t)*exp(-52*t)+0.14*sin(2*PI*6380*t)*exp(-75*t)+0.08*sin(2*PI*1460*t)*exp(-28*t)" \
  0.32 0.5 0.56

# Two lighter fret contacts, tuned apart so repeated hops never sound looped.
strike ball-bounce-1.ogg \
  "0.26*sin(2*PI*3420*t)*exp(-70*t)+0.15*sin(2*PI*5630*t)*exp(-105*t)+0.06*sin(2*PI*1980*t)*exp(-60*t)" \
  0.16 0.35 0.7

strike ball-bounce-2.ogg \
  "0.25*sin(2*PI*3180*t)*exp(-74*t)+0.14*sin(2*PI*5240*t)*exp(-110*t)+0.06*sin(2*PI*2210*t)*exp(-64*t)" \
  0.16 0.33 0.72

# Into the pocket: a firm knock, then the ball rattles against the walls.
encode ball-drop.ogg \
  -f lavfi -i "aevalsrc=exprs='0.3*sin(2*PI*1180*t)*exp(-38*t)+0.18*sin(2*PI*2360*t)*exp(-52*t)+0.1*sin(2*PI*3550*t)*exp(-80*t)':duration=0.32:sample_rate=44100" \
  -i "$audio_dir/ball-bounce-1.ogg" \
  -i "$audio_dir/ball-bounce-2.ogg" \
  -filter_complex "[1:a]asplit=2[b1][b2];[b1]volume=0.45,adelay=72[r1];[2:a]volume=0.3,adelay=128[r2];[b2]volume=0.16,adelay=171[r3];[0:a][r1][r2][r3]amix=inputs=4:normalize=0,afade=t=out:st=0.28:d=0.06,volume=0.85"

# Safari has long been unable to play Ogg; mirror every sample as AAC (.m4a).
# js/sound.js asks the browser (canPlayType) which of the two to use.
for ogg in "$audio_dir"/*.ogg; do
  ffmpeg -hide_banner -loglevel error -y -i "$ogg" \
    -ar 44100 -ac 1 -c:a aac -b:a 96k -movflags +faststart "${ogg%.ogg}.m4a"
done

printf 'Generated local table audio in %s\n' "$audio_dir"
