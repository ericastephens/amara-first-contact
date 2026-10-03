# Optional: measure Swahili speech-to-text on FLEURS (Phase 9)

The brief lists FLEURS as the way to "compare results against a published standard rather than asserting them".

1. Get 20 Swahili test clips: `datasets.load_dataset("google/fleurs", "sw_ke", split="test")` (Python, needs internet),
   save the audio as 16 kHz WAV files plus a `references.json` of the transcripts into `tests/fleurs_sw/`.
2. Ask Claude Code: *"Add a dev-only page /eval/asr that loads the Whisper model we use, transcribes every WAV in
   tests/fleurs_sw/, normalises text with the same normalize() as the intent model, and reports word error rate (WER)
   per clip and overall. Save the result to docs/MODEL_REPORT.md under 'Speech-to-text'."*
3. Report WER honestly in the video. Also report download size and time per clip on a mid-range Android phone.

What FLEURS does not cover: read Wikipedia sentences, not a mother describing symptoms at a drug shop; Kenyan
Swahili speakers; no background noise of a market or a farm; no Chagga or Maa.
