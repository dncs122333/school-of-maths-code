# Manual Asset Handoff

Since you selected manual generation for the video and image assets, please use the prompt files located in this directory (`frontend/lets-scroll-prompts`) to generate the files. You can use any AI image generator for the stills (like Midjourney, DALL-E, or Higgsfield) and any video generator that supports `--start-image` (like Kling, Runway Gen-3, or Luma) for the video clips.

Please save the generated files to the target paths mentioned below (`frontend/public/assets/...`).

## Desktop Assets (16:9 Landscape)

For image stills, they should be 3:2 landscape and at least 1536px wide.
For video clips, they should be 16:9 landscape, ~8 seconds long, and you MUST use the exact start image listed for each clip so that the camera seamlessly glides from one clip to the next.

| Step | Prompt File | Start Frame (Required for Video) | Save Output As |
|---|---|---|---|
| 1 (Still) | `still_notes.txt` | *None* | `frontend/public/assets/notes.webp` |
| 1 (Leg) | `leg_notes.txt` | `notes.webp` | `frontend/public/assets/vid/notes.mp4` |
| 2 (Still) | `still_tests.txt` | *None* | `frontend/public/assets/tests.webp` |
| 2 (Leg) | `leg_tests.txt` | **Last frame** of `vid/notes.mp4` | `frontend/public/assets/vid/tests.mp4` |
| 3 (Still) | `still_dpp.txt` | *None* | `frontend/public/assets/dpp.webp` |
| 3 (Leg) | `leg_dpp.txt` | **Last frame** of `vid/tests.mp4` | `frontend/public/assets/vid/dpp.mp4` |
| 4 (Still) | `still_leaderboard.txt`| *None* | `frontend/public/assets/leaderboard.webp` |
| 4 (Leg) | `leg_leaderboard.txt` | **Last frame** of `vid/dpp.mp4` | `frontend/public/assets/vid/leaderboard.mp4` |

*(Note: Extract the last frame of the previous video using `ffmpeg` or any video frame extractor to use as the `--start-image` for the next video. This ensures there is NO pop or jump cut between scenes).*

## Mobile Assets (9:16 Portrait)

For the mobile portrait version, the stills should be 9:16 portrait and at least 1080px wide. The video clips must also be 9:16 portrait and around 8 seconds long. The same frame-matching rules apply.

| Step | Prompt File | Start Frame (Required for Video) | Save Output As |
|---|---|---|---|
| 1 (Still) | `still_notes_mobile.txt` | *None* | `frontend/public/assets/notes_mobile.webp` |
| 1 (Leg) | `leg_notes.txt` | `notes_mobile.webp` | `frontend/public/assets/vid/notes_mobile.mp4` |
| 2 (Still) | `still_tests_mobile.txt` | *None* | `frontend/public/assets/tests_mobile.webp` |
| 2 (Leg) | `leg_tests.txt` | **Last frame** of `notes_mobile.mp4`| `frontend/public/assets/vid/tests_mobile.mp4` |
| 3 (Still) | `still_dpp_mobile.txt` | *None* | `frontend/public/assets/dpp_mobile.webp` |
| 3 (Leg) | `leg_dpp.txt` | **Last frame** of `tests_mobile.mp4`| `frontend/public/assets/vid/dpp_mobile.mp4` |
| 4 (Still) | `still_leaderboard_mobile.txt` | *None* | `frontend/public/assets/leaderboard_mobile.webp` |
| 4 (Leg) | `leg_leaderboard.txt` | **Last frame** of `dpp_mobile.mp4`| `frontend/public/assets/vid/leaderboard_mobile.mp4` |

Once you've placed these files in `frontend/public/assets`, the landing page engine will automatically detect and load them.
