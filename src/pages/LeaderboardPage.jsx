import React from "react";
import PageHero from "../components/ui/PageHero.jsx";
import PageSection from "../components/ui/PageSection.jsx";
import GlassCard from "../components/ui/GlassCard.jsx";

export default function LeaderboardPage() {
  return (
    <div style={{ padding: "clamp(20px, 4vw, 40px)", display: "grid", gap: 28 }}>
      <PageHero
        eyebrow="Project activity"
        title="A future-facing page for communal momentum."
        body="This section will eventually show project activity, recent observations, and patterns of participation. It should reinforce stewardship and shared effort more than competition alone."
      />

      <PageSection
        eyebrow="Placeholder metrics"
        title="Early structure for a community activity page."
        intro="For now, this page can begin as a layout for future analytics, recognition, and public-facing status updates."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 18,
          }}
        >
          <GlassCard>
            <div style={{ fontSize: 12, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Tagged specimens
            </div>
            <div style={{ fontSize: 38, fontWeight: 900, marginTop: 8 }}>—</div>
          </GlassCard>

          <GlassCard>
            <div style={{ fontSize: 12, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Active participants
            </div>
            <div style={{ fontSize: 38, fontWeight: 900, marginTop: 8 }}>—</div>
          </GlassCard>

          <GlassCard>
            <div style={{ fontSize: 12, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Areas covered
            </div>
            <div style={{ fontSize: 38, fontWeight: 900, marginTop: 8 }}>—</div>
          </GlassCard>
        </div>
      </PageSection>

      <PageSection
        eyebrow="Possible directions"
        title="What this page could become."
        intro="This page does not need to be fully gamified. It can remain centered on visibility, participation, and collective progress."
      >
        <div style={{ display: "grid", gap: 14 }}>
          {[
            "Recent observations",
            "Top stewards or contributors",
            "Coverage by park, township, or area",
            "Seasonal field updates",
            "Project milestones",
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