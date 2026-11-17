#!/usr/bin/env python3
"""
KaagazLab voice-clip generator (Sarvam Bulbul v3).

Reads content/lines.csv (columns: file, en, kn) and writes
public/audio/<lang>/<file>.mp3 for English (en-IN) and Kannada (kn-IN).
Also creates 25 grid-position clips (pos_r1c1 ... pos_r5c5) from the
row named "pos_template" (use {r} and {c} in its text).

Needs: Python 3 (no extra packages) and ffmpeg (brew install ffmpeg).

Usage:
  export SARVAM_API_KEY="your-key"
  python3 scripts/gen_audio.py                    # all languages, skip existing
  python3 scripts/gen_audio.py --lang en          # English only
  python3 scripts/gen_audio.py --only welcome --force
  python3 scripts/gen_audio.py --speaker priya --pace 0.9
  python3 scripts/gen_audio.py --dry-run          # list what would be made
"""
import argparse
import base64
import csv
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

API_URL = "https://api.sarvam.ai/text-to-speech"
LANGS = {"en": "en-IN", "kn": "kn-IN"}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, "content", "lines.csv")
OUT_DIR = os.path.join(ROOT, "public", "audio")

FFMPEG_FILTER = (
    "silenceremove=start_periods=1:start_threshold=-45dB,"
    "areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
    "loudnorm=I=-16:TP=-1.5:LRA=11"
)


def load_clips():
    with open(CSV_PATH, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    clips = []  # (file, {lang: text})
    for row in rows:
        name = (row.get("file") or "").strip()
        if not name:
            continue
        texts = {lang: (row.get(lang) or "").strip() for lang in LANGS}
        if name == "pos_template":
            for r in range(1, 6):
                for c in range(1, 6):
                    clips.append(
                        (f"pos_r{r}c{c}",
                         {l: t.replace("{r}", str(r)).replace("{c}", str(c)) for l, t in texts.items()})
                    )
        else:
            clips.append((name, texts))
    return clips


def call_sarvam(text, lang_code, speaker, pace, key):
    base = {
        "text": text,
        "model": "bulbul:v3",
        "speaker": speaker,
        "pace": pace,
        "speech_sample_rate": 22050,
        "output_audio_codec": "wav",
    }
    # The docs name the language field "language_code"; older examples use
    # "target_language_code". Try the documented one first, then the other.
    last_err = None
    for field in ("language_code", "target_language_code"):
        body = dict(base, **{field: lang_code})
        req = urllib.request.Request(
            API_URL,
            data=json.dumps(body).encode("utf-8"),
            headers={"api-subscription-key": key, "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            return base64.b64decode(data["audios"][0])
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:300]
            last_err = f"HTTP {e.code}: {detail}"
            if e.code in (400, 422):
                continue  # maybe the other field name; try again
            raise RuntimeError(last_err)
    raise RuntimeError(last_err)


def to_mp3(wav_bytes, out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(wav_bytes)
        tmp_path = tmp.name
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", tmp_path,
             "-af", FFMPEG_FILTER, "-ac", "1", "-ar", "22050", "-b:a", "64k", out_path],
            check=True,
        )
    finally:
        os.remove(tmp_path)


def main():
    p = argparse.ArgumentParser(description="Generate KaagazLab voice clips with Sarvam TTS")
    p.add_argument("--lang", choices=["en", "kn", "all"], default="all")
    p.add_argument("--only", help="generate just this clip name (e.g. welcome or pos_r2c3)")
    p.add_argument("--force", action="store_true", help="overwrite existing clips")
    p.add_argument("--speaker", default="ritu", help="Bulbul v3 voice, lowercase (default: ritu)")
    p.add_argument("--pace", type=float, default=0.9, help="0.5 to 2.0 (default 0.9)")
    p.add_argument("--dry-run", action="store_true", help="list clips without calling the API")
    args = p.parse_args()

    key = os.environ.get("SARVAM_API_KEY", "")
    if not key and not args.dry_run:
        sys.exit('SARVAM_API_KEY is not set. Run: export SARVAM_API_KEY="your-key"')
    if not args.dry_run and subprocess.run(["which", "ffmpeg"], capture_output=True).returncode != 0:
        sys.exit("ffmpeg not found. Run: brew install ffmpeg")

    langs = list(LANGS) if args.lang == "all" else [args.lang]
    clips = load_clips()
    if args.only:
        clips = [c for c in clips if c[0] == args.only]
        if not clips:
            sys.exit(f"No clip named '{args.only}' in {CSV_PATH}")

    made, skipped, missing, failed = 0, 0, [], []
    for lang in langs:
        for name, texts in clips:
            text = texts.get(lang, "")
            out = os.path.join(OUT_DIR, lang, f"{name}.mp3")
            if not text:
                missing.append(f"{lang}/{name}")
                continue
            if os.path.exists(out) and not args.force:
                skipped += 1
                continue
            if args.dry_run:
                print(f"[would make] {lang}/{name}: {text}")
                continue
            for attempt in (1, 2):
                try:
                    to_mp3(call_sarvam(text, LANGS[lang], args.speaker, args.pace, key), out)
                    made += 1
                    print(f"[ok] {lang}/{name}")
                    break
                except Exception as e:  # noqa: BLE001
                    if attempt == 2:
                        failed.append(f"{lang}/{name}: {e}")
                        print(f"[FAILED] {lang}/{name}: {e}")
                    else:
                        time.sleep(2)
            time.sleep(0.2)

    print("\n--- Summary ---")
    print(f"made: {made}   skipped (already exist): {skipped}")
    if missing:
        print(f"no text in CSV ({len(missing)}): fill these in lines.csv")
        for m in missing[:10]:
            print("  ", m)
        if len(missing) > 10:
            print(f"   ...and {len(missing) - 10} more")
    if failed:
        print(f"failed ({len(failed)}):")
        for f_ in failed:
            print("  ", f_)
        sys.exit(1)


if __name__ == "__main__":
    main()
