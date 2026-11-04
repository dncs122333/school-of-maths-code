"""Edit the pitch video: scene clips + voiceover + graphics + captions (+ music) -> out/school-of-maths-pitch.mp4

    ../backend/.venv/bin/python edit/compose.py --rough      # quick encode, missing voice lines become silence
    ../backend/.venv/bin/python edit/compose.py --final      # needs every voice line; adds music if audio/music.mp3 exists

Scene length = max(voice + 0.4 s, min(clip, target)). Longer clips are sped up (at most 1.8x) then trimmed;
shorter ones hold their last frame. Scenes overlap by a 0.3 s crossfade.
"""
import argparse
import json
import subprocess
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLIPS, AUDIO, OUT = ROOT / "clips", ROOT / "audio", ROOT / "out"
BUILD = ROOT / "edit" / "build"
XFADE = 0.3
VO_LEAD = 0.2
VO_PAD = 0.4
MAX_SPEED = 1.8
PHONE = {"x": 300, "y": 70, "w": 434, "h": 940}
PHONE_CLIPS = {"s04", "s05p", "s09", "s10", "s11a", "s11b", "s11c"}
RENDERED = {"s01": "hook", "s02": "title", "s13": "endcard"}
FPS = 30


def plan_scene(vo_s, clip_s, target_s):
    length = round(max(vo_s + VO_PAD, min(clip_s, target_s)), 3)
    speed = 1.0
    if clip_s > length:
        speed = round(min(clip_s / length, MAX_SPEED), 3)
    pad = round(max(0.0, length - clip_s / speed), 3)
    return {"length": length, "speed": speed, "pad_s": pad}


def build_timeline(scenes, vo, clips):
    out, t = [], 0.0
    for s in scenes:
        p = plan_scene(vo.get(s["id"], 0.0), clips.get(s["id"], s["target_s"]), s["target_s"])
        out.append({"id": s["id"], "start": round(t, 3), "end": round(t + p["length"], 3), "vo_s": vo.get(s["id"], 0.0),
                    "text": s.get("vo", ""), "caption": s.get("caption", ""), **p})
        t += p["length"] - XFADE
    return out


def _ts(x):
    ms = int(round(x * 1000))
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


def write_srt(timeline, path):
    rows = []
    for i, t in enumerate(timeline, 1):
        a = t["start"] + VO_LEAD
        rows.append(f"{i}\n{_ts(a)} --> {_ts(a + t['vo_s'])}\n{t['text']}\n")
    Path(path).write_text("\n".join(rows))


def _probe(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                          str(path)]).strip())


def vo_durations(scenes):
    """Real voice lengths; missing lines are estimated at 2.6 words/s so the rough cut can still be timed."""
    known = json.loads((AUDIO / "durations.json").read_text()) if (AUDIO / "durations.json").exists() else {}
    return {s["id"]: known.get(s["id"], round(len(s["vo"].split()) / 2.6, 2)) for s in scenes}


def clip_durations(scenes):
    out = {}
    for s in scenes:
        if s["id"] in RENDERED:
            out[s["id"]] = s["target_s"]
        else:
            files = [CLIPS / f"{c}.mp4" for c in s["clips"]]
            out[s["id"]] = sum(_probe(f) for f in files) if all(f.exists() for f in files) else s["target_s"]
    return out


def run(cmd):
    subprocess.run(cmd, check=True)


def _desktop_chain(speed, length, pad):
    # The app centres its content at ~1240 px; crop to 1440x810 around it and scale up so text reads on a phone
    return (f"setpts=PTS/{speed},crop=1440:810:240:0,scale=1920:1080:flags=lanczos,fps={FPS},"
            f"tpad=stop_mode=clone:stop_duration={pad + 1},trim=duration={length},setpts=PTS-STARTPTS")


def _phone_chain(speed, length, pad):
    return (f"setpts=PTS/{speed},scale={PHONE['w']}:{PHONE['h']}:flags=lanczos,fps={FPS},"
            f"tpad=stop_mode=clone:stop_duration={pad + 1},trim=duration={length},setpts=PTS-STARTPTS")


