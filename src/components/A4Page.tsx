import { useEffect, useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";
import type { LayoutSettings, UploadedDoc } from "../types";
import { A4 } from "../types";
import { paginate, type PlacedDoc } from "../lib/pagination";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  FileText,
  Plus,
  Trash2,
} from "lucide-react";

interface Props {
  docs: UploadedDoc[];
  settings: LayoutSettings;
  blankPageCount: number;
  onPlacementChange: (
    id: string,
    placement: NonNullable<UploadedDoc["placement"]>,
  ) => void;
  arrangeMode: boolean;
  onAddPage: () => void;
  onAddPageAfter: (pageIndex: number) => void;
  onDuplicatePage: (pageIndex: number) => void;
  onDeletePage: (pageIndex: number) => void;
  onMovePage: (pageIndex: number, direction: -1 | 1) => void;
  activePageIndex: number;
  onPageSelect: (pageIndex: number) => void;
}

type Placement = NonNullable<UploadedDoc["placement"]>;

const MIN_SCALE = 0.9;
const MAX_SCALE = 2.4;
const PREVIEW_HORIZONTAL_PADDING = 16;

type Interaction = {
  id: string;
  pointerId: number;
  kind: "move" | "resize";
  pointerX: number;
  pointerY: number;
  placement: Placement;
};

