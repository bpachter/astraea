import {
  PRIMER_CHAPTERS,
  PRIMER_CREDIT,
  PRIMER_LEDE,
  PRIMER_TITLE,
  type PrimerTrack,
} from "./primer-content";
import {
  DOTNET_CHAPTERS,
  DOTNET_TRACK_CREDIT,
  DOTNET_TRACK_LEDE,
  DOTNET_TRACK_TITLE,
} from "./primer-dotnet";

export const PRIMER_TRACKS: PrimerTrack[] = [
  {
    id: "metabolomics",
    tab: "METABOLOMICS",
    title: PRIMER_TITLE,
    lede: PRIMER_LEDE,
    credit: PRIMER_CREDIT,
    // Pre-tracks key kept verbatim so existing progress survives the refactor.
    doneKey: "mr-primer-done",
    chapters: PRIMER_CHAPTERS,
  },
  {
    id: "dotnet",
    tab: ".NET FLUENCY",
    title: DOTNET_TRACK_TITLE,
    lede: DOTNET_TRACK_LEDE,
    credit: DOTNET_TRACK_CREDIT,
    doneKey: "mr-primer-done:dotnet",
    chapters: DOTNET_CHAPTERS,
  },
];
