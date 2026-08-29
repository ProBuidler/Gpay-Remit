// #105 ErrorBoundary  #112 TransactionHistory route  #116 nav landmarks
import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import RemittanceForm from "./components/RemittanceForm";
import InvoiceViewer from "./components/InvoiceViewer";
import ErrorBoundary from "./components/ErrorBoundary";
import TransactionHistory from "./pages/TransactionHistory";
import { useGlobalShortcuts } from "./hooks/useKeyboardShortcuts";
import { ShortcutHelp } from "./components/ShortcutHelp";
import "./App.css";

function App() {
  const { showHelp, setShowHelp } = useGlobalShortcuts();

  return (
    <Router>
      <div className="App">
        <header className="App-header">
          <h1>Gpay-Remit</h1>
          {/* #116 — nav landmark so screen readers can jump straight to navigation */}
          <nav aria-label="Main navigation">
            <Link to="/">Send Remittance</Link>
            <Link to="/invoices">View Invoices</Link>
            <Link to="/transactions">Transaction History</Link>
            <button
              onClick={() => setShowHelp(true)}
              aria-label="Show keyboard shortcuts (press ?)"
              title="Press ? to show shortcuts"
              style={{
                marginLeft: 12,
                background: "#4338ca",
                color: "#fff",
                border: 0,
                borderRadius: 6,
                padding: "6px 12px",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              ? Shortcuts
            </button>
          </nav>
        </header>
        {/* #105 — wrap route tree so any page-level render error shows a
            recoverable fallback instead of a blank screen. */}
        <ErrorBoundary>
          <main id="main-content" aria-label="Page content">
            <Routes>
              <Route path="/" element={<RemittanceForm />} />
              <Route path="/invoices" element={<InvoiceViewer />} />
              <Route path="/transactions" element={<TransactionHistory />} />
            </Routes>
          </main>
        </ErrorBoundary>
        <ShortcutHelp open={showHelp} onClose={() => setShowHelp(false)} />
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            bottom: 12,
            right: 12,
            fontSize: 11,
            color: "#64748b",
            background: "#f8fafc",
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #e2e8f0",
          }}
        >
          Press <kbd>?</kbd> for shortcuts
        </div>
      </div>
    </Router>
  );
}

export default App;
