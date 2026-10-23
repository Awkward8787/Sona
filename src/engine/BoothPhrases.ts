import type { MarkerName } from "../model/types";
import { Numbers } from "../model/Numbers";
import type { Intent, MicMove } from "./Intent";
import { VirtualMics } from "../mic/VirtualMics";

const MOVES: Array<[MicMove, RegExp]> = [
  ["warmer", /^(?:put me on a warmer mic|warmer mic|try something warmer|something warmer|a warmer mic|warmer)$/],
  ["darker", /^(?:put me on a darker mic|darker mic|try something darker|something darker|darker)$/],
  ["presence", /^(?:more presence|try something with more presence|a bit more presence)$/],
  ["brighter", /^(?:try something brighter|something brighter|brighter mic|a brighter mic)$/],
];

/** Extra phrases. The normalized command text is already filler-stripped. */
export function boothPhrase(text: string): Intent | null {
  if (/^(?:lets work|let us work|start a session|start the session)$/.test(text)) return { type: "sessionStart" };
  if (text === "find my mic" || text === "find the mic") return { type: "findMic" };
  if (/^(?:what you hearing|what are you hearing|what do you hear|whatcha hearing)$/.test(text)) return { type: "analyze" };
  if (/^(?:fix it|fix the vocal|fix the take|fix that)$/.test(text)) return { type: "fixVocal" };
  if (/^(?:widen the doubles|widen my doubles|make the doubles wider|wider doubles)$/.test(text)) {
    return { type: "widenDoubles" };
  }
  if (text === "load the beat" || text === "load the scratch beat" || text === "load a scratch beat") return { type: "loadScratch" };
  if (text === "scratch vocal" || text === "load a scratch vocal" || text === "load the scratch vocal") {
    return { type: "loadScratchVocal" };
  }
  if (/^(?:import|load)(?:\s+a|\s+the)?\s+(?:beat|instrumental|backing track)$/.test(text) && text !== "load the beat") {
    return { type: "importBeat" };
  }
  if (text === "import a beat" || text === "import the beat" || text === "load an instrumental") return { type: "importBeat" };
  if (text === "same as last time") return { type: "recallMemory" };
  if (text === "add my vocal chain" || text === "my vocal chain") return { type: "applyChain" };
  if (text === "mic check" || text === "check the mic") return { type: "micCheck" };
  if (text === "commands on" || text === "take commands") return { type: "commandWindow", open: true };
  if (text === "commands off") return { type: "commandWindow", open: false };
  if (/^(?:clear the session|clear the project|start over)$/.test(text)) return { type: "clearProject" };
  if (/^(?:toggle|the other one|other one|switch)$/.test(text)) return { type: "toggleAudition" };
  if (text === "run it back") return { type: "play", fromStart: true };
  if (text === "from the top") return { type: "seek", cue: { kind: "start" } };
  if (text === "take it from the hook") return { type: "seek", cue: { kind: "marker", marker: "chorus" } };

  const hear = text.match(/^(?:let me hear|hear|ab|a b)\s+(\S+)\s+and\s+(\S+)$/);
  if (hear) {
    const a = Numbers.parseInteger(hear[1] ?? "");
    const b = Numbers.parseInteger(hear[2] ?? "");
    if (a && b) return { type: "hearMics", ranks: [a, b] };
  }

  for (const [move, pattern] of MOVES) {
    if (pattern.test(text)) return { type: "setMic", mic: null, move };
  }

  const named = VirtualMics.byName(text);
  if (named && /^(?:put me on|use|try|switch to|change to)\b/.test(text)) {
    return { type: "setMic", mic: named, move: null };
  }
  if (named && text === named.replace("-", " ").replace("-", " ")) {
    return { type: "setMic", mic: named, move: null };
  }

  const preamp = text.match(/^(?:preamp|set the preamp|use the preamp|set preamp)\s+(clean|warm|smooth|air)$/);
  if (preamp && preamp[1]) return { type: "setPreamp", preamp: preamp[1] as "clean" | "warm" | "smooth" | "air" };

  if (/^(?:make it brighter|brighter|make the vocal brighter)$/.test(text)) return { type: "mixAdjust", axis: "brighter" };
  if (text === "more air" || text === "add more air" || text === "give it some air") return { type: "mixAdjust", axis: "air" };
  if (text === "less harsh" || text === "take the edge off") return { type: "mixAdjust", axis: "harsh" };
  if (text === "less mud" || text === "pull the low mids back") return { type: "mixAdjust", axis: "mud" };
  if (text === "bigger reverb" || text === "more reverb" || text === "bigger verb") return { type: "mixAdjust", axis: "reverb" };
  if (text === "add delay" || text === "add a little delay" || text === "a little delay") return { type: "mixAdjust", axis: "delay" };

  if (/^(?:tune it tighter|tighter|more tune)$/.test(text)) return { type: "tune", tighter: true, key: null, scale: null };
  if (/^(?:less tune|tune it less|less tuning)$/.test(text)) return { type: "tune", tighter: false, key: null, scale: null };
  if (text === "tune it" || text === "tune the vocal") return { type: "tune", tighter: null, key: null, scale: null };
  const key = text.match(/^key of ([a-g](?:#| sharp)?)(?:\s+(major|minor))?$/);
  if (key && key[1]) {
    const scale = key[2] === "minor" ? "minor" : "major";
    return { type: "tune", tighter: null, key: key[1].replace(" sharp", "#").toUpperCase(), scale };
  }

  if (text === "save take" || text === "save the take" || text === "save this take") return { type: "saveTake" };
  const removed = text.match(/^delete take (\S+)$/);
  if (removed && removed[1]) {
    const number = Numbers.parseInteger(removed[1]);
    if (number) return { type: "deleteTake", number };
  }
  const compared = text.match(/^(?:compare|ab|a b) takes? (\S+) and (?:take\s+)?(\S+)$/);
  if (compared && compared[1] && compared[2]) {
    const a = Numbers.parseInteger(compared[1]);
    const b = Numbers.parseInteger(compared[2]);
    if (a && b) return { type: "compareTakes", a, b };
  }
  const comp = text.match(/^use take (\S+) for the (verse|hook|chorus|intro|bridge) (?:and )?take (\S+) for the (verse|hook|chorus|intro|bridge)$/);
  if (comp && comp[1] && comp[2] && comp[3] && comp[4]) {
    const first = Numbers.parseInteger(comp[1]);
    const second = Numbers.parseInteger(comp[3]);
    if (first && second) {
      return {
        type: "compTakes",
        assignments: [
          { take: first, marker: markerName(comp[2]) },
          { take: second, marker: markerName(comp[4]) },
        ],
      };
    }
  }

  const input = text.match(/^(?:input|input gain|mic gain)\s+(up|down)\s+(\d+(?:\.\d+)?)\s*db$/);
  if (input && input[1] && input[2]) {
    const amount = Number(input[2]);
    return { type: "inputGain", db: input[1] === "down" ? -amount : amount };
  }
  if (text === "monitor on" || text === "input monitor on") return { type: "monitor", enabled: true };
  if (text === "monitor off" || text === "input monitor off") return { type: "monitor", enabled: false };

  const name = text.match(/^(?:my name is|call me)\s+(.+)$/);
  if (name && name[1]) return { type: "rememberName", name: name[1] };

  const choice = text.match(/^(one|two|three|four|[1-4])$/);
  if (choice && choice[1]) {
    const rank = Numbers.parseInteger(choice[1]);
    if (rank) return { type: "chooseMic", rank };
  }
  return null;
}

function markerName(word: string): MarkerName {
  if (word === "hook") return "chorus";
  return word as MarkerName;
}
