import { useEffect, useRef, useState } from "react";
import { ActionEngine } from "./action/ActionEngine";
import { AudioEngine } from "./audio/AudioEngine";
import { WavEncoder } from "./audio/WavEncoder";
import { command } from "./daw/DawCommand";
import { EngineerReplies } from "./engine/EngineerReplies";
import { ExportEngine } from "./export/ExportEngine";
import { Format } from "./model/Format";
import { Ids } from "./model/Ids";
import type { ChatMessage, MarkerName, MasterPreset, Project, StoredBuffer, StudioMode, Track } from "./model/types";
import { SonaMemory, SonaMemoryStore } from "./memory/SonaMemory";
import { MicChain } from "./mic/MicChain";
import { SonaPipeline, type PipelineState, type TurnResult } from "./pipeline/SonaPipeline";
import { wordsFromSpan } from "./record/WordTiming";
import { Session } from "./session/Session";
import { EngineerSpeech } from "./speech/EngineerSpeech";
import { SpeechInput } from "./speech/SpeechInput";
import { ProjectStore, type SessionSummary } from "./storage/ProjectStore";
import { ArtistStage } from "./ui/ArtistStage";
import { CommandLog } from "./ui/CommandLog";
import { EngineerPanel } from "./ui/EngineerPanel";
import { MasterBar } from "./ui/MasterBar";
import { PhaseTwoPanel } from "./ui/PhaseTwoPanel";
import { SessionsMenu } from "./ui/SessionsMenu";
import { Timeline } from "./ui/Timeline";
import { TransportBar } from "./ui/TransportBar";
import { WaveformMark } from "./ui/WaveformMark";

const DEMO = [
  "SONA, let's work",
  "load the beat",
  "find my mic",
  "punch me in at I been on the road",
  "widen the doubles",
  "what you hearing?",
  "fix the vocal",
  "make it brighter",
  "master it",
  "bounce my master",
];

