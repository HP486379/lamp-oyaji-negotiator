import React from "react";
import { createRoot } from "react-dom/client";
import ParkingMvpApp from "./App.jsx";
import SpecTaroApp from "./SpecTaroApp.jsx";
import "./styles.css";

// The parking product is a generated-MVP verification target.  The main
// application remains Spec Taro; keep the target available at /parking.
createRoot(document.getElementById("root")).render(<React.StrictMode>{window.location.pathname.startsWith("/parking") ? <ParkingMvpApp /> : <SpecTaroApp />}</React.StrictMode>);
