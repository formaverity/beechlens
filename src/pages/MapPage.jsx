import React from "react";
import MapApp from "../components/map/MapApp.jsx";

export default function MapPage() {
  return (
    <div className="mapPageWrap">
      <style>{`
        .mapPageWrap{
          height: 100%;
          min-height: calc(100dvh - var(--site-header-h));
          display: grid;
          grid-template-rows: auto 1fr;
          gap: 12px;
          padding: clamp(10px, 2vw, 18px);
          overflow: hidden;
        }

        .mapPageIntro{
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.04);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          padding: 14px 16px;
          box-shadow: 0 30px 90px rgba(0,0,0,0.24);
          display: grid;
          gap: 5px;
          flex-shrink: 0;
        }

        .mapPageEyebrow{
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          opacity: 0.65;
          font-weight: 800;
        }

        .mapPageTitleRow{
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .mapPageTitle{
          margin: 0;
          font-size: clamp(20px, 3vw, 32px);
          line-height: 1;
          letter-spacing: -0.03em;
        }

        .mapPageBody{
          margin: 0;
          color: rgba(255,255,255,0.76);
          line-height: 1.5;
          max-width: 860px;
          font-size: 13px;
        }

        .mapPageCanvas{
          min-height: 0;
          overflow: hidden;
        }

        @media (max-width: 820px){
          .mapPageWrap{
            gap: 8px;
            padding: 8px;
          }

          .mapPageIntro{
            padding: 12px 13px;
            border-radius: 16px;
          }

          .mapPageTitle{
            font-size: 20px;
          }

          .mapPageBody{
            font-size: 12px;
            line-height: 1.45;
          }
        }
      `}</style>

      <section className="mapPageIntro">
        <div className="mapPageEyebrow">Tree Census</div>
        <div className="mapPageTitleRow">
          <h1 className="mapPageTitle">Live specimen map and field tools</h1>
        </div>
        <p className="mapPageBody">
          Use this interface to tag specimens, record locations, upload photos,
          and review observations. Site navigation stays above; the floating
          controls here are for field actions and specimen workflows.
        </p>
      </section>

      <div className="mapPageCanvas">
        <MapApp />
      </div>
    </div>
  );
}