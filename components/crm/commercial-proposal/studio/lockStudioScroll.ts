"use client";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1 && !el.closest("[hidden]")
  );
}

export function lockStudioScroll(): () => void {
  const body = document.body;
  const main = document.querySelector("main");
  const editor = document.querySelector<HTMLElement>("[data-studio-editor-scroll]");
  const prev = {
    bodyOverflow: body.style.overflow,
    bodyPad: body.style.paddingRight,
    mainOverflow: main instanceof HTMLElement ? main.style.overflow : "",
    editorOverflow: editor?.style.overflow ?? "",
    windowY: window.scrollY,
    mainTop: main instanceof HTMLElement ? main.scrollTop : 0,
    editorTop: editor?.scrollTop ?? 0,
  };
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;
  body.style.overflow = "hidden";
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  if (main instanceof HTMLElement) main.style.overflow = "hidden";
  if (editor) editor.style.overflow = "hidden";
  return () => {
    body.style.overflow = prev.bodyOverflow;
    body.style.paddingRight = prev.bodyPad;
    if (main instanceof HTMLElement) main.style.overflow = prev.mainOverflow;
    if (editor) {
      editor.style.overflow = prev.editorOverflow;
      editor.scrollTop = prev.editorTop;
    }
    if (main instanceof HTMLElement) main.scrollTop = prev.mainTop;
    window.scrollTo(0, prev.windowY);
  };
}
