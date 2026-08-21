import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// A focused <input type="number"> still lets mouse-wheel scroll change its
// value even with the spinner arrows hidden via CSS (Chrome ties the
// behavior to focus, not to spinner visibility). Blur it on wheel so a
// scroll over the field scrolls the page instead of editing the value.
document.addEventListener(
  "wheel",
  () => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.type === "number") {
      active.blur();
    }
  },
  { passive: true }
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
