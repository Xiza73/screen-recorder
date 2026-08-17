import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { readOverlayParams } from "./features/region-picker/overlay-params";
import { SelectionOverlay } from "./features/region-picker/SelectionOverlay";
import "./styles/tokens.css";

// Un solo bundle para las dos ventanas: la query string decide cuál se renderiza.
const params = readOverlayParams(window.location.search);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {params.overlay ? (
      <SelectionOverlay
        initial={params.region}
        interactive={params.interactive}
        primary={params.primary}
      />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
