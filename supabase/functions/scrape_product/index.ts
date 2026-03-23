import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ExtractedProduct {
  title: string | null;
  current_price: number | null;
  original_price: number | null;
  is_on_sale: boolean;
  image_url: string | null;
  source_url: string;
  store_name: string | null;
  description: string | null;
}

function parseJsonLd(html: string): ExtractedProduct | null {
  const scriptPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptPattern.exec(html)) !== null) {
    try {
      const raw = match[1].trim();
      const data = JSON.parse(raw);

      const items: unknown[] = Array.isArray(data)
        ? data
        : data["@graph"]
        ? data["@graph"]
        : [data];

      for (const item of items) {
        if (
          typeof item !== "object" ||
          item === null ||
          (item as Record<string, unknown>)["@type"] !== "Product"
        ) {
          continue;
        }

        const product = item as Record<string, unknown>;

        const title =
          typeof product["name"] === "string" ? product["name"] : null;

        const imageRaw = product["image"];
        let image_url: string | null = null;
        if (typeof imageRaw === "string") {
          image_url = imageRaw;
        } else if (
          Array.isArray(imageRaw) &&
          typeof imageRaw[0] === "string"
        ) {
          image_url = imageRaw[0];
        } else if (
          typeof imageRaw === "object" &&
          imageRaw !== null &&
          typeof (imageRaw as Record<string, unknown>)["url"] === "string"
        ) {
          image_url = (imageRaw as Record<string, unknown>)["url"] as string;
        }

        const description =
          typeof product["description"] === "string"
            ? product["description"]
            : null;

        let current_price: number | null = null;
        let original_price: number | null = null;

        const offersRaw = product["offers"];
        if (offersRaw) {
          const offers = Array.isArray(offersRaw) ? offersRaw[0] : offersRaw;
          if (typeof offers === "object" && offers !== null) {
            const o = offers as Record<string, unknown>;
            const priceVal = o["price"];
            if (priceVal !== undefined && priceVal !== null) {
              const parsed = parseFloat(String(priceVal));
              if (!isNaN(parsed)) current_price = parsed;
            }
            const highPriceVal = o["highPrice"];
            if (highPriceVal !== undefined && highPriceVal !== null) {
              const parsed = parseFloat(String(highPriceVal));
              if (!isNaN(parsed) && (current_price === null || parsed > current_price)) {
                original_price = parsed;
              }
            }
          }
        }

        const is_on_sale =
          current_price !== null &&
          original_price !== null &&
          original_price > current_price;

        if (title) {
          return {
            title,
            current_price,
            original_price,
            is_on_sale,
            image_url,
            source_url: "",
            store_name: null,
            description,
          };
        }
      }
    } catch {
      // malformed JSON-LD — continue to next script block
    }
  }

  return null;
}

function extractOgMeta(
  html: string,
  property: string
): string | null {
  const pattern = new RegExp(
    `<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  let match = pattern.exec(html);
  if (match) return match[1].trim();

  const pattern2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${property}["']`,
    "i"
  );
  match = pattern2.exec(html);
  if (match) return match[1].trim();

  return null;
}

function extractMetaName(html: string, name: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  let match = pattern.exec(html);
  if (match) return match[1].trim();

  const pattern2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`,
    "i"
  );
  match = pattern2.exec(html);
  if (match) return match[1].trim();

  return null;
}

function extractFromOpenGraph(html: string): Partial<ExtractedProduct> {
  const title = extractOgMeta(html, "title");
  const image_url = extractOgMeta(html, "image");
  const store_name = extractOgMeta(html, "site_name");
  const description =
    extractOgMeta(html, "description") ||
    extractMetaName(html, "description");

  const priceAmountRaw = extractOgMeta(html, "price:amount");
  let current_price: number | null = null;
  if (priceAmountRaw) {
    const parsed = parseFloat(priceAmountRaw.replace(/[^0-9.]/g, ""));
    if (!isNaN(parsed)) current_price = parsed;
  }

  return { title, image_url, store_name, description, current_price };
}

function extractFallback(html: string): Partial<ExtractedProduct> {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;

  const imgMatch = html.match(
    /<img[^>]+(?:src|data-src)=["']([^"']+\.(?:jpg|jpeg|png|webp|gif)[^"']*)["'][^>]*>/i
  );
  const image_url = imgMatch ? imgMatch[1].trim() : null;

  return { title, image_url };
}

function storeNameFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const parts = hostname.split(".");
    const name = parts[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return null;
  }
}

async function extractProductMetadata(url: string): Promise<ExtractedProduct> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  // Priority 1: JSON-LD structured data
  const jsonLdData = parseJsonLd(html);

  // Priority 2: Open Graph
  const ogData = extractFromOpenGraph(html);

  // Priority 3: Fallback HTML
  const fallback = extractFallback(html);

  // Merge with priority order
  const title = jsonLdData?.title ?? ogData.title ?? fallback.title ?? null;
  const image_url =
    jsonLdData?.image_url ?? ogData.image_url ?? fallback.image_url ?? null;
  const description =
    jsonLdData?.description ?? ogData.description ?? null;
  const store_name =
    ogData.store_name ?? storeNameFromUrl(url);

  const current_price =
    jsonLdData?.current_price ?? ogData.current_price ?? null;
  const original_price = jsonLdData?.original_price ?? null;
  const is_on_sale =
    current_price !== null &&
    original_price !== null &&
    original_price > current_price;

  return {
    title,
    current_price,
    original_price,
    is_on_sale,
    image_url,
    source_url: url,
    store_name,
    description,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    try {
      new URL(url);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const product = await extractProductMetadata(url);

    return new Response(
      JSON.stringify({ success: true, data: product }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Extraction error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to extract product data",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
