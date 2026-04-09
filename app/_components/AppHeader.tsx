import Link from "next/link";

export default function AppHeader() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20,
      }}
    >
      <Link
        href="/"
        style={{
          fontSize: 12,
          letterSpacing: 0.5,
          fontWeight: 900,
          color: "#E6EAF0",
          textDecoration: "none",
        }}
      >
        DRIFT
      </Link>

      <div style={{ fontSize: 12, color: "#9AA4B2" }}>
        Command Center Login
      </div>
    </div>
  );
}