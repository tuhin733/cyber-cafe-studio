import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface Props {
  onClose: () => void;
}

export default function DonationDialog({ onClose }: Props) {
  const [selectedAmount, setSelectedAmount] = useState(15);
  const amounts = [5, 15, 25, 50];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="donation-title"
        aria-describedby="donation-description"
        className="relative max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 text-center shadow-2xl ring-1 ring-slate-900/10"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close donation dialog"
          className="absolute right-3 top-3 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
        <h2
          id="donation-title"
          className="text-lg font-bold tracking-tight text-slate-800"
        >
          Support Cyber Cafe Studio
        </h2>
        <p className="mt-1 text-xs font-medium text-slate-400">
          Created by Naim Sarkar
        </p>
        <p id="donation-description" className="mt-1 text-sm text-slate-500">
          Every contribution helps keep the project growing.
        </p>
        <fieldset className="mt-5">
          <legend className="mb-2 text-xs font-semibold text-slate-500">
            Choose an amount
          </legend>
          <div className="grid grid-cols-4 gap-2">
            {amounts.map((amount) => (
              <button
                key={amount}
                type="button"
                aria-pressed={selectedAmount === amount}
                onClick={() => setSelectedAmount(amount)}
                className={`rounded-xl border px-2 py-2.5 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${
                  selectedAmount === amount
                    ? "border-teal-600 bg-teal-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
                }`}
              >
                ₹{amount}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Scan the QR code and enter ₹{selectedAmount} in your UPI app.
        </p>
        <img
          src="./donation-qr.jpeg"
          alt="Donation QR code"
          className="mx-auto mt-3 w-full max-w-[220px] rounded-lg object-contain"
        />
      </section>
    </div>
  );
}
