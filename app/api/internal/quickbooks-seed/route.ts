import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  getQuickBooksEnv,
  getUsableQuickBooksConfig,
  quickBooksApiRequest,
  QUICKBOOKS_SOURCE_TYPE,
  QuickBooksEnvironment,
  QuickBooksSourceConfig,
} from "@/lib/quickbooks/client";

export const runtime = "nodejs";

type QuickBooksRef = {
  value: string;
};

type QuickBooksCreateResponse<T extends string> = {
  [key: string]: QuickBooksRef | undefined;
} & {
  [K in T]?: QuickBooksRef;
};

type QuickBooksQueryResponse<T extends string> = {
  QueryResponse?: {
    [key: string]: Array<QuickBooksRef & { Name?: string }> | undefined;
  } & {
    [K in T]?: Array<QuickBooksRef & { Name?: string }>;
  };
};

function requireCronAuth(req: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  const authHeader = (req.headers.get("authorization") || "").trim();
  const match = authHeader.match(/^bearer\s+(.+)$/i);
  const bearerToken = (match?.[1] || "").trim();
  const xToken = (req.headers.get("x-cron-secret") || "").trim();
  const token = bearerToken || xToken;
  const ok = Boolean(secret) && token === secret;

  return {
    ok,
    error: ok ? null : secret ? "Unauthorized" : "CRON_SECRET missing",
  };
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function midnightUtc(date: Date) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );
}

async function createCustomer(args: {
  accessToken: string;
  realmId: string;
  environment: QuickBooksEnvironment;
  displayName: string;
}) {
  const response = await quickBooksApiRequest<
    QuickBooksCreateResponse<"Customer">
  >({
    accessToken: args.accessToken,
    realmId: args.realmId,
    environment: args.environment,
    path: "/customer",
    method: "POST",
    body: {
      DisplayName: args.displayName,
      GivenName: args.displayName,
    },
  });

  const id = response.Customer?.value;
  if (!id) throw new Error(`quickbooks_customer_missing_id: ${args.displayName}`);

  return { id, displayName: args.displayName };
}

async function createServiceItem(args: {
  accessToken: string;
  realmId: string;
  environment: QuickBooksEnvironment;
  name: string;
  unitPrice: number;
  incomeAccountId: string;
  incomeAccountName?: string;
}) {
  const response = await quickBooksApiRequest<QuickBooksCreateResponse<"Item">>({
    accessToken: args.accessToken,
    realmId: args.realmId,
    environment: args.environment,
    path: "/item",
    method: "POST",
    body: {
      Name: args.name,
      Type: "Service",
      UnitPrice: args.unitPrice,
      IncomeAccountRef: {
        value: args.incomeAccountId,
        name: args.incomeAccountName,
      },
    },
  });

  const id = response.Item?.value;
  if (!id) throw new Error(`quickbooks_item_missing_id: ${args.name}`);

  return { id, name: args.name, unitPrice: args.unitPrice };
}

async function getIncomeAccount(args: {
  accessToken: string;
  realmId: string;
  environment: QuickBooksEnvironment;
}) {
  const response = await quickBooksApiRequest<QuickBooksQueryResponse<"Account">>({
    accessToken: args.accessToken,
    realmId: args.realmId,
    environment: args.environment,
    path: "/query",
    method: "POST",
    body: {
      query:
        "select * from Account where AccountType = 'Income' and Active = true maxresults 1",
    },
  });

  const account = response.QueryResponse?.Account?.[0];
  if (!account?.value) {
    throw new Error("quickbooks_income_account_not_found");
  }

  return { id: account.value, name: account.Name };
}

async function createInvoice(args: {
  accessToken: string;
  realmId: string;
  environment: QuickBooksEnvironment;
  customerId: string;
  itemId: string;
  description: string;
  amount: number;
  txnDate: string;
  dueDate: string;
}) {
  const response = await quickBooksApiRequest<
    QuickBooksCreateResponse<"Invoice">
  >({
    accessToken: args.accessToken,
    realmId: args.realmId,
    environment: args.environment,
    path: "/invoice",
    method: "POST",
    body: {
      CustomerRef: { value: args.customerId },
      TxnDate: args.txnDate,
      DueDate: args.dueDate,
      Line: [
        {
          DetailType: "SalesItemLineDetail",
          Amount: args.amount,
          Description: args.description,
          SalesItemLineDetail: {
            ItemRef: { value: args.itemId },
            Qty: 1,
            UnitPrice: args.amount,
          },
        },
      ],
    },
  });

  const id = response.Invoice?.value;
  if (!id) throw new Error(`quickbooks_invoice_missing_id: ${args.description}`);

  return { id, amount: args.amount, txnDate: args.txnDate };
}

async function createPayment(args: {
  accessToken: string;
  realmId: string;
  environment: QuickBooksEnvironment;
  customerId: string;
  invoiceId: string;
  amount: number;
  txnDate: string;
}) {
  const response = await quickBooksApiRequest<
    QuickBooksCreateResponse<"Payment">
  >({
    accessToken: args.accessToken,
    realmId: args.realmId,
    environment: args.environment,
    path: "/payment",
    method: "POST",
    body: {
      CustomerRef: { value: args.customerId },
      TotalAmt: args.amount,
      TxnDate: args.txnDate,
      Line: [
        {
          Amount: args.amount,
          LinkedTxn: [
            {
              TxnId: args.invoiceId,
              TxnType: "Invoice",
            },
          ],
        },
      ],
    },
  });

  const id = response.Payment?.value;
  if (!id) throw new Error("quickbooks_payment_missing_id");

  return { id, amount: args.amount, txnDate: args.txnDate };
}

