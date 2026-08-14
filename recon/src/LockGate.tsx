import { useState, type FormEvent, type ReactNode } from "react";
import { Frame } from "./components";

// SHA-256("mr-gate::" + passphrase). To change the passphrase:
//   python -c "import hashlib; print(hashlib.sha256(b'mr-gate::NEW').hexdigest())"
// This is a client-side gate on a static host: it keeps the section out of
// casual reach and out of crawlers, not out of a determined reader — truly
// private instances stay in graphs-local/ and never ship at all.
const GATE_DIGEST = "eb976751faa004c6a5b08b5978f0c28876c690a24001b873e3e45b8122a59c42";
const UNLOCK_KEY = "mr-recon-unlocked";

async function digest(passphrase: string): Promise<string> {
  const data = new TextEncoder().encode(`mr-gate::${passphrase}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function LockGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(
    () => localStorage.getItem(UNLOCK_KEY) === GATE_DIGEST,
  );
  const [attempt, setAttempt] = useState("");
  const [rejected, setRejected] = useState(false);

  if (unlocked) return <>{children}</>;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if ((await digest(attempt)) === GATE_DIGEST) {
      localStorage.setItem(UNLOCK_KEY, GATE_DIGEST);
      setUnlocked(true);
    } else {
      setRejected(true);
      setAttempt("");
    }
  };

  return (
    <section>
      <div className="mr-kicker">RECON — GATED SECTION</div>
      <h1 className="mr-h1">This briefing is gated</h1>
      <div className="bp-frame lg-panel">
        <Frame />
        <p className="mr-lede">
          Architecture recon briefings are shared deliberately, not crawled. Enter the
          passphrase to open this section — the primer and the atlas remain open to all.
        </p>
        <form className="lg-form" onSubmit={submit}>
          <label className="at-control">
            <span className="mr-cat-heading">PASSPHRASE</span>
            <input
              type="password"
              value={attempt}
              onChange={(e) => {
                setAttempt(e.target.value);
                setRejected(false);
              }}
              autoFocus
            />
          </label>
          <button className="at-reset" type="submit">
            UNLOCK
          </button>
        </form>
        {rejected ? (
          <p className="lg-rejected" role="alert">
            Not the passphrase. Nothing publishes unless it reconciles.
          </p>
        ) : null}
      </div>
    </section>
  );
}