export default function A4Page({
  docs,
  settings,
  blankPageCount,
  onPlacementChange,
  arrangeMode,
  onAddPage,
  onAddPageAfter,
  onDuplicatePage,
  onDeletePage,
  onMovePage,
  activePageIndex,
  onPageSelect,
}: Props) {
  const { pages } = paginate(docs, settings, blankPageCount);
  const [scale, setScale] = useState(1.8);
  const [maxScale, setMaxScale] = useState(MAX_SCALE);
  const [pageContextMenu, setPageContextMenu] = useState<{
    pageIndex: number;
    left: number;
    top: number;
  } | null>(null);
  const [confirmDeletePageIndex, setConfirmDeletePageIndex] = useState<number | null>(null);
  const interaction = useRef<Interaction | null>(null);
  const previewViewport = useRef<HTMLDivElement>(null);
  const previousBlankPageCount = useRef(blankPageCount);

  const sheetW = A4.w * scale;
  const sheetH = A4.h * scale;

  useEffect(() => {
    const viewport = previewViewport.current;
    if (!viewport) return;

    const updateMaxScale = () => {
      const widthLimit =
        (viewport.clientWidth - PREVIEW_HORIZONTAL_PADDING) / A4.w;
      const nextMaxScale = Math.max(0.1, Math.min(MAX_SCALE, widthLimit));
      setMaxScale(nextMaxScale);
      setScale((currentScale) => Math.min(currentScale, nextMaxScale));
    };

    const observer = new ResizeObserver(updateMaxScale);
    observer.observe(viewport);
    updateMaxScale();

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (blankPageCount > previousBlankPageCount.current) {
      const viewport = previewViewport.current;
      viewport?.scrollTo({
        top: viewport.scrollHeight,
        behavior: "smooth",
      });
    }
    previousBlankPageCount.current = blankPageCount;
  }, [blankPageCount]);

  const handlePreviewWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey || event.deltaY === 0) return;
    event.preventDefault();
    setScale((currentScale) =>
      Math.max(
        Math.min(MIN_SCALE, maxScale),
        Math.min(maxScale, currentScale * Math.exp(-event.deltaY * 0.001)),
      ),
    );
  };

  const beginInteraction = (
    event: PointerEvent<HTMLElement>,
    placed: PlacedDoc,
    kind: Interaction["kind"],
  ) => {
    if (!arrangeMode) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    interaction.current = {
      id: placed.doc.id,
      pointerId: event.pointerId,
      kind,
      pointerX: event.clientX,
      pointerY: event.clientY,
      placement: { x: placed.x, y: placed.y, w: placed.w, h: placed.h },
    };
  };

  const updateInteraction = (event: PointerEvent<HTMLElement>) => {
    const active = interaction.current;
    if (!active || active.pointerId !== event.pointerId) return;

    const deltaX = (event.clientX - active.pointerX) / scale;
    const deltaY = (event.clientY - active.pointerY) / scale;
    let placement = active.placement;

    if (active.kind === "move") {
      placement = {
        ...placement,
        x: Math.max(0, Math.min(A4.w - placement.w, placement.x + deltaX)),
        y: Math.max(0, Math.min(A4.h - placement.h, placement.y + deltaY)),
      };
    } else {
      const aspect = placement.w / placement.h;
      const maxWidth = Math.min(
        A4.w - placement.x,
        (A4.h - placement.y) * aspect,
      );
      const width = Math.max(
        Math.min(5, maxWidth),
        Math.min(maxWidth, placement.w + Math.max(deltaX, deltaY * aspect)),
      );
      placement = { ...placement, w: width, h: width / aspect };
    }

    onPlacementChange(active.id, placement);
  };

  const endInteraction = (event: PointerEvent<HTMLElement>) => {
    if (interaction.current?.pointerId !== event.pointerId) return;
    interaction.current = null;
  };

  const resizeByKeyboard = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    placed: PlacedDoc,
  ) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const aspect = placed.w / placed.h;
    const direction =
      event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const maxWidth = Math.min(
      A4.w - placed.x,
      (A4.h - placed.y) * aspect,
    );
    const width = Math.max(
      Math.min(5, maxWidth),
      Math.min(maxWidth, placed.w + direction),
    );
    onPlacementChange(placed.doc.id, {
      ...placed,
      w: width,
      h: width / aspect,
    });
  };

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-col items-center">
      {/* A4 sheet */}
      <div
        ref={previewViewport}
        className="scrollbar-hidden absolute inset-0 min-h-0 w-full min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain scroll-smooth focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500"
        role="region"
        aria-label="Scrollable A4 preview"
        tabIndex={0}
        onWheel={handlePreviewWheel}
        onClick={() => {
          setPageContextMenu(null);
          setConfirmDeletePageIndex(null);
        }}
        onScroll={() => {
          setPageContextMenu(null);
          setConfirmDeletePageIndex(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setPageContextMenu(null);
            setConfirmDeletePageIndex(null);
          }
        }}
      >
        <div className="flex w-full flex-col items-center gap-6 p-2">
          {pages.map((page, pageIdx) => (
            <div
              key={pageIdx}
              onClick={() => {
                onPageSelect(pageIdx);
                setPageContextMenu(null);
                setConfirmDeletePageIndex(null);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onPageSelect(pageIdx);
                setConfirmDeletePageIndex(null);
                const bounds = event.currentTarget.getBoundingClientRect();
                const menuWidth = 176;
                const menuHeight = 168;
                setPageContextMenu({
                  pageIndex: pageIdx,
                  left: Math.max(
                    4,
                    Math.min(event.clientX - bounds.left, sheetW - menuWidth - 4),
                  ),
                  top: Math.max(
                    4,
                    Math.min(event.clientY - bounds.top, sheetH - menuHeight - 4),
                  ),
                });
              }}
              className={`relative shrink-0 bg-white shadow-lg ${
                activePageIndex === pageIdx
                  ? "ring-2 ring-teal-500"
                  : "ring-1 ring-slate-200"
              }`}
              style={{ width: sheetW, height: sheetH }}
            >
              {/* Paper texture */}
              <div className="absolute inset-0 bg-gradient-to-br from-white to-slate-50/30" />

              {pageContextMenu?.pageIndex === pageIdx && (
                <div
                  role="menu"
                  aria-label={`Page ${pageIdx + 1} options`}
                  onClick={(event) => event.stopPropagation()}
                  className="absolute z-30 w-48 rounded-md border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-slate-900/5"
                  style={{ left: pageContextMenu.left, top: pageContextMenu.top }}
                >
                    {confirmDeletePageIndex === pageIdx ? (
                        <div className="space-y-1.5 p-1.5">
                          <p className="text-xs font-medium text-slate-700">
                          Delete page and its documents?
                        </p>
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDeletePageIndex(null);
                              setPageContextMenu(null);
                            }}
                            className="rounded px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onDeletePage(pageIdx);
                              setConfirmDeletePageIndex(null);
                              setPageContextMenu(null);
                            }}
                            className="rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onAddPageAfter(pageIdx);
                            setPageContextMenu(null);
                          }}
                          className="flex min-h-8 w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add page after
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onDuplicatePage(pageIdx);
                            setPageContextMenu(null);
                          }}
                          className="flex min-h-8 w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Duplicate page
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={pageIdx === 0}
                          onClick={() => {
                            onMovePage(pageIdx, -1);
                            onPageSelect(pageIdx - 1);
                            setPageContextMenu(null);
                          }}
                          className="flex min-h-8 w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                          Move page up
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={pageIdx >= pages.length - 1}
                          onClick={() => {
                            onMovePage(pageIdx, 1);
                            onPageSelect(pageIdx + 1);
                            setPageContextMenu(null);
                          }}
                          className="flex min-h-8 w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                          Move page down
                        </button>
                        <div className="my-1 border-t border-slate-100" />
                        <button
                          type="button"
                          role="menuitem"
                          disabled={pageIdx === 0}
                          onClick={() => setConfirmDeletePageIndex(pageIdx)}
                          className="flex min-h-8 w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete page
                        </button>
                      </>
                    )}
                </div>
              )}

              {/* Placed cards */}
              {page.map((p, i) => (
                <div
                  key={`${p.doc.id}-${i}`}
                  className={`absolute overflow-hidden rounded-sm ${
                    arrangeMode
                      ? "touch-none cursor-move ring-1 ring-teal-500/70"
                      : ""
                  }`}
                  style={{
                    left: p.x * scale,
                    top: p.y * scale,
                    width: p.w * scale,
                    height: p.h * scale,
                  }}
                  onPointerDown={(event) =>
                    beginInteraction(event, p, "move")
                  }
                  onPointerMove={updateInteraction}
                  onPointerUp={endInteraction}
                  onPointerCancel={endInteraction}
                >
                  <img
                    src={p.doc.url}
                    alt={p.doc.label}
                    className="h-full w-full object-fill"
                    draggable={false}
                  />
                  {arrangeMode && (
                    <button
                      type="button"
                      aria-label={`Resize ${p.doc.label}`}
                      title="Drag to resize"
                      className="absolute bottom-0 right-0 z-10 h-5 w-5 cursor-nwse-resize rounded-tl-md border-l border-t border-white bg-teal-600 shadow"
                      onPointerDown={(event) =>
                        beginInteraction(event, p, "resize")
                      }
                      onKeyDown={(event) => resizeByKeyboard(event, p)}
                    />
                  )}
                </div>
              ))}

              {/* Page number badge */}
              <div
                className={`absolute bottom-2 right-2 flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium backdrop-blur ${
                  activePageIndex === pageIdx
                    ? "bg-teal-100/90 text-teal-700"
                    : "bg-slate-100/80 text-slate-400"
                }`}
              >
                <FileText className="h-3 w-3" />
                A4 · {pageIdx + 1}{activePageIndex === pageIdx ? " · Selected" : ""}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={onAddPage}
            aria-label="Add a blank page"
            className="group mb-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 active:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4 text-teal-600 transition-colors group-hover:text-teal-700" />
            Add page
          </button>
        </div>
      </div>

    </div>
  );
}
