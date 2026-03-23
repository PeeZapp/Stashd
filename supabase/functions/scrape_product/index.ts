import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ScrapedProduct {
  title: string;
  price: number;
  originalPrice: number | null;
  image: string;
  storeName: string;
  sku: string | null;
  description: string;
}

async function scrapeProduct(url: string): Promise<ScrapedProduct> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.statusText}`);
  }

  const html = await response.text();

  // Extract using open graph and schema.org metadata (most reliable)
  const title = extractTitle(html);
  const price = extractPrice(html);
  const image = extractImage(html);
  const storeName = extractStoreName(url);
  const sku = extractSKU(html);
  const description = extractDescription(html);

  return {
    title,
    price,
    originalPrice: null,
    image,
    storeName,
    sku,
    description,
  };
}

function extractTitle(html: string): string {
  // Try og:title first
  let match = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  if (match) return match[1].trim();

  // Try schema.org Product name
  match = html.match(/"name"\s*:\s*"([^"]+)"/i);
  if (match) return match[1].trim();

  // Try title tag
  match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (match) return match[1].trim();

  return "Product";
}

function extractPrice(html: string): number {
  // Try og:price
  let match = html.match(/<meta\s+property="og:price:amount"\s+content="([^"]+)"/i);
  if (match) return parseFloat(match[1]);

  // Try schema.org price
  match = html.match(/"price"\s*:\s*"?([0-9.]+)"?/i);
  if (match) return parseFloat(match[1]);

  // Try common patterns
  match = html.match(/\$\s*([0-9]+\.?[0-9]*)/);
  if (match) return parseFloat(match[1]);

  return 0;
}

function extractImage(html: string): string {
  // Try og:image first
  let match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  if (match) return match[1].trim();

  // Try schema.org image
  match = html.match(/"image"\s*:\s*"([^"]+)"/i);
  if (match) return match[1].trim();

  // Try product image patterns
  match = html.match(/(?:product[_-]?image|main[_-]?image|featured[_-]?image).*?(?:src|href)="([^"]+)"/i);
  if (match) return match[1].trim();

  // Try any img src
  match = html.match(/<img[^>]*src="([^"]+)"[^>]*>/i);
  if (match) return match[1].trim();

  return "";
}

function extractStoreName(url: string): string {
  try {
    const urlObj = new URL(url);
    let hostname = urlObj.hostname.replace("www.", "");

    // Format domain nicely
    const parts = hostname.split(".");
    if (parts.length > 1) {
      hostname = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }

    return hostname;
  } catch {
    return "Unknown Store";
  }
}

function extractSKU(html: string): string | null {
  // Try schema.org sku
  let match = html.match(/"sku"\s*:\s*"([^"]+)"/i);
  if (match) return match[1].trim();

  // Try common patterns
  match = html.match(/(?:sku|product[_-]?id|item[_-]?number)["\']?\s*[:=]\s*["\']?([A-Z0-9\-]+)/i);
  if (match) return match[1].trim();

  return null;
}

function extractDescription(html: string): string {
  // Try og:description
  let match = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
  if (match) return match[1].trim();

  // Try meta description
  match = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  if (match) return match[1].trim();

  // Try schema.org description
  match = html.match(/"description"\s*:\s*"([^"]+)"/i);
  if (match) return match[1].trim();

  return "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid URL" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const product = await scrapeProduct(url);

    return new Response(
      JSON.stringify({
        success: true,
        data: product,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Scraping error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to scrape product",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