def render_scene(s, t, quick):
    """One scene -> build/scene_<id>.mp4 (1920x1080, 30 fps, voice track padded to the scene length)."""
    sid, L = s["id"], t["length"]
    out = BUILD / f"scene_{sid}.mp4"
    paths, filt = [], []

    def inp(path, loop=False):
        paths.append((path, loop))
        return len(paths) - 1

    if sid in RENDERED:
        v = inp(BUILD / f"{sid}.mp4")
        filt.append(f"[{v}:v]fps={FPS},trim=duration={L},setpts=PTS-STARTPTS,scale=1920:1080[base]")
    elif sid == "s11":
        bg = inp(BUILD / "climb_bg.mp4")
        filt.append(f"[{bg}:v]fps={FPS},trim=duration={L},setpts=PTS-STARTPTS[bg]")
        seg = L / 3
        parts = []
        for k, c in enumerate(s["clips"]):
            i = inp(CLIPS / f"{c}.mp4")
            filt.append(f"[{i}:v]{_phone_chain(1.0, seg + XFADE, seg + XFADE)}[p{k}]")
            parts.append(f"p{k}")
        filt.append(f"[p0][p1]xfade=transition=fade:duration=0.6:offset={seg - 0.3}[p01]")
        filt.append(f"[p01][p2]xfade=transition=fade:duration=0.6:offset={2 * seg - 0.3},trim=duration={L}[ph]")
        mask = inp(BUILD / "phone_mask.png", loop=True)
        frame = inp(BUILD / "phone_frame.png", loop=True)
        filt.append(f"[bg][ph]overlay={PHONE['x']}:{PHONE['y']}[a];[a][{mask}:v]overlay=0:0[b];[b][{frame}:v]overlay=0:0:shortest=1[base]")
    else:
        n = len(s["clips"])
        segs = []
        for k, c in enumerate(s["clips"]):
            src = CLIPS / f"{c}.mp4"
            clip_s = _probe(src)
            seg_len = round(L / n + (XFADE if n > 1 and k < n - 1 else 0), 3)
            p = plan_scene(0, clip_s, seg_len)
            i = inp(src)
            if c in PHONE_CLIPS:
                bgp = inp(BUILD / f"phonebg_{sid}.png", loop=True)
                mask = inp(BUILD / "phone_mask.png", loop=True)
                frame = inp(BUILD / "phone_frame.png", loop=True)
                filt.append(f"[{i}:v]{_phone_chain(p['speed'], seg_len, p['pad_s'])}[ph{k}]")
                filt.append(f"[{bgp}:v][ph{k}]overlay={PHONE['x']}:{PHONE['y']}:shortest=1[a{k}];[a{k}][{mask}:v]overlay=0:0:shortest=1[b{k}];"
                            f"[b{k}][{frame}:v]overlay=0:0:shortest=1,trim=duration={seg_len},setpts=PTS-STARTPTS[seg{k}]")
            else:
                filt.append(f"[{i}:v]{_desktop_chain(p['speed'], seg_len, p['pad_s'])}[seg{k}]")
            segs.append(f"seg{k}")
        if n == 1:
            filt.append(f"[{segs[0]}]null[base]")
        else:
            filt.append(f"[{segs[0]}][{segs[1]}]xfade=transition=fade:duration={XFADE}:offset={round(L / n, 3)}[base]")
    last = "base"
    cap = BUILD / f"caption_{sid}.png"
    has_phone = any(c in PHONE_CLIPS for c in s["clips"]) and sid != "s05"
    if t["caption"] and cap.exists() and not has_phone and sid not in RENDERED and sid != "s11":
        ci = inp(cap, loop=True)
        filt.append(f"[{last}][{ci}:v]overlay=0:0:shortest=1:enable='gte(t,0.3)'[cap]")
        last = "cap"
    filt.append(f"[{last}]format=yuv420p,trim=duration={L}[vout]")
    wav = AUDIO / f"{sid}.wav"
    if wav.exists():
        a = inp(wav)
        filt.append(f"[{a}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={int(VO_LEAD * 1000)}:all=1,apad,atrim=duration={L}[aout]")
    else:
        filt.append(f"anullsrc=r=48000:cl=stereo,atrim=duration={L}[aout]")
    args = ["ffmpeg", "-y", "-loglevel", "error"]
    for path, loop in paths:
        args += (["-loop", "1", "-framerate", str(FPS)] if loop else []) + ["-i", str(path)]
    args += ["-filter_complex", ";".join(filt), "-map", "[vout]", "-map", "[aout]", "-r", str(FPS),
             "-c:v", "libx264", "-preset", "veryfast" if quick else "medium", "-crf", "16",
             "-c:a", "pcm_s16le", "-t", str(L), str(out).replace(".mp4", ".mov")]
    run(args)
    return Path(str(out).replace(".mp4", ".mov"))


