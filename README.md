# SONA

The studio that listens. Speak. Record. Create.

Other DAWs hand you tools. SONA is the engineer in the room: you talk the way you would to a person, and the session changes only through a command the Action Engine can undo.

## Run

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
```

Desktop Chrome. Headphones while recording, so talkback does not print into the take. No account and no backend. Sessions live in IndexedDB in this browser.

Voice replies are on by default. The Voice button mutes them. If this browser has no Web Speech API, type the command. SONA does not invent a transcript.

## How a command moves

The brain never writes the session. The planner returns plain data:

```ts
{ track, action, amount, mode: "nondestructive" }
```

Safety may hold that data for a yes or no. The Action Engine is the only writer. Every command lands in the command log with an inverse, and undo puts the previous project back, the same object.

```mermaid
flowchart LR
  Artist[ARTIST] --> Voice[NATURAL VOICE]
  Voice --> Brain[SONA BRAIN]
  Brain --> Planner[INTENT / PLANNER]
  Planner --> Ears[SONA EARS]
  Planner --> Memory[SONA MEMORY]
  Planner --> Safety[SONA SAFETY]
  Ears --> Action[ACTION ENGINE]
  Memory --> Action
  Safety --> Action
  Action --> Record[RECORD]
  Action --> Edit[EDIT]
  Action --> Mix[MIX]
  Action --> Mic[MIC]
  Action --> Master[MASTER]
  Record --> DAW[SONA DAW]
  Edit --> DAW
  Mix --> DAW
  Mic --> DAW
  Master --> DAW
  DAW --> Audio[AUDIO ENGINE]
  Audio --> Export[EXPORT]
```

The planner in this build is deterministic and does not call a network. `Planner` is the interface a model can implement later. `Engineer.interpret` is the optional language-model seam. It stays unused unless both `VITE_SONA_LLM_URL` and a parsed miss are present. See `.env.example`. A model still has to come back as commands. It does not get a side door into the session.

## Listening

Three channels stay separate:

- **Command** — talk that may become DAW commands.
- **Performance** — speech during a take, kept as lyrics.
- **Analysis** — Ears reads audio, never a transcript.

While a take is rolling, speech is performance unless it starts with the wake word **SONA**, or you have opened the command window (`commands on`). A lyric such as "turn me up" does not move the fader. Typed text is always a command, because the box is the command channel. "SONA, stop" stops a take. The Stop button does too.

Many browsers do not give per-word speech times. SONA splits the real transcript evenly across the span the recognizer was actually active. It does not write words that were not heard. If recognition is unavailable, the take has no lyric index until a browser returns text.

## Capture path

Hardware stays neutral: a compatible mic into a clean preamp or interface. SONA stores that digitized signal as the raw take. Playback is a render:

```mermaid
flowchart LR
  Mic[Neutral mic] --> Pre[Clean interface]
  Pre --> Raw[RAW take]
  Raw --> Model[SONA Mic Model]
  Model --> Amp[SONA Preamp Model]
  Amp --> Chain[Tune / EQ / Comp / Reverb / Delay]
```

The raw buffer is never rewritten. Swapping a mic re-renders. The four models in this build are original curves: Warm Tube, Modern Condenser, Smooth Vintage, Bright Presence. They are not models of manufactured microphones. Branded models wait on a registry that carries licensing metadata. See `docs/ROADMAP.md`.

Find My Mic asks for about fifteen seconds of voice, ranks those four with a one-line reason, and can A/B two renders of the same raw sample. "Three." answers exactly: "Got it. I'll use that as your preferred mic." That choice is the default on new takes. If the browser has no microphone, or the pass is silence, SONA says so and does not invent a ranking.

## Modes

Artist, Creator, and Engineer are three views of one session. Switching them does not write the project. The same Action Engine runs a click, a key, and a spoken command.

- **Artist** is the booth: large record status, waveform, lyrics, takes, what Ears heard, and what SONA just did.
- **Creator** is the arrangement: tracks, clips, comp lanes, beat import, verse / hook / bridge markers, drag, trim, split, move, a loop region, and a punch region. Record inside a punch region stops at the punch out.
- **Engineer** is the mixer: per-track gain, pan, mute, solo, EQ, compressor, de-esser, tune, reverb and delay sends, group buses, reverb and delay returns, the master chain, meters, volume automation, and the command log.

`AudioEngine` implements `AudioEnginePort`. Inserts are SONA's own processors. A third-party plugin format is not hosted here.

## Investor path

The proof pass this build is aimed at:

1. Load the beat
2. Find my mic
3. Punch in on a lyric
4. Widen the doubles
5. "What you hearing?"
6. Fix
7. Mix
8. Master
9. Bounce

"Load the beat" drops in a generated scratch pattern so there is something to record on. It is not your instrumental. "Scratch vocal" drops two generated tones on the vocal track so you can comp without a microphone. They are not a performance and they have no lyrics. "Import a beat" takes a real audio file, by the picker or by dropping it on the window, and places that file as the raw beat.

Sessions autosave in IndexedDB. Save project writes a `.sona.json` file you can open later. Bounce WAV is on every mode.

## What you can say

Transport: record, stop, play, from the top, run it back, SONA let's work.

Punch and takes: punch me in at "I been on the road", save this take, use take 2 for the verse and take 3 for the hook.

Tune: tune it tighter, less tune, key of A minor. Tune is monophonic overlap-add. It is not formant-preserving and it is not live pitch correction.

Mix: bring the vocal up 3 db, make it brighter, more air, less harsh, bigger reverb, widen the doubles.

Mic: find my mic, let me hear 1 and 3, three, put me on a warmer mic, try something brighter.

Ears: what you hearing, fix the vocal. Ears can flag clipping, a quiet vocal, sibilance, mud, noise floor, and timing drift against the click. Sibilance arms the de-esser. The loudness number is an estimate from RMS, not BS.1770. The de-esser is a split-band compressor on the playback graph. It does not rewrite the raw take.

Memory: same as last time. The profile keeps preferred mic, preamp, vocal chain, loudness target, tune strength, and reverb taste.

Export: bounce my master, bounce my stems. Master is a WAV. Stems are one WAV per track in a zip. The click is not in the bounce.

A move of 6 dB or more, a delete, or recording over audio already there waits for yes. No leaves it alone.

## Limits

Hardware I/O beyond the browser's microphone and speakers, third-party plugin hosting, and the SONA ONE interface are not in this build, and they are not drawn as controls. Volume automation is the automation that plays. Tune is still monophonic overlap-add. Details are in `docs/ROADMAP.md`.
