import React from "react";
import { Link } from "react-router-dom";

export function ActionLink({ to, children, secondary = false }) {
  return (
    <Link
      to={to}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "13px 18px",
        borderRadius: 999,
        textDecoration: "none",
        fontWeight: 800,
        border: secondary
          ? "1px solid rgba(255,255,255,0.12)"
          : "1px solid rgba(134,239,172,0.24)",
        background: secondary
          ? "rgba(255,255,255,0.04)"
          : "rgba(134,239,172,0.12)",
        color: "rgba(255,255,255,0.94)",
      }}
    >
      {children}
    </Link>
  );
}