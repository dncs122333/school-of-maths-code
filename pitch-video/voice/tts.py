"""Voiceover: one WAV per scene from script/scenes.json, using Gemini TTS and the project's GEMINI_API_KEY.

    ../backend/.venv/bin/python voice/tts.py [--voice Kore] [--only s01,s11]
Writes audio/<id>.wav and audio/durations.json. Unchanged scenes (same text + voice) are skipped.
"""
import argparse
import base64
import hashlib
import json
import os
import time
import wave
from pathlib import Path

import requests
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / "audio"
MODEL = "gemini-2.5-flash-preview-tts"
STYLE = ("Read this as the narrator of a short product film for the owner of a maths coaching centre in India. "
         "Warm, clear, confident and unhurried, like a trusted teacher. Natural pauses at commas and ellipses:")


def cache_key(text, voice):
    return hashlib.sha256(f"{MODEL}|{voice}|{STYLE}|{text}".encode()).hexdigest()[:16]


def write_wav(pcm: bytes, path: Path, rate=24000):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)


def synthesize(text, voice, key):
    body = {"contents": [{"parts": [{"text": f"{STYLE} {text}"}]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
    for attempt in range(4):
        r = requests.post(url, json=body, headers={"x-goog-api-key": key}, timeout=120)
        if r.status_code in (429, 500, 503):
            print(f"  {r.status_code}, waiting:", r.text[:200].replace("\n", " "))
            time.sleep(65)
            continue
        r.raise_for_status()
        part = r.json()["candidates"][0]["content"]["parts"][0]["inlineData"]
        return base64.b64decode(part["data"])
    r.raise_for_status()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default="Kore")
    ap.add_argument("--only", default="")
    ap.add_argument("--out", default=str(AUDIO))
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    key = os.environ.get("GEMINI_API_KEY") or dotenv_values(ROOT.parent / "backend" / ".env").get("GEMINI_API_KEY")
    if not key:
        raise SystemExit("GEMINI_API_KEY not found")
    scenes = json.loads((ROOT / "script" / "scenes.json").read_text())
    only = set(filter(None, a.only.split(",")))
    stamp_path = out / "keys.json"
    stamps = json.loads(stamp_path.read_text()) if stamp_path.exists() else {}
    durations_path = out / "durations.json"
    durations = json.loads(durations_path.read_text()) if durations_path.exists() else {}
    for s in scenes:
        if only and s["id"] not in only:
            continue
        k = cache_key(s["vo"], a.voice)
        wav = out / f"{s['id']}.wav"
        if stamps.get(s["id"]) != k or not wav.exists():
            write_wav(synthesize(s["vo"], a.voice, key), wav)
            stamps[s["id"]] = k
            stamp_path.write_text(json.dumps(stamps, indent=1))
        with wave.open(str(wav)) as w:
            durations[s["id"]] = round(w.getnframes() / w.getframerate(), 3)
        print(s["id"], durations[s["id"]], "s")
    stamp_path.write_text(json.dumps(stamps, indent=1))
    durations_path.write_text(json.dumps(durations, indent=1))
    print("total", round(sum(durations.values()), 1), "s")


if __name__ == "__main__":
    main()
