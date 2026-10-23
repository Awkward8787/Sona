export function DeskTools({
  bouncing,
  onPhrase,
  onSave,
  onOpen,
}: {
  bouncing: boolean;
  onPhrase: (text: string) => void;
  onSave: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="desk-tools" role="toolbar" aria-label="Session tools">
      <button type="button" onClick={() => onPhrase("load the beat")}>Scratch beat</button>
      <button type="button" onClick={() => onPhrase("import a beat")}>Import beat</button>
      <button type="button" onClick={() => onPhrase("scratch vocal")}>Scratch vocal</button>
      <button type="button" onClick={() => onPhrase("find my mic")}>Find my mic</button>
      <button type="button" onClick={() => onPhrase("bounce my master")} disabled={bouncing}>
        {bouncing ? "Bouncing…" : "Bounce WAV"}
      </button>
      <button type="button" onClick={onSave}>Save project</button>
      <button type="button" onClick={onOpen}>Open project</button>
    </div>
  );
}
