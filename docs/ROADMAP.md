# SONA roadmap

Prices and hiring stay out of this repo. This file is the product sequence.

## Phase 1 — this MVP

An artist can walk a song with their voice, with a typed command when the browser has no speech recognizer.

The demo the booth is built toward is one rap or R&B song without touching the computer: load or import a beat, record verse, hook, and ad-libs, punch by lyric, comp takes, tune, mix, and bounce. The investor pass inside that song is: load the beat, find my mic, punch in on a lyric, widen the doubles, "what you hearing?", fix, mix, master, bounce.

What Phase 1 actually ships:

- Deterministic brain and planner. Commands are data: `{ track, action, amount, mode: "nondestructive" }`. The Action Engine is the only writer. The command log keeps an inverse, and undo restores that session exactly.
- Command listening, performance listening, and audio analysis are separate. A lyric during a take is not a mix move unless it is addressed with "SONA" or the session has the command window open.
- Multi-track record, scratch or imported beat, lyric punch with pre-roll, takes and comping, monophonic tune, mix, master, WAV and stem bounce, IndexedDB sessions.
- SONA Mic and SONA Preamp as nondestructive renders on an untouched raw take. Four original models. Find My Mic ranks them from a real voice.
- SONA Ears on the audio, not the transcript.
- A small memory profile: preferred mic and preamp, vocal chain, loudness target, tune strength, reverb taste. New sessions pick it up. "Same as last time" recalls it.
- Artist mode is the primary screen. Creator mode shows the timeline and mix controls that exist. Engineer mode is a switch and an honest Phase 2 panel.

Word timestamps, loudness, and tune are documented at their real limits in the README. Nothing in Phase 1 pretends to be a certified meter, a branded microphone, or a lyric that was not spoken.

## Phase 2 — the SONA DAW

Voice stays first. Touch and mouse stay second. `AudioEnginePort` is the seam. The Action Engine is still the only writer.

What this build does:

- **Artist mode** is the booth: waveform, lyrics, record status, takes, what Ears heard, and the commands SONA ran.
- **Creator mode** is arrangement: tracks, clips, comp lanes, beat import, verse / hook / bridge markers, drag, trim, split, move, loop, and punch.
- **Engineer mode** is the mixer that actually sounds: gain, pan, mute, solo, EQ, compressor, de-esser, tune, reverb and delay sends, group buses, returns, the master chain, meters, and volume automation. The command log is the undo history.

Sessions stay in IndexedDB and can also move as a project file. WAV bounce stays available in every mode.

Still later, and not drawn here: third-party plugin hosting, hardware I/O past the browser device, and the SONA ONE interface.

## Phase 3 — SONA Mic

The capture path is fixed: compatible mic, clean preamp or interface, raw recording, then SONA Mic Model, then SONA Preamp Model, then the rest of the chain. The raw take is never modified. Mic and preamp stay separate stages so the artist can change mics after the recording and hear a new render.

Phase 1 already does that with four original models and a ranked Find My Mic pass. Later, branded models enter only through a registry that carries licensing metadata, and only when they are licensed or otherwise supported. The MVP registry does not contain them.

## Phase 6 — context-aware listening

Phase 1 includes the basic version. The three channels stay separate, and a take treats speech as performance or lyrics unless the wake word is "SONA" or the session state allows commands.

The later phase deepens that booth behavior: richer session state for when a phrase is a command, tighter performance capture, and analysis that can talk about the record without ever using the lyric transcript as a fader move.

## SONA Sound Profile

Phase 1 memory is the seed: mic, preamp, chain, loudness, tune, reverb, and the last commands. The Sound Profile is that identity made portable, so a later session, a later booth, or SONA ONE opens already knowing how this artist likes to sound. It is applied as commands through the Action Engine. It does not rewrite raw audio.

## SONA ONE

SONA ONE is the hardware interface that comes after the software booth. It owns gain staging, monitoring, latency, the headphone mix, and mic-model calibration, so the raw capture the models expect is the one the artist actually printed. Phase 1 assumes a neutral mic and a clean interface and does not emulate that hardware.

## Build versus invent

Use what already exists for speech-to-text, the language model, plugin hosting, and storage. Those are plumbing.

The work that is SONA is audio understanding, the conversational workflow, DAW control, the Sound Profile, Ears, and mic modeling. A model may propose the next move. It still only emits commands, and the Action Engine is still the only thing that changes the session.
