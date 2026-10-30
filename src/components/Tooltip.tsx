import { useId, type ReactNode } from "react";

interface Props {
  content: string;
  children: (tooltipId: string) => ReactNode;
  className?: string;
}

export default function Tooltip({ content, children, className = "inline-flex" }: Props) {
  const tooltipId = useId();

  return (
    <div className={`group relative ${className}`}>
      {children(tooltipId)}
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-64 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-center text-xs font-medium leading-relaxed text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {content}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-slate-900" />
      </span>
    </div>
  );
}