export async function POST(req: Request) {
  const auth = requireCronAuth(req);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const businessId = String(url.searchParams.get("business_id") || "").trim();
  const confirm = url.searchParams.get("confirm");

  if (confirm !== "seed-quickbooks") {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing confirmation. Add confirm=seed-quickbooks to run.",
      },
      { status: 400 }
    );
  }

  if (!businessId) {
    return NextResponse.json(
      { ok: false, error: "Missing business_id" },
      { status: 400 }
    );
  }

  const { clientId, clientSecret, environment } = getQuickBooksEnv();

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { ok: false, error: "QuickBooks client credentials missing" },
      { status: 500 }
    );
  }

  const supabase = supabaseAdmin();
  const { data: source, error: sourceErr } = await supabase
    .from("sources")
    .select("id,business_id,type,is_connected,config")
    .eq("business_id", businessId)
    .eq("type", QUICKBOOKS_SOURCE_TYPE)
    .eq("is_connected", true)
    .maybeSingle();

  if (sourceErr) {
    return NextResponse.json(
      { ok: false, step: "read_quickbooks_source", error: sourceErr.message },
      { status: 500 }
    );
  }

  if (!source?.id) {
    return NextResponse.json(
      { ok: false, error: "No connected QuickBooks source found." },
      { status: 404 }
    );
  }

  const currentConfig = (source.config || {}) as QuickBooksSourceConfig;
  const { config, refreshed } = await getUsableQuickBooksConfig({
    config: currentConfig,
    clientId,
    clientSecret,
  });

  if (!config.access_token || !config.realm_id) {
    return NextResponse.json(
      { ok: false, error: "QuickBooks source is missing token or realm ID." },
      { status: 400 }
    );
  }

  const sourceEnvironment = config.quickbooks_environment ?? environment;

  if (sourceEnvironment !== "sandbox") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "QuickBooks seed endpoint is limited to sandbox mode to avoid writing test data to real companies.",
      },
      { status: 400 }
    );
  }

  if (refreshed) {
    const { error: updateTokenErr } = await supabase
      .from("sources")
      .update({ config })
      .eq("id", source.id);

    if (updateTokenErr) {
      return NextResponse.json(
        { ok: false, step: "update_refreshed_token", error: updateTokenErr.message },
        { status: 500 }
      );
    }
  }

  const runLabel = `DRIFT Test ${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const today = midnightUtc(new Date());
  const customers = await Promise.all(
    ["Northline Cafe", "Summit Fitness Studio", "Harbor Dental Group"].map(
      (name) =>
        createCustomer({
          accessToken: config.access_token!,
          realmId: config.realm_id!,
          environment: sourceEnvironment,
          displayName: `${runLabel} - ${name}`,
        })
    )
  );

  const incomeAccount = await getIncomeAccount({
    accessToken: config.access_token,
    realmId: config.realm_id,
    environment: sourceEnvironment,
  });

  const item = await createServiceItem({
    accessToken: config.access_token,
    realmId: config.realm_id,
    environment: sourceEnvironment,
    name: `${runLabel} - Revenue Monitoring Service`,
    unitPrice: 850,
    incomeAccountId: incomeAccount.id,
    incomeAccountName: incomeAccount.name,
  });

  const invoiceSpecs = [
    { customerIndex: 0, daysAgo: 33, amount: 1200, description: "Setup fee" },
    { customerIndex: 0, daysAgo: 24, amount: 850, description: "Monthly service" },
    { customerIndex: 1, daysAgo: 18, amount: 850, description: "Monthly service" },
    { customerIndex: 2, daysAgo: 12, amount: 450, description: "Performance review" },
    { customerIndex: 1, daysAgo: 4, amount: 850, description: "Monthly service" },
    { customerIndex: 2, daysAgo: 1, amount: 300, description: "Additional location support" },
  ];

  const invoices = [];
  const payments = [];

  for (const spec of invoiceSpecs) {
    const customer = customers[spec.customerIndex];
    const txnDate = isoDate(addDays(today, -spec.daysAgo));
    const invoice = await createInvoice({
      accessToken: config.access_token,
      realmId: config.realm_id,
      environment: sourceEnvironment,
      customerId: customer.id,
      itemId: item.id,
      description: `${runLabel} - ${spec.description}`,
      amount: spec.amount,
      txnDate,
      dueDate: isoDate(addDays(new Date(txnDate), 15)),
    });

    invoices.push(invoice);

    const payment = await createPayment({
      accessToken: config.access_token,
      realmId: config.realm_id,
      environment: sourceEnvironment,
      customerId: customer.id,
      invoiceId: invoice.id,
      amount: spec.amount,
      txnDate,
    });

    payments.push(payment);
  }

  return NextResponse.json({
    ok: true,
    environment: sourceEnvironment,
    business_id: businessId,
    source_id: source.id,
    run_label: runLabel,
    created: {
      customers: customers.length,
      items: 1,
      invoices: invoices.length,
      payments: payments.length,
    },
    refreshed,
    note:
      "Seed data was written to the connected QuickBooks sandbox company only.",
  });
}
