import { useEffect, useMemo, useState } from "react";
import { Frame } from "./components";
import { PRIMER_TRACKS } from "./primer-tracks";

const TRACK_KEY = "mr-primer-track";

function loadDone(doneKey: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(doneKey) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function Primer({ onJumpToNode }: { onJumpToNode: (id: string) => void }) {
  const [trackId, setTrackId] = useState(
    () => localStorage.getItem(TRACK_KEY) ?? PRIMER_TRACKS[0].id,
  );
  const track =
    PRIMER_TRACKS.find((t) => t.id === trackId) ?? PRIMER_TRACKS[0];
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<Set<string>>(() => loadDone(track.doneKey));
  const chapter = track.chapters[Math.min(index, track.chapters.length - 1)];

  useEffect(() => {
    localStorage.setItem(TRACK_KEY, track.id);
    setDone(loadDone(track.doneKey));
    setIndex(0);
  }, [track.id, track.doneKey]);

  useEffect(() => {
    localStorage.setItem(track.doneKey, JSON.stringify([...done]));
  }, [done, track.doneKey]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [index, track.id]);

  const progress = useMemo(
    () => `${done.size} OF ${track.chapters.length} CHAPTERS COMPLETE`,
    [done, track],
  );

  const markDone = () => {
    setDone((prev) => new Set(prev).add(chapter.id));
    if (index < track.chapters.length - 1) setIndex(index + 1);
  };

  return (
    <section>
      <div className="mr-kicker">
        THE DOMAIN, HAND-HELD — FOUNDATIONS FIRST, IMPLICATIONS LAST
      </div>
      <h1 className="mr-h1">{track.title}</h1>
      <p className="mr-lede">{track.lede}</p>

      <nav className="mr-views pr-tracks" aria-label="Primer track">
        {PRIMER_TRACKS.map((t) => (
          <button
            key={t.id}
            className={t.id === track.id ? "active" : ""}
            onClick={() => setTrackId(t.id)}
          >
            {t.tab}
          </button>
        ))}
      </nav>

      <div className="pr-layout">
        <nav className="bp-frame pr-toc" aria-label="Chapters">
          <Frame />
          <div className="pr-toc-inner">
            <div className="mr-cat-heading">{progress}</div>
            {track.chapters.map((c, i) => (
              <button
                key={c.id}
                className={`pr-toc-item${i === index ? " active" : ""}`}
                onClick={() => setIndex(i)}
              >
                <span className="pr-toc-no">{c.number}</span>
                <span>{c.title}</span>
                {done.has(c.id) ? <span className="pr-toc-done">✓ DONE</span> : null}
              </button>
            ))}
          </div>
        </nav>

        <article className="bp-frame pr-chapter">
          <Frame />
          <div className="mr-kicker">{chapter.kicker}</div>
          <h3>{chapter.title}</h3>
          <div className="pr-body">
            {chapter.sections.map((section, si) => (
              <div key={si}>
                {section.heading ? <div className="pr-section-h">{section.heading}</div> : null}
                {section.paragraphs.map((p, pi) => (
                  <p key={pi}>{p}</p>
                ))}
              </div>
            ))}
          </div>

          {chapter.terms.length ? (
            <>
              <div className="pr-section-h">TERMS THAT EARN THEIR PLACE</div>
              <div className="pr-terms">
                {chapter.terms.map((t) => (
                  <div key={t.term} className="pr-term">
                    <b>{t.term}</b>
                    <span>{t.def}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {chapter.checks.length ? (
            <>
              <div className="pr-section-h">CHECK YOURSELF</div>
              {chapter.checks.map((c, i) => (
                <details key={i} className="pr-check">
                  <summary>{c.q}</summary>
                  <p>{c.a}</p>
                </details>
              ))}
            </>
          ) : null}

          {chapter.reconLinks.length ? (
            <>
              <div className="pr-section-h">SEE IT ON THE MAP</div>
              <div className="pr-links">
                {chapter.reconLinks.map((link) => (
                  <button
                    key={link.node}
                    className="mr-ghost"
                    onClick={() => onJumpToNode(link.node)}
                  >
                    {link.label.toUpperCase()} ↗
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <div className="pr-nav">
            <button disabled={index === 0} onClick={() => setIndex(index - 1)}>
              ← PREVIOUS
            </button>
            <button className="done-btn" onClick={markDone}>
              {done.has(chapter.id)
                ? index < track.chapters.length - 1
                  ? "NEXT →"
                  : "DONE ✓"
                : "MARK COMPLETE & CONTINUE →"}
            </button>
            <button
              disabled={index === track.chapters.length - 1}
              onClick={() => setIndex(index + 1)}
            >
              NEXT →
            </button>
          </div>
        </article>
      </div>

      <footer className="mr-footer">{track.credit}</footer>
    </section>
  );
}
