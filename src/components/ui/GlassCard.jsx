import React from "react";

export default function GlassCard({
  children,
  padding = 24,
  radius = 24,
  style = {},
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(10px)",
        borderRadius: radius,
        padding,
        boxShadow: "0 30px 90px rgba(0,0,0,0.28)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}