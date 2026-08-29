import React from "react";
import { defaultShortcutsHelp } from "../hooks/useKeyboardShortcuts";

interface ShortcutHelpProps {
  open: boolean;
  onClose: () => void;
  shortcuts?: Array<{ combo: string; description: string }>;
}

export function ShortcutHelp({ open, onClose, shortcuts = defaultShortcutsHelp }: ShortcutHelpProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcut-help-title"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          maxWidth: 480,
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 id="shortcut-help-title" style={{ margin: 0, fontSize: 18 }}>
            Keyboard Shortcuts
          </h2>
          <button onClick={onClose} aria-label="Close shortcuts help" style={{ fontSize: 16, padding: "4px 8px" }}>
            ✕
          </button>
        </div>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
          Press <kbd style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>?</kbd> anytime to toggle this
          help.
        </p>
        <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
              <th style={{ padding: "8px 0", color: "#64748b", fontWeight: 600, width: 140 }}>Shortcut</th>
              <th style={{ padding: "8px 0", color: "#64748b", fontWeight: 600 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {shortcuts.map((s) => (
              <tr key={s.combo} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "10px 0" }}>
                  <kbd
                    style={{
                      background: "#1e293b",
                      color: "#fff",
                      padding: "4px 8px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontFamily: "ui-monospace, SFMono-Regular, monospace",
                    }}
                  >
                    {s.combo}
                  </kbd>
                </td>
                <td style={{ padding: "10px 0", color: "#334155" }}>{s.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ margin: "16px 0 0", fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
          Shortcuts ignore input fields unless noted. <code>Ctrl</code> also works as <code>Cmd</code> on Mac.
        </p>
      </div>
    </div>
  );
}

export default ShortcutHelp;
