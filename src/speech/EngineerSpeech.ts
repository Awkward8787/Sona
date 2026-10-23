export class EngineerSpeech {
  static speak(text: string, muted: boolean, hooks?: { onstart?: () => void; onend?: () => void }): void {
    if (muted || typeof window === "undefined" || !window.speechSynthesis) {
      hooks?.onend?.();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 0.96;
    utterance.onstart = () => hooks?.onstart?.();
    utterance.onend = () => hooks?.onend?.();
    utterance.onerror = () => hooks?.onend?.();
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => voice.lang.startsWith("en") && /natural|google|samantha|daniel|aria/i.test(voice.name))
      ?? voices.find((voice) => voice.lang.startsWith("en"))
      ?? null;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  static unlock(): void {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.getVoices();
  }

  static stop(): void {
    window.speechSynthesis?.cancel();
  }
}
