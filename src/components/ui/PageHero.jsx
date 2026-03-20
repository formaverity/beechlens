import React from "react";

export default function PageHero({
  eyebrow,
  title,
  body,
  actions,
}) {
  return (
    <section
      style={{
        width: "100%",
        maxWidth: 1180,
        margin: "0 auto",
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.045)",
        backdropFilter: "blur(10px)",
        borderRadius: 28,
        padding: "clamp(28px, 5vw, 64px)",
        boxShadow: "0 30px 90px rgba(0,0,0,0.28)",
      }}
    >
      <div style={{ maxWidth: 780, display: "grid", gap: 16 }}>
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

        <h1
          style={{
            margin: 0,
            fontSize: "clamp(40px, 8vw, 84px)",
            lineHeight: 0.95,
            letterSpacing: "-0.05em",
            fontFamily:
              '"BeechDisplay", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif',
            fontWeight: 400,
          }}
        >
          {title}
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: "clamp(17px, 2vw, 22px)",
            lineHeight: 1.55,
            color: "rgba(255,255,255,0.82)",
            maxWidth: 700,
          }}
        >
          {body}
        </p>

        {actions ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  );
}