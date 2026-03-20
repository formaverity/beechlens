import React from "react";

export default function PageSection({
  eyebrow,
  title,
  intro,
  children,
  maxWidth = 1180,
}) {
  return (
    <section
      style={{
        width: "100%",
        maxWidth,
        margin: "0 auto",
        display: "grid",
        gap: 18,
      }}
    >
      {(eyebrow || title || intro) && (
        <div style={{ display: "grid", gap: 10, maxWidth: 760 }}>
          {eyebrow ? (
            <div
              style={{
                fontSize: 12,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                opacity: 0.68,
                fontWeight: 800,
              }}
            >
              {eyebrow}
            </div>
          ) : null}

          {title ? (
            <h2
              style={{
                margin: 0,
                fontSize: "clamp(28px, 4vw, 52px)",
                lineHeight: 0.98,
                letterSpacing: "-0.04em",
                fontWeight: 700,
              }}
            >
              {title}
            </h2>
          ) : null}

          {intro ? (
            <p
              style={{
                margin: 0,
                fontSize: "clamp(16px, 1.7vw, 20px)",
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.78)",
              }}
            >
              {intro}
            </p>
          ) : null}
        </div>
      )}

      {children}
    </section>
  );
}