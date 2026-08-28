export const QUICKBOOKS_SOURCE_TYPE = "quickbooks_revenue";

const AUTH_BASE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const API_BASE_URL = "https://quickbooks.api.intuit.com";
const ACCOUNTING_SCOPE = "com.intuit.quickbooks.accounting";

export type QuickBooksTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
};

export type QuickBooksSourceConfig = {
  oauth_state?: string;
  realm_id?: string;
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  access_token_expires_at?: string;
  refresh_token_expires_at?: string;
  connected_at?: string;
  updated_at?: string;
};

type QuickBooksColData = {
  value?: unknown;
};

type QuickBooksReportRow = {
  Summary?: {
    ColData?: QuickBooksColData[];
  };
  Header?: {
    ColData?: QuickBooksColData[];
  };
  ColData?: QuickBooksColData[];
  Rows?: {
    Row?: QuickBooksReportRow[];
  };
};

type QuickBooksReport = {
  Rows?: {
    Row?: QuickBooksReportRow[];
  };
  Fault?: {
    Error?: Array<{
      Message?: string;
    }>;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getQuickBooksEnv() {
  const clientId = (process.env.QUICKBOOKS_CLIENT_ID || "").trim();
  const clientSecret = (process.env.QUICKBOOKS_CLIENT_SECRET || "").trim();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://drifthq.co").replace(
    /\/$/,
    ""
  );
  const redirectUri =
    (process.env.QUICKBOOKS_REDIRECT_URI || "").trim() ||
    `${appUrl}/api/quickbooks/callback`;

  return {
    clientId,
    clientSecret,
    appUrl,
    redirectUri,
  };
}

export function buildQuickBooksAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const params = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    response_type: "code",
    scope: ACCOUNTING_SCOPE,
    state: args.state,
  });

  return `${AUTH_BASE_URL}?${params.toString()}`;
}

function basicAuth(clientId: string, clientSecret: string) {
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

function tokenExpiryFromNow(secondsValue: unknown) {
  const seconds = Number(secondsValue);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function mergeTokenConfig(
  config: QuickBooksSourceConfig,
  tokenJson: QuickBooksTokenResponse
): QuickBooksSourceConfig {
  return {
    ...config,
    access_token: tokenJson.access_token,
    refresh_token: tokenJson.refresh_token ?? config.refresh_token,
    token_type: tokenJson.token_type ?? config.token_type ?? "bearer",
    access_token_expires_at:
      tokenExpiryFromNow(tokenJson.expires_in) ?? config.access_token_expires_at,
    refresh_token_expires_at:
      tokenExpiryFromNow(tokenJson.x_refresh_token_expires_in) ??
      config.refresh_token_expires_at,
    updated_at: new Date().toISOString(),
  };
}

export async function exchangeQuickBooksCode(args: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${basicAuth(args.clientId, args.clientSecret)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: args.code,
      redirect_uri: args.redirectUri,
    }),
  });

  return parseQuickBooksTokenResponse(res);
}

export async function refreshQuickBooksToken(args: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${basicAuth(args.clientId, args.clientSecret)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: args.refreshToken,
    }),
  });

  return parseQuickBooksTokenResponse(res);
}

async function parseQuickBooksTokenResponse(res: Response) {
  const text = await res.text();
  let json: unknown = null;

  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  const payload = isRecord(json) ? json : {};

  if (!res.ok) {
    const errorDescription = String(
      payload.error_description || payload.error || text.slice(0, 240)
    );

    throw new Error(
      `quickbooks_token_failed: ${res.status} ${errorDescription}`
    );
  }

  if (!payload.access_token) {
    throw new Error("quickbooks_token_missing_access_token");
  }

  return payload as QuickBooksTokenResponse;
}

function needsRefresh(config: QuickBooksSourceConfig) {
  if (!config.access_token) return true;
  if (!config.access_token_expires_at) return false;

  const expiresAt = new Date(config.access_token_expires_at).getTime();
  if (!Number.isFinite(expiresAt)) return false;

  return expiresAt - Date.now() < 5 * 60 * 1000;
}

export async function getUsableQuickBooksConfig(args: {
  config: QuickBooksSourceConfig;
  clientId: string;
  clientSecret: string;
}) {
  if (!needsRefresh(args.config)) {
    return { config: args.config, refreshed: false };
  }

  if (!args.config.refresh_token) {
    throw new Error("quickbooks_missing_refresh_token");
  }

  const tokenJson = await refreshQuickBooksToken({
    clientId: args.clientId,
    clientSecret: args.clientSecret,
    refreshToken: args.config.refresh_token,
  });

  return {
    config: mergeTokenConfig(args.config, tokenJson),
    refreshed: true,
  };
}

