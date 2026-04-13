"use client";

import { useEffect } from "react";

type DriftStatus = "stable" | "watch" | "softening" | "attention";

function titleFromStatus(status: DriftStatus) {
  switch (status) {
    case "attention":
      return "DRIFT — Action Needed 🔴";
    case "softening":
      return "DRIFT — Unstable 🟠";
    case "watch":
      return "DRIFT — Developing 🟡";
    case "stable":
    default:
      return "DRIFT — Stable ✅";
  }
}

export default function AlertsTitleSync({
  status,
}: {
  status: DriftStatus;
}) {
  useEffect(() => {
    document.title = titleFromStatus(status);
  }, [status]);

  return null;
}