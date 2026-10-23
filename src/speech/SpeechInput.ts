export class SpeechInput {
  private recognition: BrowserSpeechRecognition | null = null;
  private generation = 0;
  private finalText = "";
  private continuous = false;
  private paused = false;

  static supported(): boolean {
    return typeof window !== "undefined" && Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
  }

  constructor(
    private readonly handlers: {
      onPartial: (text: string) => void;
      onFinal: (text: string) => void;
      onError: (message: string) => void;
    },
  ) {}

  startContinuous(): void {
    this.continuous = true;
    this.start();
  }

  start(): void {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      this.handlers.onError("Voice input needs desktop Chrome. Type the command instead.");
      return;
    }
    const generation = this.generation + 1;
    this.generation = generation;
    try {
      this.recognition?.abort();
    } catch {
      /* no active recognizer */
    }
    const recognition = new Ctor();
    this.recognition = recognition;
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    this.finalText = "";
    recognition.onresult = (event) => {
      if (generation !== this.generation) return;
      let text = "";
      for (let i = 0; i < event.results.length; i += 1) text += event.results[i][0]?.transcript ?? "";
      this.finalText = text.trim();
      this.handlers.onPartial(this.finalText);
    };
    recognition.onerror = (event) => {
      if (generation !== this.generation) return;
      if (event.error === "aborted" || event.error === "no-speech") return;
      const message = event.error === "not-allowed"
        ? "Speech recognition is blocked. Allow the microphone for Chrome, or type the command."
        : "I couldn't use speech recognition. Type the command instead.";
      this.handlers.onError(message);
    };
    recognition.onend = () => {
      if (generation !== this.generation) return;
      const text = this.finalText.trim();
      this.finalText = "";
      this.handlers.onPartial("");
      this.handlers.onFinal(text);
      if (this.continuous && !this.paused && generation === this.generation) {
        window.setTimeout(() => {
          if (this.continuous && !this.paused && generation === this.generation) this.start();
        }, 200);
      }
    };
    try {
      recognition.start();
    } catch {
      this.handlers.onError("Speech recognition is busy. Try again in a second.");
    }
  }

  stop(): void {
    this.continuous = false;
    this.paused = false;
    try {
      this.recognition?.stop();
    } catch {
      /* already stopped */
    }
  }

  /** Hold the recognizer while SONA is talking so the take and the next command stay clean. */
  pause(): void {
    this.paused = true;
    try {
      this.recognition?.abort();
    } catch {
      /* already stopped */
    }
  }

  resume(): void {
    if (!this.paused && this.recognition) return;
    this.paused = false;
    if (this.continuous) this.start();
  }
}