export function App() {
  const engineRef = useRef<AudioEngine | null>(null);
  const storeRef = useRef<ProjectStore | null>(null);
  const memoryRef = useRef<SonaMemoryStore | null>(null);
  const speechRef = useRef<SpeechInput | null>(null);
  const pipeRef = useRef<PipelineState | null>(null);
  const api = useRef({ submit: (_text: string, _source: "speech" | "typed") => {} });
  const mutedRef = useRef(false);
  const captureKind = useRef<"take" | "find" | null>(null);
  const recordStartRef = useRef(0);
  const wordsRef = useRef<ReturnType<typeof wordsFromSpan>>([]);
  const utteranceStart = useRef<number | null>(null);
  const inputDb = useRef(0);
  const findTimer = useRef<number | null>(null);
  const masterOrigin = useRef<Project | null>(null);
  const masterEditing = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [pipe, setPipe] = useState<PipelineState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [mode, setMode] = useState<StudioMode>("artist");
  const [playhead, setPlayhead] = useState(0);
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState("");
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [meter, setMeter] = useState(0);
  const [bouncing, setBouncing] = useState(false);
  const [zoom, setZoom] = useState(48);
  const [recordStart, setRecordStart] = useState(0);
  const [livePeaks, setLivePeaks] = useState<Float32Array | null>(null);
  const [findSeconds, setFindSeconds] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  mutedRef.current = voiceMuted;

  function remember(next: PipelineState) {
    pipeRef.current = next;
    setPipe(next);
  }

  function speak(text: string) {
    if (!text.trim()) return;
    EngineerSpeech.speak(text, mutedRef.current, {
      onstart: () => {
        speechRef.current?.pause();
        if (captureKind.current) engineRef.current?.setCaptureOpen(false);
      },
      onend: () => {
        engineRef.current?.setCaptureOpen(true);
        speechRef.current?.resume();
      },
    });
  }

  function say(text: string) {
    setMessages((prev) => [...prev, EngineerReplies.message("engineer", text)].slice(-80));
    speak(text);
  }

  function publish(next: PipelineState, reply: string, userText?: string) {
    remember(next);
    setMessages((prev) => {
      const extra: ChatMessage[] = [];
      if (userText?.trim()) extra.push(EngineerReplies.message("user", userText.trim()));
      if (reply.trim()) extra.push(EngineerReplies.message("engineer", reply));
      return [...prev, ...extra].slice(-80);
    });
    if (reply.trim()) speak(reply);
  }

  function apply(nextProject: Project, track: string, action: string, amount: number | string | null, baseProject?: Project) {
    const state = pipeRef.current;
    if (!state) return;
    const session = baseProject ? { ...state.session, project: baseProject } : state.session;
    const applied = ActionEngine.applyProject(session, state.profile, state.log, state.future, nextProject, command(track, action, amount));
    remember({ ...state, session: applied.session, profile: applied.profile, log: applied.log, future: applied.future });
  }

  async function beginFind() {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      await engine.unlock();
      await engine.prepareInput();
    } catch {
      say("I can't hear a microphone in this browser. Allow the mic, or stay on typed commands. I won't invent a voice.");
      return;
    }
    captureKind.current = "find";
    engine.setCaptureOpen(true);
    engine.startCapture();
    const started = Date.now();
    setFindSeconds(15);
    if (findTimer.current) window.clearInterval(findTimer.current);
    findTimer.current = window.setInterval(() => {
      const left = Math.max(0, 15 - Math.round((Date.now() - started) / 1000));
      setFindSeconds(left);
      if (left <= 0) {
        if (findTimer.current) window.clearInterval(findTimer.current);
        findTimer.current = null;
        void endFind();
      }
    }, 250);
  }

  async function endFind() {
    if (captureKind.current !== "find") return;
    captureKind.current = null;
    if (findTimer.current) window.clearInterval(findTimer.current);
    findTimer.current = null;
    setFindSeconds(null);
    const engine = engineRef.current;
    const captured = engine?.stopCapture() ?? null;
    engine?.stop();
    const state = pipeRef.current;
    if (!state) return;
    if (!captured) {
      say("I didn't get a voice. Give me about fifteen seconds on the mic — I won't rank silence.");
      return;
    }
    const buffer: StoredBuffer = { id: Ids.next(), sampleRate: captured.sampleRate, channels: [captured.samples] };
    if (!audible(buffer)) {
      say("That was too quiet to call a voice. Move closer and try find my mic again.");
      return;
    }
    const ranked = SonaPipeline.finishFindMic(state, buffer);
    publish(ranked, ranked.reply);
  }

  async function beginTake(at: number) {
    const engine = engineRef.current;
    const state = pipeRef.current;
    if (!engine || !state) return;
    try {
      await engine.unlock();
      await engine.prepareInput();
    } catch {
      const undone = ActionEngine.undo(state.session, state.profile, state.log, state.future);
      publish(
        { ...state, session: undone.session, profile: undone.profile, log: undone.log, future: undone.future },
        "No microphone, so I didn't roll. Typed commands still run. I won't fake a take.",
      );
      return;
    }
    wordsRef.current = [];
    utteranceStart.current = null;
    captureKind.current = "take";
    recordStartRef.current = at;
    setRecordStart(at);
    engine.sync(state.session.project, state.session.buffers);
    engine.setCaptureOpen(true);
    engine.play(at);
    engine.startCapture();
  }

  async function endTake(result: TurnResult) {
    const engine = engineRef.current;
    if (!engine) return;
    if (captureKind.current === "find") {
      await endFind();
      return;
    }
    const kind = captureKind.current;
    captureKind.current = null;
    engine.stop();
    const captured = engine.stopCapture();
    if (kind !== "take" || !captured) return;
    const committed = ActionEngine.commitCapture(
      result.session,
      result.profile,
      result.log,
      result.future,
      captured,
      recordStartRef.current,
      wordsRef.current,
    );
    wordsRef.current = [];
    let next: TurnResult = {
      ...result,
      session: committed.session,
      profile: committed.profile,
      log: committed.log,
      future: committed.future,
      reply: committed.reply,
    };
    const bufferId = committed.session.project.tracks.flatMap((track) => track.clips).at(-1)?.bufferId;
    const buffer = bufferId ? committed.session.buffers[bufferId] : undefined;
    if (buffer && committed.reply.startsWith("Take is in")) {
      const ears = SonaPipeline.noteEars(next, buffer);
      next = { ...ears, reply: ears.pending ? ears.reply : `${committed.reply} ${ears.reply}` };
    }
    publish(next, next.reply);
  }

  async function playAudition(result: TurnResult) {
    const audition = result.audition;
    const engine = engineRef.current;
    if (!audition || !engine) return;
    const raw = result.session.buffers[audition.rawBufferId];
    const mic = result.ranking?.find((item) => item.rank === audition.active);
    if (!raw || !mic) return;
    await engine.unlock();
    engine.stop();
    engine.audition(MicChain.render(raw, mic.id, "clean"), audition.looping);
  }

  async function bounce(result: TurnResult) {
    setBouncing(true);
    try {
      const target = result.exportTarget ?? "master";
      const blob = target === "stems"
        ? await ExportEngine.stems(result.session.project, result.session.buffers)
        : await ExportEngine.master(result.session.project, result.session.buffers);
      const filename = Format.filename(result.session.project.name);
      WavEncoder.download(blob, target === "stems" ? filename.replace(/-mix\.wav$/, "-stems.zip") : filename);
    } catch (error) {
      say(error instanceof Error ? error.message : "The bounce didn't finish.");
    } finally {
      setBouncing(false);
    }
  }

  async function takeFile(file: File) {
    const engine = engineRef.current;
    const state = pipeRef.current;
    if (!engine || !state) return;
    try {
      const ctx = await engine.unlock();
      const bytes = await file.arrayBuffer();
      const audio = await ctx.decodeAudioData(bytes.slice(0));
      const channels: Float32Array[] = [];
      for (let index = 0; index < audio.numberOfChannels; index += 1) channels.push(audio.getChannelData(index).slice());
      const buffer: StoredBuffer = { id: Ids.next(), sampleRate: audio.sampleRate, channels };
      const placed = ActionEngine.placeBeat(state.session, state.profile, state.log, state.future, buffer);
      publish(
        { ...state, session: placed.session, profile: placed.profile, log: placed.log, future: placed.future },
        placed.reply,
        file.name,
      );
    } catch {
      say("I couldn't read that file as audio.");
    }
  }

  async function handleEffect(result: TurnResult) {
    const engine = engineRef.current;
    if (!engine) return;
    if (result.monitor != null) engine.setMonitor(result.monitor);
    if (result.inputGainDb != null) {
      inputDb.current += result.inputGainDb;
      engine.setInputGain(inputDb.current);
    }
    const action = result.log.at(-1)?.command.action;
    if (action === "audition" || action === "toggle-audition") {
      await playAudition(result);
      return;
    }
    engine.stopAudition();
    if (result.effect === "findMic") {
      await beginFind();
      return;
    }
    if (result.effect === "import") {
      fileRef.current?.click();
      return;
    }
    if (result.effect === "record") {
      await beginTake(result.session.playheadSec);
      return;
    }
    if (result.effect === "play") {
      await engine.unlock();
      engine.sync(result.session.project, result.session.buffers);
      engine.play(result.session.playheadSec);
      setPlayhead(result.session.playheadSec);
      return;
    }
    if (result.effect === "stop") {
      await endTake(result);
      return;
    }
    if (result.effect === "export") await bounce(result);
  }

  function submit(text: string, source: "speech" | "typed") {
    const state = pipeRef.current;
    const trimmed = text.trim();
    if (!state || !trimmed) return;
    const result = SonaPipeline.turn(state, trimmed, source);
    publish(result, result.reply, trimmed);
    void handleEffect(result);
  }

  api.current.submit = submit;

  useEffect(() => {
    const engine = new AudioEngine();
    const store = new ProjectStore();
    const memory = new SonaMemoryStore();
    const speech = new SpeechInput({
      onPartial: (text) => {
        setPartial(text);
        if (captureKind.current === "take" && text && utteranceStart.current == null) {
          utteranceStart.current = engine.clock();
        }
        if (!text) utteranceStart.current = null;
      },
      onFinal: (text) => {
        setPartial("");
        if (!pipeRef.current?.sessionActive) setListening(false);
        const trimmed = text.trim();
        if (!trimmed) return;
        if (captureKind.current === "take") {
          const end = engine.clock() ?? recordStartRef.current;
          const start = utteranceStart.current ?? end;
          utteranceStart.current = null;
          wordsRef.current = [...wordsRef.current, ...wordsFromSpan(trimmed, start, end)];
        }
        api.current.submit(trimmed, "speech");
      },
      onError: (message) => {
        setListening(false);
        setMessages((prev) => [...prev, EngineerReplies.message("engineer", message)].slice(-80));
      },
    });
    engineRef.current = engine;
    storeRef.current = store;
    memoryRef.current = memory;
    speechRef.current = speech;
    let cancel = false;
    void (async () => {
      const profile = await memory.load();
      inputDb.current = profile.inputGainDb;
      let session = Session.create();
      let restored = false;
      try {
        const last = await store.lastId();
        if (last) {
          const loaded = await store.load(last);
          if (loaded) {
            session = Session.fromSaved(loaded.project, loaded.buffers, loaded.messages);
            restored = true;
          }
        }
      } catch {
        session = Session.create();
        restored = false;
      }
      if (cancel) return;
      const created = SonaPipeline.create(session, profile);
      remember(restored ? { ...created, session } : created);
      setMessages(session.messages);
      setPlayhead(0);
      setReady(true);
      const list = await store.list().catch(() => []);
      if (!cancel) setSessions(list);
    })();
    return () => {
      cancel = true;
      if (findTimer.current) window.clearInterval(findTimer.current);
      speech.stop();
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    if (!pipe?.sessionActive) return;
    speechRef.current?.startContinuous();
    setListening(true);
    return () => {
      speechRef.current?.stop();
      setListening(false);
    };
  }, [pipe?.sessionActive]);

  useEffect(() => {
    if (!pipe) return;
    engineRef.current?.sync(pipe.session.project, pipe.session.buffers);
  }, [pipe]);

  useEffect(() => {
    if (!pipe) return;
    void memoryRef.current?.save(pipe.profile);
  }, [pipe]);

  useEffect(() => {
    if (!ready || !pipe) return;
    const handle = window.setTimeout(() => {
      void storeRef.current?.save(pipe.session.project, pipe.session.buffers, messages).then(() => storeRef.current?.list().then(setSessions).catch(() => undefined));
    }, 400);
    return () => window.clearTimeout(handle);
  }, [pipe, messages, ready]);

  useEffect(() => {
    if (!pipe || pipe.session.transport === "stopped") return;
    const handle = window.setInterval(() => {
      const clock = engineRef.current?.clock();
      if (clock != null) setPlayhead(clock);
      setMeter(engineRef.current?.meter() ?? 0);
      if (pipe.session.transport === "recording") setLivePeaks(engineRef.current?.livePeaks() ?? null);
    }, 80);
    return () => window.clearInterval(handle);
  }, [pipe]);

  useEffect(() => {
    if (pipe && pipe.session.transport === "stopped") setPlayhead(pipe.session.playheadSec);
  }, [pipe]);

  useEffect(() => {
    stageRef.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [mode]);

  function patch(trackId: string, action: string, amount: string | number | null, map: (track: Track) => Track) {
    const state = pipeRef.current;
    if (!state) return;
    const track = state.session.project.tracks.find((item) => item.id === trackId);
    if (!track) return;
    apply(
      { ...state.session.project, tracks: state.session.project.tracks.map((item) => item.id === trackId ? map(item) : item) },
      track.name,
      action,
      amount,
    );
  }

  function preview(project: Project) {
    const state = pipeRef.current;
    if (!state) return;
    remember({ ...state, session: { ...state.session, project } });
  }

  function beginMaster() {
    if (masterEditing.current) return;
    masterEditing.current = true;
    masterOrigin.current = pipeRef.current?.session.project ?? null;
  }

  function commitMaster() {
    if (!masterEditing.current) return;
    masterEditing.current = false;
    const before = masterOrigin.current;
    const state = pipeRef.current;
    masterOrigin.current = null;
    if (!before || !state) return;
    apply(state.session.project, "master", "gain-set", state.session.project.masterGainDb, before);
  }

  async function loadSession(id: string) {
    const loaded = await storeRef.current?.load(id);
    const state = pipeRef.current;
    if (!loaded || !state) return;
    engineRef.current?.stop();
    captureKind.current = null;
    const session = Session.fromSaved(loaded.project, loaded.buffers, loaded.messages);
    const next = { ...SonaPipeline.create(session, state.profile), session };
    remember(next);
    setMessages(session.messages);
    setPlayhead(0);
  }

  function newSession() {
    const state = pipeRef.current;
    engineRef.current?.stop();
    captureKind.current = null;
    const session = Session.create();
    const next = SonaPipeline.create(session, state?.profile ?? SonaMemory.defaults());
    remember(next);
    setMessages(session.messages);
    setPlayhead(0);
  }

  if (!pipe) {
    return <main className="boot">Opening the session…</main>;
  }

  const project = pipe.session.project;

  return (
    <div
      className="shell"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) void takeFile(file);
      }}
    >
      <header className="top">
        <div className="brand">
          <WaveformMark size={28} />
          <div>
            <p className="wordmark">SONA</p>
            <p className="sub">AI AUDIO STUDIO</p>
          </div>
        </div>
        <p className="tagline">Your engineer. Just speak.</p>
        <div className="modes" role="tablist" aria-label="Studio mode">
          {(["artist", "creator", "engineer"] as const).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={mode === item} onClick={() => setMode(item)}>
              {item}
            </button>
          ))}
        </div>
        <SessionsMenu
          sessions={sessions}
          currentId={project.id}
          onLoad={(id) => void loadSession(id)}
          onNew={newSession}
          onDelete={(id) => {
            void storeRef.current?.remove(id).then(() => storeRef.current?.list().then(setSessions));
            if (id === project.id) newSession();
          }}
        />
      </header>
      <div className="body">
        <div className="stage" role="tabpanel" ref={stageRef}>
          <TransportBar
            transport={pipe.session.transport}
            playheadSec={playhead}
            bpm={project.bpm}
            metronome={project.metronome}
            canUndo={pipe.log.length > 0 && pipe.session.transport !== "recording"}
            canRedo={pipe.future.length > 0 && pipe.session.transport !== "recording"}
            onPlay={() => submit("play", "typed")}
            onStop={() => submit("stop", "typed")}
            onRecord={() => submit("record", "typed")}
            onSplit={() => submit("split", "typed")}
            onStart={() => submit("from the top", "typed")}
            onUndo={() => submit("undo", "typed")}
            onRedo={() => submit("redo", "typed")}
            onBpm={(bpm) => apply({ ...project, bpm: Math.min(240, Math.max(40, Math.round(bpm))) }, "session", "bpm", bpm)}
            onMetronome={() => apply({ ...project, metronome: !project.metronome }, "session", "metronome", project.metronome ? "off" : "on")}
            onZoom={(direction) => setZoom((value) => Math.min(160, Math.max(16, value + direction * 8)))}
          />
          {mode === "artist" ? (
            <ArtistStage
              project={project}
              buffers={pipe.session.buffers}
              transport={pipe.session.transport}
              playheadSec={playhead}
              channel={pipe.channel}
              findSeconds={findSeconds}
              livePeaks={livePeaks}
            />
          ) : null}
          {mode === "creator" ? (
            <>
              <Timeline
                project={project}
                buffers={pipe.session.buffers}
                playheadSec={playhead}
                zoom={zoom}
                transport={pipe.session.transport}
                recordStart={recordStart}
                livePeaks={livePeaks}
                onSeek={(sec) => {
                  if (pipe.session.transport === "recording") return;
                  const sought = ActionEngine.seek(pipeRef.current!.session, pipeRef.current!.profile, pipeRef.current!.log, pipeRef.current!.future, sec);
                  remember({ ...pipeRef.current!, session: sought.session, log: sought.log, future: sought.future });
                  setPlayhead(sought.session.playheadSec);
                  if (pipe.session.transport === "playing") engineRef.current?.play(sought.session.playheadSec);
                }}
                onSelect={(trackId, clipId) => {
                  if (project.selectedTrackId === trackId && project.selectedClipId === clipId) return;
                  const track = project.tracks.find((item) => item.id === trackId);
                  apply({ ...project, selectedTrackId: trackId, selectedClipId: clipId }, track?.name ?? "track", "select", clipId);
                }}
                onPreview={preview}
                onCommit={(before, next) => {
                  const track = next.tracks.find((item, index) => item !== before.tracks[index])?.name ?? "session";
                  apply(next, track, "edit", null, before);
                }}
                onArm={(trackId) => patch(trackId, "arm", "toggle", (track) => ({ ...track, armed: !track.armed }))}
                onMute={(trackId) => patch(trackId, "mute", "toggle", (track) => ({ ...track, mute: !track.mute }))}
                onSolo={(trackId) => patch(trackId, "solo", "toggle", (track) => ({ ...track, solo: !track.solo }))}
                onToggleEffect={(trackId, effect) => patch(trackId, effect, "toggle", (track) => ({
                  ...track,
                  [effect]: { ...track[effect], enabled: !track[effect].enabled },
                }))}
                onMarker={(marker: MarkerName) => apply(
                  { ...project, markers: { ...project.markers, [marker]: pipe.session.playheadSec } },
                  "session",
                  "marker",
                  marker,
                )}
              />
              <MasterBar
                preset={project.masterPreset}
                gainDb={project.masterGainDb}
                meter={meter}
                bouncing={bouncing}
                onPreset={(preset: MasterPreset) => apply({ ...project, masterPreset: preset }, "master", "master", preset)}
                onGain={(db) => preview({ ...project, masterGainDb: db })}
                onBeginGain={beginMaster}
                onCommitGain={commitMaster}
                onBounce={() => submit("bounce my master", "typed")}
              />
            </>
          ) : null}
          {mode === "engineer" ? <PhaseTwoPanel /> : null}
          <CommandLog entries={pipe.log} />
        </div>
        <EngineerPanel
          messages={messages}
          listening={listening}
          partial={partial}
          voiceMuted={voiceMuted}
          speechSupported={SpeechInput.supported()}
          sessionActive={pipe.sessionActive}
          pending={pipe.pending?.question ?? null}
          ranking={pipe.ranking}
          suggestions={DEMO}
          onSubmit={(text) => submit(text, "typed")}
          onTalkStart={() => {
            setListening(true);
            speechRef.current?.start();
          }}
          onTalkStop={() => speechRef.current?.stop()}
          onToggleVoice={() => {
            setVoiceMuted((value) => {
              if (!value) EngineerSpeech.stop();
              return !value;
            });
          }}
          onYes={() => submit("yes", "typed")}
          onNo={() => submit("no", "typed")}
        />
      </div>
      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept="audio/*,.wav,.mp3,.aiff,.aif,.flac,.m4a,.ogg"
        aria-label="Import a beat"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void takeFile(file);
        }}
      />
    </div>
  );
}

function audible(buffer: StoredBuffer): boolean {
  const channel = buffer.channels[0];
  if (!channel || channel.length < 4000) return false;
  let peak = 0;
  for (let index = 0; index < channel.length; index += 32) {
    const sample = Math.abs(channel[index] ?? 0);
    if (sample > peak) peak = sample;
  }
  return peak > 0.02;
}
