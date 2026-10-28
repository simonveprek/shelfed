import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Hooks for scripted checks while developing.
if (import.meta.env.DEV) {
  Promise.all([import("./lib/actions"), import("./lib/store"), import("./lib/commands"), import("./lib/annotations")]).then(([actions, store, commands, annotations]) => {
    Object.assign(window, { __shelf: { ...actions, ...store, ...commands, ...annotations } });
  });
}