export async function fetchQuickBooksProfitAndLoss(args: {
  accessToken: string;
  realmId: string;
  startDate: string;
  endDate: string;
  summarizeColumnBy?: "Days";
}) {
  const url = new URL(
    `${API_BASE_URL}/v3/company/${encodeURIComponent(
      args.realmId
    )}/reports/ProfitAndLoss`
  );

  url.searchParams.set("start_date", args.startDate);
  url.searchParams.set("end_date", args.endDate);
  url.searchParams.set("accounting_method", "Accrual");
  if (args.summarizeColumnBy) {
    url.searchParams.set("summarize_column_by", args.summarizeColumnBy);
  }
  url.searchParams.set("minorversion", "75");

  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${args.accessToken}`,
    },
  });

  const text = await res.text();
  let json: unknown = null;

  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  const report = json as QuickBooksReport | null;

  if (!res.ok) {
    throw new Error(
      `quickbooks_profit_and_loss_failed: ${res.status} ${
        report?.Fault?.Error?.[0]?.Message || text.slice(0, 240)
      }`
    );
  }

  return report;
}

function numericValue(raw: unknown) {
  const normalized = String(raw ?? "")
    .replace(/,/g, "")
    .replace(/\$/g, "")
    .trim();

  if (!normalized) return null;

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function firstAmountFromColData(row: QuickBooksReportRow) {
  const colData = row?.Summary?.ColData || row?.ColData || row?.Header?.ColData;
  if (!Array.isArray(colData)) return null;

  for (let i = colData.length - 1; i >= 1; i--) {
    const value = numericValue(colData[i]?.value);
    if (value !== null) return value;
  }

  return null;
}

function rowLabel(row: QuickBooksReportRow) {
  const candidates = [
    row?.Summary?.ColData?.[0]?.value,
    row?.Header?.ColData?.[0]?.value,
    row?.ColData?.[0]?.value,
  ];

  return String(candidates.find(Boolean) || "")
    .trim()
    .toLowerCase();
}

export function extractRevenueFromProfitAndLoss(report: QuickBooksReport | null) {
  const rows = report?.Rows?.Row;
  const stack = Array.isArray(rows) ? [...rows] : [];
  let income: number | null = null;

  while (stack.length) {
    const row = stack.shift();
    if (!row) continue;

    const label = rowLabel(row);
    const amount = firstAmountFromColData(row);

    if (amount !== null && label === "total income") {
      return amount;
    }

    if (amount !== null && label === "income") {
      income = amount;
    }

    const nested = row?.Rows?.Row;
    if (Array.isArray(nested)) {
      stack.push(...nested);
    }
  }

  return income ?? 0;
}

function dateFromColumnTitle(raw: unknown) {
  const value = String(raw ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function reportColumnDates(report: QuickBooksReport | null) {
  const columns = (report as { Columns?: { Column?: Array<{ ColTitle?: unknown }> } } | null)
    ?.Columns?.Column;

  if (!Array.isArray(columns)) return [];

  return columns.map((column) => dateFromColumnTitle(column?.ColTitle));
}

export function extractDailyRevenueFromProfitAndLoss(
  report: QuickBooksReport | null
) {
  const columnDates = reportColumnDates(report);
  const rows = report?.Rows?.Row;
  const stack = Array.isArray(rows) ? [...rows] : [];
  let incomeRow: QuickBooksReportRow | null = null;

  while (stack.length) {
    const row = stack.shift();
    if (!row) continue;

    const label = rowLabel(row);

    if (label === "total income") {
      incomeRow = row;
      break;
    }

    if (label === "income") {
      incomeRow = row;
    }

    const nested = row?.Rows?.Row;
    if (Array.isArray(nested)) {
      stack.push(...nested);
    }
  }

  const colData =
    incomeRow?.Summary?.ColData || incomeRow?.ColData || incomeRow?.Header?.ColData;
  const revenueByDate = new Map<string, number>();

  if (!Array.isArray(colData)) {
    return revenueByDate;
  }

  for (let i = 0; i < colData.length; i++) {
    const date = columnDates[i];
    if (!date) continue;

    revenueByDate.set(date, numericValue(colData[i]?.value) ?? 0);
  }

  return revenueByDate;
}
