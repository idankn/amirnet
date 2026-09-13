"""Turn a listening passage's transcript into a stored audio file — stage 0.5,
run once per passage, never live.

    python -m pipeline.generate_audio                 # placeholder tone, everything missing audio
    python -m pipeline.generate_audio --passage-id 3
    python -m pipeline.generate_audio --provider elevenlabs
    python -m pipeline.generate_audio --dry-run

CLAUDE.md section 7 is explicit about why this is a batch script and not
something the app calls at playback time: pre-generate once, store the file,
ship with the app or serve from a CDN. Synthesizing per playback would mean
paying per play instead of once, no offline support, and added latency for
every listening question.

**No TTS provider is wired up to a real vendor yet** — requirements.txt has no
TTS SDK, and there is no *_API_KEY for one anywhere in this repo. Real speech
needs a decision (ElevenLabs, Google Cloud TTS, etc.) which hasn't been made,
so the default provider below writes a short tone instead of speech. That
keeps the rest of the pipeline — storage, `audio_path`, bundling, the app's
player — buildable and testable today, with exactly one piece (`synthesize`)
to swap in once a vendor is chosen.

Providers are picked with --provider or the TTS_PROVIDER env var, defaulting
to "placeholder". Adding a real one means writing one class with a
`synthesize(text, out_path)` method and an `extension` and registering it in
PROVIDERS — nothing else in this file needs to change.
"""

import argparse
import json
import math
import os
import struct
import sys
import urllib.error
import urllib.request
import wave
from pathlib import Path
from typing import Protocol

from . import config, db

AUDIO_OUT_DIR = config.ROOT / "app" / "assets" / "audio"


class TTSProvider(Protocol):
    """What a provider needs to implement to plug in here."""

    extension: str

    def synthesize(self, text: str, out_path: Path) -> None: ...


class PlaceholderProvider:
    """Writes a short tone instead of real speech. Zero cost, no network, no
    API key — a stand-in so the storage/bundling/playback path can be built
    and tested before a TTS vendor is chosen and paid for.

    Do NOT ship this to users: it is audibly a tone, not the transcript. It
    exists so `audio_path` is never null in local dev and the player screen
    has something real to play.
    """

    extension = "wav"

    def synthesize(self, text: str, out_path: Path) -> None:
        sample_rate = 22050
        seconds = 1.5
        freq = 440.0
        amplitude = 8000
        n_samples = int(seconds * sample_rate)

        with wave.open(str(out_path), "w") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            frames = bytearray()
            for i in range(n_samples):
                value = int(amplitude * math.sin(2 * math.pi * freq * i / sample_rate))
                frames += struct.pack("<h", value)
            wf.writeframes(bytes(frames))


class ElevenLabsProvider:
    """Real text-to-speech via ElevenLabs.

    Needs two environment variables:

      ELEVENLABS_API_KEY    from your ElevenLabs account settings.
      ELEVENLABS_VOICE_ID   a voice id from the ElevenLabs voice library.
                             CLAUDE.md section 7 requires a MALE, neutral
                             American accent, to match standardized exams —
                             pick one in the library and verify it by ear
                             before setting this. This file does not choose
                             a voice for you.

    This is one concrete implementation, not the only correct one — swap it
    for Google Cloud TTS, Azure, Play.ht, etc. by writing an equivalent class
    and adding it to PROVIDERS below. Nothing else here needs to know which
    vendor is in use.
    """

    extension = "mp3"

    def __init__(self) -> None:
        self.api_key = os.environ.get("ELEVENLABS_API_KEY")
        self.voice_id = os.environ.get("ELEVENLABS_VOICE_ID")
        if not self.api_key or not self.voice_id:
            sys.exit(
                "ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID must both be set to "
                "use --provider elevenlabs.\n"
                "Get a key at elevenlabs.io/app/settings/api-keys, and a voice id "
                "from the voice library — pick one that is male with a neutral "
                "American accent, per CLAUDE.md section 7, and listen to it first."
            )

    def synthesize(self, text: str, out_path: Path) -> None:
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}"
        body = json.dumps({
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        }).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "xi-api-key": self.api_key,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
        )
        try:
            with urllib.request.urlopen(req) as resp:
                out_path.write_bytes(resp.read())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")
            raise SystemExit(f"ElevenLabs rejected the request ({exc.code}):\n{detail}") from exc


PROVIDERS: dict[str, type] = {
    "placeholder": PlaceholderProvider,
    "elevenlabs": ElevenLabsProvider,
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--provider",
        choices=sorted(PROVIDERS),
        default=os.environ.get("TTS_PROVIDER", "placeholder"),
        help="which TTS backend to use (default: placeholder, or $TTS_PROVIDER)",
    )
    parser.add_argument(
        "--passage-id", type=int, help="only this passage, instead of every listening passage missing audio"
    )
    parser.add_argument(
        "--force", action="store_true", help="regenerate even for passages that already have audio_path set"
    )
    parser.add_argument("--dry-run", action="store_true", help="show what would be generated, write nothing")
    args = parser.parse_args()

    provider = PROVIDERS[args.provider]()

    conn = db.connect()
    if args.passage_id is not None:
        row = db.get_passage(conn, args.passage_id)
        if row is None or row["kind"] != "listening":
            conn.close()
            sys.exit(f"No listening passage with id {args.passage_id}.")
        rows = [row]
    else:
        rows = db.listening_passages(conn, missing_audio_only=not args.force)

    if not rows:
        conn.close()
        print("Nothing to do — every listening passage already has audio_path set. "
              "Pass --force to regenerate anyway.")
        return

    print(f"Provider: {args.provider}")
    print(f"{len(rows)} passage(s) to synthesize.\n")

    if args.dry_run:
        for r in rows:
            print(f"  #{r['id']}  {r['topic'] or ''!r:<24} {len(r['body'].split())} words")
        print("\n--dry-run: nothing written.")
        conn.close()
        return

    AUDIO_OUT_DIR.mkdir(parents=True, exist_ok=True)

    for r in rows:
        filename = f"listening-{r['id']}.{provider.extension}"
        out_path = AUDIO_OUT_DIR / filename
        provider.synthesize(r["body"], out_path)
        db.set_passage_audio(conn, r["id"], filename)
        print(f"  #{r['id']} -> {out_path}")

    conn.close()
    print(f"\nDone. {len(rows)} file(s) written to {AUDIO_OUT_DIR}")
    if args.provider == "placeholder":
        print(
            "\nThese are placeholder tones, not speech — audible proof the "
            "storage/bundling/playback path works, nothing more. Re-run with "
            "--provider elevenlabs (after setting ELEVENLABS_API_KEY and "
            "ELEVENLABS_VOICE_ID) once a TTS vendor is chosen, with --force to "
            "replace these."
        )


if __name__ == "__main__":
    main()
