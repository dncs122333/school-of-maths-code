import sys
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import tts  # noqa: E402


def test_pcm_to_wav_has_right_duration(tmp_path):
    pcm = b"\x00\x00" * 24000 * 2  # 2 s of silence, 16-bit mono 24 kHz
    out = tmp_path / "a.wav"
    tts.write_wav(pcm, out)
    with wave.open(str(out)) as w:
        assert (w.getframerate(), w.getnchannels(), w.getsampwidth()) == (24000, 1, 2)
        assert abs(w.getnframes() / w.getframerate() - 2.0) < 1e-6


def test_cache_key_changes_with_text_and_voice():
    a = tts.cache_key("hello", "Kore")
    assert a == tts.cache_key("hello", "Kore")
    assert a != tts.cache_key("hello!", "Kore")
    assert a != tts.cache_key("hello", "Puck")
