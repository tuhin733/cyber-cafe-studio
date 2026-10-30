import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { USER_ERROR_EVENT } from "../lib/userErrors";

async function playErrorChime() {
  const AudioContextConstructor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextConstructor) return;

  const context = new AudioContextConstructor();
  try {
    await context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startTime = context.currentTime;
    const endTime = startTime + 0.36;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(587.33, startTime);
    oscillator.frequency.setValueAtTime(698.46, startTime + 0.17);
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.045, startTime + 0.025);
    gain.gain.setValueAtTime(0.035, startTime + 0.16);
    gain.gain.exponentialRampToValueAtTime(0.001, endTime);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => {
      void context.close().catch((error: unknown) =>
        console.error("Unable to close error sound audio context", error),
      );
    };
    oscillator.start(startTime);
    oscillator.stop(endTime);
  } catch (error) {
    await context.close().catch((closeError: unknown) =>
      console.error("Unable to close error sound audio context", closeError),
    );
    throw error;
  }
}

export default function ErrorPopup() {
  const [messages, setMessages] = useState<string[]>([]);
  const messagesRef = useRef<string[]>([]);
  const dismissButtonRef = useRef<HTMLButtonElement>(null);
  const currentMessage = messages[0];

  useEffect(() => {
    const handleError = (event: Event) => {
      const message = (event as CustomEvent<unknown>).detail;
      if (typeof message !== "string" || !message.trim()) return;
      const cleanMessage = message.trim();
      if (messagesRef.current[messagesRef.current.length - 1] === cleanMessage) {
        return;
      }
      messagesRef.current = [...messagesRef.current, cleanMessage];
      setMessages(messagesRef.current);

      void playErrorChime().catch((error: unknown) =>
        console.error("Unable to play error notification sound", error),
      );
    };

    window.addEventListener(USER_ERROR_EVENT, handleError);
    return () => window.removeEventListener(USER_ERROR_EVENT, handleError);
  }, []);

  useEffect(() => {
    if (currentMessage) dismissButtonRef.current?.focus();
  }, [currentMessage]);

  const dismissCurrent = () => {
    messagesRef.current = messagesRef.current.slice(1);
    setMessages(messagesRef.current);
  };

  if (!currentMessage) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center p-4">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="error-popup-title"
        aria-describedby="error-popup-message"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            dismissCurrent();
          } else if (event.key === "Tab") {
            event.preventDefault();
            dismissButtonRef.current?.focus();
          }
        }}
        className="pointer-events-auto w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-900/10"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2
              id="error-popup-title"
              className="text-base font-bold text-slate-800"
            >
              Something went wrong
            </h2>
            <p
              id="error-popup-message"
              className="mt-1 break-words text-sm text-slate-600"
            >
              {currentMessage}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            ref={dismissButtonRef}
            type="button"
            onClick={dismissCurrent}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            OK
          </button>
        </div>
      </section>
    </div>
  );
}
