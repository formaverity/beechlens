import React from "react";
import { Routes, Route } from "react-router-dom";

import SiteShell from "./components/layout/SiteShell.jsx";
import HomePage from "./pages/HomePage.jsx";
import AboutPage from "./pages/AboutPage.jsx";
import LearnPage from "./pages/LearnPage.jsx";
import ParticipatePage from "./pages/ParticipatePage.jsx";
import LeaderboardPage from "./pages/LeaderboardPage.jsx";
import MapPage from "./pages/MapPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SiteShell />}>
        <Route index element={<HomePage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="learn" element={<LearnPage />} />
        <Route path="participate" element={<ParticipatePage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="map" element={<MapPage />} />
      </Route>
    </Routes>
  );
}