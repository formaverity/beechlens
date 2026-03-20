import React from "react";
import PageHero from "../components/ui/PageHero.jsx";
import PageSection from "../components/ui/PageSection.jsx";
import GlassCard from "../components/ui/GlassCard.jsx";
import { ActionLink } from "../components/ui/ActionButton.jsx";

export default function HomePage() {
  return (
    <div style={{ padding: "clamp(20px, 4vw, 40px)", display: "grid", gap: 28 }}>
      <PageHero
        eyebrow="Community conservation · Bucks County, Pennsylvania"
        title="A shared story of beech trees, local forests, and care."
        body="BeechLens is a design-driven conservation platform that invites people into a closer relationship with the beech trees in their communities. Through observation, mapping, and education, it helps build a living record of change over time."
        actions={
          <>
            <ActionLink to="/map">Open Tree Census</ActionLink>
            <ActionLink to="/learn" secondary>
              Learn About Beech Leaf Disease
            </ActionLink>
          </>
        }
      />

      <PageSection
        eyebrow="Why this matters"
        title="Not just a map, but a framework for stewardship."
        intro="BeechLens is meant to connect scientific usefulness with public participation. The goal is not only to document trees, but to help people notice them, return to them, and contribute to a shared local understanding of forest change."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 18,
          }}
        >
          <GlassCard>
            <h3 style={{ marginTop: 0 }}>Notice</h3>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
              Learn how to recognize American beech trees and begin observing signs
              of stress, decline, and possible beech leaf disease.
            </p>
          </GlassCard>

          <GlassCard>
            <h3 style={{ marginTop: 0 }}>Document</h3>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
              Use the tree census to tag specimens, record locations, upload photos,
              and create a clearer picture of what is happening on the ground.
            </p>
          </GlassCard>

          <GlassCard>
            <h3 style={{ marginTop: 0 }}>Return</h3>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
              Long-term care depends on repeated observation. BeechLens is designed
              to support ongoing stewardship, not one-time reporting alone.
            </p>
          </GlassCard>
        </div>
      </PageSection>

      <PageSection
        eyebrow="Explore"
        title="Three entry points into the project."
        intro="The outreach site will grow over time, but these are the core paths people can already take through the platform."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 18,
          }}
        >
          <GlassCard>
            <div style={{ display: "grid", gap: 10 }}>
              <h3 style={{ margin: 0 }}>Learn</h3>
              <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
                Educational resources about beech leaf disease, field symptoms, and
                the ecological role of American beech.
              </p>
              <div>
                <ActionLink to="/learn" secondary>
                  Visit Learn
                </ActionLink>
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <div style={{ display: "grid", gap: 10 }}>
              <h3 style={{ margin: 0 }}>Participate</h3>
              <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
                See how students, residents, and expert users can help build a local
                record of trees and changing conditions.
              </p>
              <div>
                <ActionLink to="/participate" secondary>
                  Visit Participate
                </ActionLink>
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <div style={{ display: "grid", gap: 10 }}>
              <h3 style={{ margin: 0 }}>Tree Census</h3>
              <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
                Open the live mapping and specimen-tagging tool to begin documenting
                trees in the field.
              </p>
              <div>
                <ActionLink to="/map">Open Census</ActionLink>
              </div>
            </div>
          </GlassCard>
        </div>
      </PageSection>

      <PageSection
        eyebrow="In development"
        title="A platform that can grow with the project."
        intro="This is the beginning of a broader conservation platform that will eventually support outreach, field observation, educational resources, project activity, and long-term specimen records."
      >
        <GlassCard>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 18,
            }}
          >
            <div>
              <div style={{ fontSize: 12, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Current focus
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>
                Outreach site + census integration
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Near-term additions
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>
                Learning tools, participation flows, activity pages
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Longer arc
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>
                Longitudinal monitoring and public stewardship
              </div>
            </div>
          </div>
        </GlassCard>
      </PageSection>
    </div>
  );
}