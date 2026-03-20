import React from "react";
import PageHero from "../components/ui/PageHero.jsx";
import PageSection from "../components/ui/PageSection.jsx";
import GlassCard from "../components/ui/GlassCard.jsx";
import { ActionLink } from "../components/ui/ActionButton.jsx";

export default function AboutPage() {
  return (
    <div style={{ padding: "clamp(20px, 4vw, 40px)", display: "grid", gap: 28 }}>
      <PageHero
        eyebrow="About the project"
        title="A local platform for noticing, documenting, and caring for beech trees."
        body="BeechLens is being developed as a conservation platform that brings together mapping, field observation, public education, and long-term stewardship. It begins in Bucks County and is grounded in the idea that ecological care starts with sustained local attention."
        actions={<ActionLink to="/map">Open Tree Census</ActionLink>}
      />

      <PageSection
        eyebrow="Mission"
        title="Design can help people enter a conservation story."
        intro="The project is intentionally design-driven and narrative-driven. It is not only about collecting data, but about helping people build a more personal relationship with the beech trees in their neighborhoods, parks, roadsides, and forests."
      >
        <GlassCard>
          <p style={{ marginTop: 0, color: "rgba(255,255,255,0.82)", lineHeight: 1.7 }}>
            BeechLens is meant to support a form of communal stewardship. That means
            making the platform legible and welcoming to non-experts while still
            building something that can become scientifically useful over time.
          </p>
          <p style={{ marginBottom: 0, color: "rgba(255,255,255,0.78)", lineHeight: 1.7 }}>
            The outreach website, the educational materials, and the census tool are
            all parts of the same larger aim: to help people notice change, return to
            specific trees, and participate in a shared record of ecological care.
          </p>
        </GlassCard>
      </PageSection>

      <PageSection
        eyebrow="Project structure"
        title="What the platform is designed to support."
        intro="Phase 1 focuses on creating a stable public-facing structure around the existing prototype and preparing it for broader use."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 18,
          }}
        >
          <GlassCard>
            <h3 style={{ marginTop: 0 }}>Outreach</h3>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
              A public-facing home for the mission, educational resources, project
              identity, and participation pathways.
            </p>
          </GlassCard>

          <GlassCard>
            <h3 style={{ marginTop: 0 }}>Field observation</h3>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
              A map-based census tool for documenting individual specimens, locations,
              health conditions, notes, and photos.
            </p>
          </GlassCard>

          <GlassCard>
            <h3 style={{ marginTop: 0 }}>Long-term records</h3>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
              A foundation for returning to trees over time and building a more useful
              ecological record through repeated observation.
            </p>
          </GlassCard>
        </div>
      </PageSection>
    </div>
  );
}