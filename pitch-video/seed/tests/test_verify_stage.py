import verify_stage


def test_expected_bands():
    assert verify_stage.EXPECTED_BAND == {1: "weak", 2: "developing", 3: "strong"}


def test_band_mismatch_is_reported():
    assert verify_stage.compare(3, band="developing", score=65) == [
        "Stage 3: Aarav's Quadratics band is 'developing' (65%), expected 'strong'"]


def test_band_match_is_clean():
    assert verify_stage.compare(1, band="weak", score=39) == []
