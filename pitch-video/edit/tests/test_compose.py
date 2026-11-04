import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "edit"))
import compose  # noqa: E402


def test_scene_length_is_max_of_clip_and_vo_plus_pad():
    p = compose.plan_scene(vo_s=6.0, clip_s=4.0, target_s=5)
    assert p["length"] == 6.4 and p["pad_s"] == 2.4 and p["speed"] == 1.0


def test_long_clip_is_sped_up_at_most_1_8x_then_trimmed():
    p = compose.plan_scene(vo_s=5.0, clip_s=20.0, target_s=10)
    assert p["length"] == 10 and p["speed"] == 1.8 and p["pad_s"] == 0


def test_timeline_overlaps_by_crossfade():
    scenes = [{"id": "a", "vo": "x", "target_s": 4, "clips": ["a"]}, {"id": "b", "vo": "y", "target_s": 4, "clips": ["b"]}]
    tl = compose.build_timeline(scenes, {"a": 3.0, "b": 3.0}, {"a": 4.0, "b": 4.0})
    assert [t["start"] for t in tl] == [0.0, 4.0 - compose.XFADE]
    assert tl[1]["end"] == round(tl[1]["start"] + tl[1]["length"], 3)


def test_srt_times_match_timeline(tmp_path):
    scenes = [{"id": "a", "vo": "Hello there.", "caption": "Hello", "target_s": 4, "clips": ["a"]},
              {"id": "b", "vo": "Bye.", "caption": "", "target_s": 4, "clips": ["b"]}]
    tl = compose.build_timeline(scenes, {"a": 2.0, "b": 1.0}, {"a": 4.0, "b": 4.0})
    out = tmp_path / "x.srt"
    compose.write_srt(tl, out)
    text = out.read_text()
    assert "1\n00:00:00,200 --> 00:00:02,200\nHello there.\n" in text
    assert "2\n00:00:03,900 --> 00:00:04,900\nBye.\n" in text


def test_total_length_within_bounds():
    scenes = json.loads((ROOT / "script" / "scenes.json").read_text())
    tl = compose.build_timeline(scenes, compose.vo_durations(scenes), compose.clip_durations(scenes))
    assert 110 <= tl[-1]["end"] <= 135, tl[-1]["end"]
