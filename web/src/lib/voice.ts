/**
 * Voice input (v1): Web Speech API where available (Chrome/Edge/Android).
 * iOS Safari has no SpeechRecognition — the keyboard mic (dictation) covers
 * it natively, so the UI hides the button there. Audio never leaves the
 * phone through us.
 */

type SR = {
  new (): {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
    onend: (() => void) | null;
    onerror: ((e: unknown) => void) | null;
    start(): void;
    stop(): void;
  };
};

function impl(): SR | null {
  const w = window as unknown as { SpeechRecognition?: SR; webkitSpeechRecognition?: SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function voiceAvailable(): boolean {
  if (typeof window === 'undefined' || impl() === null) return false;
  // iOS exposes webkitSpeechRecognition but it silently never delivers events
  // in standalone PWAs (freezes the UI in "listening"). The iOS keyboard's
  // dictation mic is the native, better path there.
  if (/iP(hone|ad|od)/.test(navigator.userAgent)) return false;
  return true;
}

export function listen(onText: (text: string, final: boolean) => void): () => void {
  const Rec = impl();
  if (!Rec) return () => {};
  const rec = new Rec();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(guard);
    onText('', true);
  };
  // Safety: if the platform never delivers a result (broken implementations),
  // end cleanly instead of freezing in the "listening" state.
  const guard = setTimeout(() => {
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
    finish();
  }, 8000);
  rec.lang = navigator.language || 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e) => {
    let text = '';
    for (let i = 0; i < e.results.length; i++) text += e.results[i]![0]!.transcript;
    onText(text, false);
  };
  rec.onend = finish;
  rec.onerror = finish;
  rec.start();
  return () => {
    try {
      rec.stop();
    } catch {
      /* noop */
    }
    finish();
  };
}
