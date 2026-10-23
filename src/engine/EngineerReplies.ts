import { Ids } from "../model/Ids";
import type { ChatMessage } from "../model/types";

export class EngineerReplies {
  static greeting(): ChatMessage {
    return {
      id: Ids.next(),
      role: "engineer",
      text: "I'm on the talkback. Tell me what you want — record, arm track two, or bounce it.",
      at: Date.now(),
    };
  }

  static help(): string {
    return "Tell me to record, stop, or play. Arm a track, ride a fader, pan, mute, or solo. I can add reverb, EQ, and compression, trim and split, loop a section, set the tempo, master the mix, and bounce a WAV.";
  }

  static unknown(text: string): string {
    const query = text.toLowerCase();
    if (query.includes("reverb") || query.includes("verb")) {
      return "Try: add some reverb to the vocal.";
    }
    if (query.includes("master") || query.includes("loud")) {
      return "Try: master it louder, or master for streaming.";
    }
    if (query.includes("eq") || query.includes("warm")) {
      return "Try: add warmth to the vocal.";
    }
    if (query.includes("compress")) {
      return "Try: compress the vocal.";
    }
    if (query.includes("loop")) {
      return "Try: loop 4 bars, or loop the chorus.";
    }
    if (query.includes("arm") || query.includes("track")) {
      return "Try: arm track two, or select the vocal.";
    }
    if (query.includes("export") || query.includes("bounce") || query.includes("wav")) {
      return "Try: bounce it.";
    }
    return "I didn't catch that. You can say: arm track two, bring the vocal up 3 dB, or bounce it.";
  }

  static pan(value: number): string {
    if (value <= -0.9) return "hard left";
    if (value <= -0.5) return "left";
    if (value < -0.15) return "slightly left";
    if (value <= 0.15) return "center";
    if (value < 0.5) return "slightly right";
    if (value < 0.9) return "right";
    return "hard right";
  }

  static message(role: ChatMessage["role"], text: string): ChatMessage {
    return { id: Ids.next(), role, text, at: Date.now() };
  }
}
