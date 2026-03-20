import React from "react";
import PageHero from "../components/ui/PageHero.jsx";
import PageSection from "../components/ui/PageSection.jsx";
import GlassCard from "../components/ui/GlassCard.jsx";

export default function LearnPage() {
  return (
    <div style={{ padding: "clamp(20px, 4vw, 40px)", display: "grid", gap: 28 }}>
      <PageHero
        eyebrow="Learn"
        title="A field-guide style introduction to beech trees and changing forest conditions."
        body="This section is the beginning of an educational resource library for BeechLens. It is meant to help people understand what American beech trees are, how beech leaf disease appears, and why repeated local observation matters."
      />

      <PageSection
        eyebrow="Start here"
        title="What this resource section should do."
        intro="The goal is not to overwhelm people with technical literature at first contact. It is to create a clear and inviting starting point for learning what to notice in the field."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: 18,
          }}
        >
          <GlassCard>
            <h3 style={{ marginTop: 0 }}>Recognize the tree</h3>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
              Placeholder content for identifying American beech by bark, leaves,
              growth habit, and common habitat.
            </p>
          </GlassCard>

          <GlassCard>
            <h3 style={{ marginTop: 0 }}>Recognize the symptoms</h3>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
              Placeholder content for dark interveinal banding, leaf thickening,
              curling, canopy thinning, and decline.
            </p>
          </GlassCard>

          <GlassCard>
            <h3 style={{ marginTop: 0 }}>Recognize uncertainty</h3>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
              Placeholder content for active research questions, look-alikes, and
              why observation should remain careful and transparent.
            </p>
          </GlassCard>
        </div>
      </PageSection>

      <PageSection
        eyebrow="Planned resource modules"
        title="A structure that can expand over time."
        intro="These modules can begin as concise public-facing explainers and later develop into fuller educational pages."
      >
        <div style={{ display: "grid", gap: 14 }}>
          {[
            "What is beech leaf disease?",
            "How to identify American beech",
            "What to look for in leaves and buds",
            "Forest impacts and ecological significance",
            "How the disease may spread",
            "What researchers still do not know",
            "Why repeated monitoring matters",
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