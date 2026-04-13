// help-text-controller.ts — Phase 8 aria-live helper for `#help_text`.
//
// ui-controller already maps FSM states to Korean copy. This module is the
// thin façade the rest of the codebase imports when it just wants to push
// a string into the live region without taking a UIControllerHandle. It
// keeps the aria-live contract centralized so we don't accidentally regress
// on 장차법 announcements when other modules write directly to the DOM.

import { announce } from "./a11y";

export function setHelpText(text: string, root: ParentNode = document): void {
  const el = root.querySelector<HTMLElement>("#help_text");
  if (!el) return;
  // aria-live announces on text mutation, so a plain assignment is enough.
  el.textContent = text;
}

export function transientHelpText(
  text: string,
  root: ParentNode = document,
): void {
  announce(text, root);
}
