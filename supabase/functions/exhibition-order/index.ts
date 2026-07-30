import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = Deno.env.get("BUSINESS_CARD_BUCKET") ?? "business-cards";
const RETENTION_DAYS = Math.max(1, Math.min(90, Number(Deno.env.get("ORDER_RETENTION_DAYS") ?? "14")));
const SIGNED_URL_SECONDS = Math.max(300, Math.min(86400, Number(Deno.env.get("SIGNED_URL_SECONDS") ?? "3600")));
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "*")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") ?? "";
  const allowAny = ALLOWED_ORIGINS.includes("*");
  const allowed = allowAny || (origin && ALLOWED_ORIGINS.includes(origin));
  return {
    "Access-Control-Allow-Origin": allowed ? (allowAny ? "*" : origin) : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function originAllowed(req: Request): boolean {
  if (ALLOWED_ORIGINS.includes("*")) return true;
  const origin = req.headers.get("origin") ?? "";
  return ALLOWED_ORIGINS.includes(origin);
}

function randomToken(bytes = 32): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const value of values) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function cleanFileName(name: string): string {
  return name.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "business-card";
}

function extensionFor(file: File): string {
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  };
  if (byMime[file.type]) return byMime[file.type];
  const found = cleanFileName(file.name).match(/\.([A-Za-z0-9]{2,5})$/);
  return found?.[1]?.toLowerCase() ?? "jpg";
}

function validateOrder(order: any): string | null {
  if (!order || typeof order !== "object") return "注文データがありません。";
  if (!String(order.orderNo ?? "").trim()) return "注文番号がありません。";
  if (!String(order.customerCompany ?? "").trim()) return "会社名がありません。";
  if (!String(order.customerName ?? "").trim()) return "氏名がありません。";
  if (!String(order.customerPhone ?? "").trim()) return "電話番号がありません。";
  if (!Array.isArray(order.items) || order.items.length < 1) return "注文明細がありません。";
  if (order.items.length > 1000) return "1件の注文は1000品番までです。";
  for (const item of order.items) {
    if (!String(item?.c ?? "").trim()) return "品番が空の明細があります。";
    const qty = Number(item?.q ?? 0);
    if (!Number.isFinite(qty) || qty < 1 || qty > 9999) return "数量が不正です。";
  }
  return null;
}

async function uploadFile(path: string, file: File): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, await file.arrayBuffer(), {
    contentType: file.type || "application/octet-stream",
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
}

async function createOrder(req: Request): Promise<Response> {
  if (!originAllowed(req)) return json(req, { error: "origin_not_allowed" }, 403);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(req, { error: "multipart_form_required" }, 400);
  }

  const orderRaw = form.get("order");
  if (typeof orderRaw !== "string") return json(req, { error: "order_json_required" }, 400);

  let order: any;
  try {
    order = JSON.parse(orderRaw);
  } catch {
    return json(req, { error: "invalid_order_json" }, 400);
  }
  const validationError = validateOrder(order);
  if (validationError) return json(req, { error: validationError }, 400);

  const original = form.get("businessCardOriginal");
  const preview = form.get("businessCardPreview");
  const originalFile = original instanceof File && original.size > 0 ? original : null;
  const previewFile = preview instanceof File && preview.size > 0 ? preview : null;

  if (originalFile && (!originalFile.type.startsWith("image/") || originalFile.size > 15 * 1024 * 1024)) {
    return json(req, { error: "名刺の元画像は15MB以下の画像ファイルにしてください。" }, 400);
  }
  if (previewFile && (!previewFile.type.startsWith("image/") || previewFile.size > 5 * 1024 * 1024)) {
    return json(req, { error: "名刺プレビュー画像が大きすぎます。" }, 400);
  }

  const id = crypto.randomUUID();
  const token = randomToken(32);
  const basePath = `${id}`;
  const originalPath = originalFile
    ? `${basePath}/original-${cleanFileName(originalFile.name).replace(/\.[^.]+$/, "")}.${extensionFor(originalFile)}`
    : null;
  const previewPath = previewFile ? `${basePath}/preview.jpg` : null;
  const uploaded: string[] = [];

  try {
    if (originalFile && originalPath) {
      await uploadFile(originalPath, originalFile);
      uploaded.push(originalPath);
    }
    if (previewFile && previewPath) {
      await uploadFile(previewPath, previewFile);
      uploaded.push(previewPath);
    }

    const expiresAt = new Date(Date.now() + RETENTION_DAYS * 86400000).toISOString();
    const { error } = await supabase.from("exhibition_orders").insert({
      id,
      public_token: token,
      order_no: String(order.orderNo),
      order_data: order,
      business_card_original_path: originalPath,
      business_card_preview_path: previewPath,
      expires_at: expiresAt,
    });
    if (error) throw new Error(`database insert failed: ${error.message}`);

    return json(req, {
      token,
      orderNo: String(order.orderNo),
      expiresAt,
      hasBusinessCard: Boolean(originalPath || previewPath),
    }, 201);
  } catch (error) {
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded).catch(() => undefined);
    console.error(error);
    return json(req, { error: error instanceof Error ? error.message : "create_failed" }, 500);
  }
}

async function signedUrl(path: string | null): Promise<string> {
  if (!path) return "";
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw new Error(`signed url failed: ${error.message}`);
  return data?.signedUrl ?? "";
}

async function getOrder(req: Request): Promise<Response> {
  if (!originAllowed(req)) return json(req, { error: "origin_not_allowed" }, 403);
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) return json(req, { error: "invalid_token" }, 400);

  const { data, error } = await supabase
    .from("exhibition_orders")
    .select("order_data, business_card_original_path, business_card_preview_path, expires_at")
    .eq("public_token", token)
    .maybeSingle();
  if (error) return json(req, { error: error.message }, 500);
  if (!data) return json(req, { error: "order_not_found" }, 404);
  if (new Date(data.expires_at).getTime() <= Date.now()) return json(req, { error: "order_expired" }, 410);

  try {
    const [businessCardOriginalUrl, businessCardPreviewUrl] = await Promise.all([
      signedUrl(data.business_card_original_path),
      signedUrl(data.business_card_preview_path),
    ]);
    return json(req, {
      order: data.order_data,
      expiresAt: data.expires_at,
      signedUrlExpiresIn: SIGNED_URL_SECONDS,
      businessCardOriginalUrl,
      businessCardPreviewUrl,
    });
  } catch (error) {
    console.error(error);
    return json(req, { error: error instanceof Error ? error.message : "read_failed" }, 500);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, { error: "server_not_configured" }, 500);
  if (req.method === "POST") return createOrder(req);
  if (req.method === "GET") return getOrder(req);
  return json(req, { error: "method_not_allowed" }, 405);
});
