"use client";

import { useEffect } from "react";

type DriftTitleStatus =
  | "stable"
  | "watch"
  | "softening"
  | "attention"
  | "movement";

function titleForStatus(status: DriftTitleStatus) {
  if (status === "attention") return "DRIFT — Action Needed";
  if (status === "softening") return "DRIFT — Softening";
  if (status === "watch") return "DRIFT — Developing";
  if (status === "movement") return "DRIFT — Momentum Detected";
  return "DRIFT — Stable";
}

export default function AlertsTitleSync({
  status,
}: {
  status: DriftTitleStatus;
}) {
  useEffect(() => {
    document.title = titleForStatus(status);
  }, [status]);

  return null;
}