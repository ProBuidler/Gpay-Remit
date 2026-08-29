/* eslint-disable */
import { useEffect, useCallback, useState, useRef } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type ShortcutHandler = (event: KeyboardEvent) => void;

export interface ShortcutConfig {
  handler: ShortcutHandler;
  description: string;
  allowInInput?: boolean;
  preventDefault?: boolean;
}

export type ShortcutMap = Record<string, ShortcutConfig>;

export interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isInputTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  return false;
}

function normalizeCombo(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  const key = event.key.toLowerCase();
  if (key === "?" || (key === "/" && event.shiftKey)) {
    if (parts.includes("shift")) {
      parts.splice(parts.indexOf("shift"), 1);
    }
    parts.push("?");
  } else if (key.length === 1 || ["escape", "enter", "k", "s", "/", "n", "p", "h", "f"].includes(key)) {
    parts.push(key);
  } else {
    parts.push(key);
  }
  return parts.join("+");
}

function comboMatches(event: KeyboardEvent, combo: string): boolean {
  const norm = normalizeCombo(event);
  const lowerCombo = combo.toLowerCase();
  if (norm === lowerCombo) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Default shortcuts help data
// ---------------------------------------------------------------------------
export const defaultShortcutsHelp: Array<{ combo: string; description: string }> = [
  { combo: "Ctrl + K", description: "Focus search / command palette" },
  { combo: "Ctrl + S", description: "Save / Send remittance" },
  { combo: "Ctrl + N", description: "New remittance / invoice" },
  { combo: "Esc", description: "Close modal / dialog" },
  { combo: "?", description: "Show keyboard shortcuts help" },
  { combo: "Ctrl + /", description: "Show help center" },
];

// ---------------------------------------------------------------------------
// Hook: useKeyboardShortcuts
// ---------------------------------------------------------------------------
export function useKeyboardShortcuts(
  shortcuts: ShortcutMap,
  options: UseKeyboardShortcutsOptions = {}
): { showHelp: boolean; setShowHelp: (v: boolean) => void } {
  const { enabled = true } = options;
  const [showHelp, setShowHelp] = useState(false);
  const shortcutsRef = useRef(shortcuts);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
      const combo = normalizeCombo(event);
      if (combo === "?" || combo === "shift+?") {
        const cfg = shortcutsRef.current["?"] || shortcutsRef.current["shift+?"];
        if (cfg && !cfg.allowInInput && isInputTarget(event.target)) {
          return;
        }
        if (cfg) {
          if (cfg.preventDefault !== false) event.preventDefault();
          cfg.handler(event);
          return;
        }
        event.preventDefault();
        setShowHelp((prev) => !prev);
        return;
      }
    }
    for (const [combo, cfg] of Object.entries(shortcutsRef.current)) {
      if (comboMatches(event, combo)) {
        if (!cfg.allowInInput && isInputTarget(event.target)) {
          continue;
        }
        if (cfg.preventDefault !== false) event.preventDefault();
        cfg.handler(event);
        return;
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, handleKeyDown]);

  useEffect(() => {
    if (!enabled) return;
    if (shortcutsRef.current["?"]) return;
    const helpHandler = (event: KeyboardEvent) => {
      if (event.key === "?" && !isInputTarget(event.target)) {
        event.preventDefault();
        setShowHelp((prev) => !prev);
      }
      if (event.key === "Escape" && showHelp) {
        setShowHelp(false);
      }
    };
    window.addEventListener("keydown", helpHandler);
    return () => window.removeEventListener("keydown", helpHandler);
  }, [enabled, showHelp]);

  useEffect(() => {
    if (!showHelp) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowHelp(false);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [showHelp]);

  return { showHelp, setShowHelp };
}

// ---------------------------------------------------------------------------
// Convenience hook with default Gpay-Remit shortcuts
// ---------------------------------------------------------------------------
export function useGlobalShortcuts(overrides: Partial<ShortcutMap> = {}) {
  const [helpOpen, setHelpOpen] = useState(false);

  const shortcuts: ShortcutMap = {
    "ctrl+k": {
      handler: () => {
        const el = document.getElementById("help-search") || document.querySelector('input[type="search"]');
        if (el) (el as HTMLElement).focus();
        window.dispatchEvent(new CustomEvent("gpay:focus-search"));
      },
      description: "Focus search",
      preventDefault: true,
    },
    "ctrl+s": {
      handler: () => {
        window.dispatchEvent(new CustomEvent("gpay:save"));
      },
      description: "Save / Send",
      preventDefault: true,
    },
    "ctrl+n": {
      handler: () => {
        window.dispatchEvent(new CustomEvent("gpay:new-remittance"));
      },
      description: "New remittance",
      preventDefault: true,
    },
    escape: {
      handler: () => {
        const closeBtn = document.querySelector('[aria-label="Close"], [aria-label="Close dialog"], .close-btn');
        if (closeBtn) (closeBtn as HTMLElement).click();
        window.dispatchEvent(new CustomEvent("gpay:close-modal"));
      },
      description: "Close modal",
      allowInInput: true,
      preventDefault: false,
    },
    "?": {
      handler: () => setHelpOpen((p) => !p),
      description: "Show shortcuts",
      allowInInput: false,
      preventDefault: true,
    },
    "ctrl+/": {
      handler: () => setHelpOpen((p) => !p),
      description: "Show shortcuts",
      preventDefault: true,
    },
    ...overrides,
  };

  const { showHelp } = useKeyboardShortcuts(shortcuts);
  const isHelpOpen = helpOpen || showHelp;
  return { showHelp: isHelpOpen, setShowHelp: setHelpOpen, shortcuts };
}

export default useKeyboardShortcuts;
