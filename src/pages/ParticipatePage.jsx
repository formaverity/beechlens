import React from "react";
import PageHero from "../components/ui/PageHero.jsx";
import PageSection from "../components/ui/PageSection.jsx";
import GlassCard from "../components/ui/GlassCard.jsx";
import { ActionLink } from "../components/ui/ActionButton.jsx";

export default function ParticipatePage() {
  return (
    <div style={{ padding: "clamp(20px, 4vw, 40px)", display: "grid", gap: 28 }}>
      <PageHero
        eyebrow="Participate"
        title="Help build a local record of beech trees and change over time."
        body="BeechLens is being designed to support multiple forms of participation, from curious first-time observers to expert users. The aim is to make contribution approachable without losing the value of careful documentation."
        actions={<ActionLink to="/map">Go to Tree Census</ActionLink>}
      />

      <PageSection
        eyebrow="How it works"
        title="Participation should feel clear, grounded, and useful."
        intro="This section will eventually connect outreach directly to field action. For now, it can establish the basic logic of how people contribute."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 18,
          }}
        >
          <GlassCard>
            <h3 style={{ marginTop: 0 }}>Find a tree</h3>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
              Start with a beech tree in your neighborhood, park, school grounds,
              roadside, or local forest.
            </p>
          </GlassCard>

          <GlassCard>
            <h3 style={{ marginTop: 0 }}>Observe carefully</h3>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
              Look at leaves, canopy condition, and surrounding context. Take clear
              photos and record what you are seeing as carefully as possible.
            </p>
          </GlassCard>

          <GlassCard>
            <h3 style={{ marginTop: 0 }}>Tag the specimen</h3>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
              Add the tree to the census tool with a location, notes, health status,
              and optional photo.
            </p>
          </GlassCard>

          <GlassCard>
            <h3 style={{ marginTop: 0 }}>Return later</h3>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
              Repeated observation is one of the most important parts of meaningful
              stewardship and monitoring.
            </p>
          </GlassCard>
        </div>
      </PageSection>

      <PageSection
        eyebrow="Coming soon"
        title="Participation materials that can grow with the project."
        intro="These are good placeholder categories for future development during Phase 1."
      >
        <div style={{ display: "grid", gap: 14 }}>
          {[
            "Field observation instructions",
            "What to photograph",
            "Student and classroom participation",
            "Printable field worksheets",
            "Specimen revisit guidance",
            "Frequently asked questions",
          ].map((item) => (
            <GlassCard key={item} padding={18} radius={18}>
              <div style={{ fontWeight: 800 }}>{item}</div>
            </GlassCard>
          ))}
        </div>
      </PageSection>
    </div>
  );
}