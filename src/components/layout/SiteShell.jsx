import React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

const navLinkStyle = ({ isActive }) => ({
  padding: "9px 12px",
  borderRadius: 999,
  textDecoration: "none",
  color: "rgba(255,255,255,0.92)",
  border: isActive
    ? "1px solid rgba(134,239,172,0.28)"
    : "1px solid rgba(255,255,255,0.10)",
  background: isActive
    ? "rgba(134,239,172,0.10)"
    : "rgba(255,255,255,0.04)",
  fontWeight: 700,
  fontSize: 13,
  lineHeight: 1,
  whiteSpace: "nowrap",
  transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease",
  flexShrink: 0,
});

export default function SiteShell() {
  const location = useLocation();
  const isMapRoute = location.pathname.startsWith("/map");

  return (
    <div className="siteShell">
      <style>{`
        .siteShell{
          --site-header-h: 76px;
          min-height: 100dvh;
          display: grid;
          grid-template-rows: auto 1fr auto;
          background:
            radial-gradient(1200px 800px at 18% 12%, rgba(134, 239, 172, 0.18) 0%, rgba(11, 16, 18, 0) 55%),
            radial-gradient(900px 700px at 88% 8%, rgba(45, 212, 191, 0.14) 0%, rgba(11, 16, 18, 0) 58%),
            radial-gradient(900px 800px at 60% 110%, rgba(163, 230, 53, 0.08) 0%, rgba(11, 16, 18, 0) 60%),
            linear-gradient(180deg, #070B0E 0%, #0B1415 55%, #070B0E 100%);
          color: rgba(255,255,255,0.92);
          overflow-x: clip;
        }

        .siteHeader{
          position: sticky;
          top: 0;
          z-index: 100;
          min-height: var(--site-header-h);
          background: rgba(10,14,20,0.58);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }

        .siteHeaderInner{
          width: 100%;
          max-width: 1180px;
          margin: 0 auto;
          min-height: var(--site-header-h);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 14px 18px;
        }

        .siteBrand{
          font-family: "BeechDisplay", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
          font-size: clamp(20px, 2.2vw, 30px);
          font-weight: 400;
          letter-spacing: -0.04em;
          color: rgba(255,255,255,0.96);
          text-decoration: none;
          line-height: 1;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .siteNav{
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: nowrap;
          justify-content: flex-end;
          min-width: 0;
          max-width: 100%;
        }

        .siteMain{
          min-height: 0;
        }

        .siteMain.mapRouteMain{
          min-height: calc(100dvh - var(--site-header-h));
          height: calc(100dvh - var(--site-header-h));
          overflow: hidden;
        }

        .siteFooter{
          padding: 18px;
          border-top: 1px solid rgba(255,255,255,0.08);
          background: rgba(10,14,20,0.34);
          color: rgba(255,255,255,0.68);
          font-size: 13px;
        }

        .siteFooterInner{
          max-width: 1180px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        @media (max-width: 860px){
          .siteShell{
            --site-header-h: 112px;
          }

          .siteHeaderInner{
            min-height: var(--site-header-h);
            align-items: flex-start;
            justify-content: center;
            flex-direction: column;
            gap: 10px;
            padding: 12px 12px;
          }

          .siteBrand{
            font-size: 24px;
          }

          .siteNav{
            width: 100%;
            justify-content: flex-start;
            overflow-x: auto;
            overflow-y: hidden;
            padding-bottom: 2px;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
            gap: 8px;
          }

          .siteNav::-webkit-scrollbar{
            display: none;
          }
        }

        @media (max-width: 520px){
          .siteShell{
            --site-header-h: 104px;
          }

          .siteHeaderInner{
            padding: 10px 10px;
            gap: 8px;
          }

          .siteBrand{
            font-size: 22px;
          }
        }
      `}</style>

      <header className="siteHeader">
        <div className="siteHeaderInner">
          <NavLink to="/" className="siteBrand">
            BeechLens
          </NavLink>

          <nav className="siteNav" aria-label="Primary">
            <NavLink to="/" end style={navLinkStyle}>
              Home
            </NavLink>
            <NavLink to="/about" style={navLinkStyle}>
              About
            </NavLink>
            <NavLink to="/learn" style={navLinkStyle}>
              Learn
            </NavLink>
            <NavLink to="/participate" style={navLinkStyle}>
              Participate
            </NavLink>
            <NavLink to="/leaderboard" style={navLinkStyle}>
              Activity
            </NavLink>
            <NavLink to="/map" style={navLinkStyle}>
              Tree Census
            </NavLink>
          </nav>
        </div>
      </header>

      <main className={`siteMain ${isMapRoute ? "mapRouteMain" : ""}`}>
        <Outlet />
      </main>

      {!isMapRoute && (
        <footer className="siteFooter">
          <div className="siteFooterInner">
            <div>BeechLens — a community-centered conservation platform.</div>
            <div>Bucks County, Pennsylvania · Phase 1 in development</div>
          </div>
        </footer>
      )}
    </div>
  );
}