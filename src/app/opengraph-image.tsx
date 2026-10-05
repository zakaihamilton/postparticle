import { ImageResponse } from "next/og";

export const alt = "Postparticle — a home for your content";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: 40,
        backgroundColor: "#f3f8fd",
        color: "#182c40",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 44,
          padding: "52px 58px",
          border: "1px solid #d8e6f2",
          borderRadius: 22,
          backgroundColor: "#ffffff",
        }}
      >
        <div
          style={{
            width: "57%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div
              style={{
                width: 48,
                height: 48,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 9,
                backgroundColor: "#b9dcff",
              }}
            >
              <svg width="34" height="36" viewBox="0 0 31 33" fill="none">
                <path
                  d="M10 27V12h6a5 5 0 0 1 0 10h-6"
                  stroke="#123e60"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="24" cy="7" r="2.5" fill="#123e60" opacity=".7" />
              </svg>
            </div>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>
              <span>postp</span>
              <span style={{ color: "#245b87" }}>article</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 19 }}>
            <div
              style={{
                display: "flex",
                fontSize: 64,
                lineHeight: 1.05,
                letterSpacing: -2,
                fontWeight: 700,
              }}
            >
              A home for your content.
            </div>
            <div
              style={{
                display: "flex",
                maxWidth: 570,
                color: "#526b80",
                fontSize: 25,
                lineHeight: 1.35,
              }}
            >
              Write privately. Publish when you’re ready.
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              color: "#526b80",
              fontSize: 15,
              letterSpacing: 1.1,
              fontWeight: 700,
            }}
          >
            OPEN SOURCE <span style={{ color: "#245b87" }}>·</span> PRIVATE
            DRAFTS <span style={{ color: "#245b87" }}>·</span> PUBLIC API
          </div>
        </div>
        <div
          style={{
            width: "39%",
            display: "flex",
            flexDirection: "column",
            gap: 22,
            padding: 28,
            border: "1px solid #d8e6f2",
            borderRadius: 16,
            backgroundColor: "#f8fbfe",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              color: "#526b80",
              fontSize: 13,
              letterSpacing: 1,
              fontWeight: 700,
            }}
          >
            <span>ARTICLE EDITOR</span>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                color: "#426344",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: "#426344",
                }}
              />
              DRAFT
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: "21px 22px",
              border: "1px solid #d8e6f2",
              borderRadius: 11,
              backgroundColor: "#ffffff",
            }}
          >
            <span style={{ color: "#526b80", fontSize: 14 }}>
              ARCHITECTURE · 6 MIN READ
            </span>
            <strong style={{ fontSize: 27, lineHeight: 1.1 }}>
              A little room to breathe
            </strong>
            <span
              style={{
                width: "100%",
                height: 9,
                borderRadius: 5,
                backgroundColor: "#eaf5ff",
              }}
            />
            <span
              style={{
                width: "83%",
                height: 9,
                borderRadius: 5,
                backgroundColor: "#eaf5ff",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "15px 16px",
              borderRadius: 10,
              backgroundColor: "#eaf5ff",
              color: "#245b87",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 24,
                height: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
                backgroundColor: "#b9dcff",
                fontSize: 16,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path
                  d="m2 6.5 3 3L11 3"
                  stroke="#245b87"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            Changes stay private until published
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
