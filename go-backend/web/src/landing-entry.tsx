import React from "react";
import ReactDOM from "react-dom/client";
import { Router } from "wouter";
import { LanguageProvider } from "@/lib/i18n";
import Landing from "@/pages/Landing";
import "./index.css";

// Kalau sudah login, langsung ke dashboard (landing hanya untuk publik).
try {
  if (localStorage.getItem("token")) {
    window.location.replace("/dashboard");
  }
} catch {
  /* abaikan */
}

const rootEl = document.getElementById("root");
if (rootEl && !localStorage.getItem("token")) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <LanguageProvider>
        <Router>
          <Landing />
        </Router>
      </LanguageProvider>
    </React.StrictMode>
  );
}