def assemble(files, timeline, out, quick, music):
    args = ["ffmpeg", "-y", "-loglevel", "error"]
    for f in files:
        args += ["-i", str(f)]
    filt, v, a = [], "0:v", "0:a"
    for k in range(1, len(files)):
        off = round(timeline[k]["start"], 3)
        filt.append(f"[{v}][{k}:v]xfade=transition=fade:duration={XFADE}:offset={off}[v{k}]")
        filt.append(f"[{a}][{k}:a]acrossfade=d={XFADE}[a{k}]")
        v, a = f"v{k}", f"a{k}"
    total = timeline[-1]["end"]
    if music:
        args += ["-stream_loop", "-1", "-i", str(music)]
        m = len(files)
        filt.append(f"[{m}:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.16,atrim=duration={total},"
                    f"afade=t=in:d=1.5,afade=t=out:st={total - 3}:d=3[mus]")
        filt.append(f"[{a}]asplit[vo1][vo2];[mus][vo2]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[duck];"
                    f"[vo1][duck]amix=inputs=2:normalize=0[mix]")
        a = "mix"
    filt.append(f"[{a}]loudnorm=I=-14:TP=-1.5:LRA=11[aout]")
    args += ["-filter_complex", ";".join(filt), "-map", f"[{v}]", "-map", "[aout]",
             "-c:v", "libx264", "-preset", "veryfast" if quick else "slow", "-crf", "21", "-maxrate", "3M", "-bufsize", "6M",
             "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(out)]
    run(args)


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--rough", action="store_true")
    g.add_argument("--final", action="store_true")
    a = ap.parse_args()
    scenes = json.loads((ROOT / "script" / "scenes.json").read_text())
    vo = vo_durations(scenes)
    missing = [s["id"] for s in scenes if not (AUDIO / f"{s['id']}.wav").exists()]
    if a.final and missing:
        raise SystemExit(f"Voice lines missing for {missing}; run voice/tts.py first")
    timeline = build_timeline(scenes, vo, clip_durations(scenes))
    BUILD.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(exist_ok=True)
    plan = {"phone": PHONE, "scenes": [
        {"id": s["id"], "length": t["length"], "caption": s.get("caption", ""),
         "headline": s.get("caption") if any(c in PHONE_CLIPS for c in s["clips"]) else None,
         "render": RENDERED.get(s["id"]) or ("climb" if s["id"] == "s11" else None), "scores": s.get("scores")}
        for s, t in zip(scenes, timeline)]}
    (BUILD / "plan.json").write_text(json.dumps(plan, indent=1))
    run(["node", str(ROOT / "record" / "render.mjs"), str(BUILD), str(BUILD / "plan.json")])
    files = []
    for s, t in zip(scenes, timeline):
        files.append(render_scene(s, t, a.rough))
        print(f"{s['id']}: {t['length']}s (speed {t['speed']}, hold {t['pad_s']}s)")
    name = "school-of-maths-pitch-rough.mp4" if a.rough else "school-of-maths-pitch.mp4"
    music = AUDIO / "music.mp3"
    assemble(files, timeline, OUT / name, a.rough, music if music.exists() else None)
    write_srt(timeline, OUT / name.replace(".mp4", ".srt"))
    print(f"{OUT / name}: {timeline[-1]['end']}s, missing voice: {missing or 'none'}")


if __name__ == "__main__":
    main()
