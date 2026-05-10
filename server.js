const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const OPEN_FOOD_FACTS_SEARCH =
  "https://world.openfoodfacts.org/cgi/search.pl";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function parseFoodInput(input) {
  const raw = String(input || "").trim();
  const amountMatch = raw.match(
    /(?:^|\s)(\d+(?:\.\d+)?)\s*(g|gram|grams|kg|kilogram|kilograms|oz|ounce|ounces)\b/i
  );

  let grams = null;
  let food = raw;

  if (amountMatch) {
    const value = Number(amountMatch[1]);
    const unit = amountMatch[2].toLowerCase();
    if (unit.startsWith("kg")) grams = value * 1000;
    else if (unit === "oz" || unit.startsWith("ounce")) grams = value * 28.3495;
    else grams = value;

    food = raw.replace(amountMatch[0], " ").replace(/\s+/g, " ").trim();
  }

  return {
    raw,
    food: food || raw,
    grams
  };
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pickNutrition(product) {
  const nutriments = product.nutriments || {};
  const caloriesPer100g =
    toNumber(nutriments["energy-kcal_100g"]) ||
    toNumber(nutriments["energy-kcal"]) ||
    (toNumber(nutriments.energy_100g) ? toNumber(nutriments.energy_100g) / 4.184 : null);
  const proteinPer100g =
    toNumber(nutriments.proteins_100g) || toNumber(nutriments.proteins);

  if (caloriesPer100g === null && proteinPer100g === null) {
    return null;
  }

  return {
    caloriesPer100g,
    proteinPer100g
  };
}

function scoreProduct(product) {
  const nutrition = pickNutrition(product);
  if (!nutrition) return -1;

  let score = 0;
  if (nutrition.caloriesPer100g !== null) score += 3;
  if (nutrition.proteinPer100g !== null) score += 3;
  if (product.product_name) score += 2;
  if (product.brands) score += 1;
  if (product.image_front_small_url) score += 1;
  return score;
}

async function searchNutrition(query) {
  const parsed = parseFoodInput(query);
  if (!parsed.food || parsed.food.length < 2) {
    return {
      error: "Please enter a food name, for example: 200g chicken breast."
    };
  }

  const url = new URL(OPEN_FOOD_FACTS_SEARCH);
  url.searchParams.set("search_terms", parsed.food);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "12");
  url.searchParams.set(
    "fields",
    "product_name,brands,nutriments,serving_size,quantity,url,image_front_small_url"
  );

  const response = await fetchWithRetry(url, {
    headers: {
      "User-Agent":
        "CaloriesProteinCalculator/1.0 (learning project; public Open Food Facts API)"
    }
  });

  if (!response.ok) {
    throw new Error(`Open Food Facts returned ${response.status}`);
  }

  const data = await response.json();
  const products = Array.isArray(data.products) ? data.products : [];
  const best = products
    .map((product) => ({ product, score: scoreProduct(product) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.product;

  if (!best) {
    return {
      query: parsed.raw,
      food: parsed.food,
      message:
        "I could not find calories or protein for that food in Open Food Facts."
    };
  }

  const nutrition = pickNutrition(best);
  const grams = parsed.grams || 100;
  const multiplier = grams / 100;

  return {
    query: parsed.raw,
    food: parsed.food,
    amountGrams: Number(grams.toFixed(1)),
    source: "Open Food Facts",
    matchedFood: best.product_name || parsed.food,
    brand: best.brands || "",
    servingSize: best.serving_size || "",
    quantity: best.quantity || "",
    image: best.image_front_small_url || "",
    sourceUrl: best.url || "https://world.openfoodfacts.org",
    per100g: {
      calories: nutrition.caloriesPer100g === null ? null : Math.round(nutrition.caloriesPer100g),
      protein: nutrition.proteinPer100g === null ? null : Number(nutrition.proteinPer100g.toFixed(1))
    },
    estimatedForAmount: {
      calories:
        nutrition.caloriesPer100g === null
          ? null
          : Math.round(nutrition.caloriesPer100g * multiplier),
      protein:
        nutrition.proteinPer100g === null
          ? null
          : Number((nutrition.proteinPer100g * multiplier).toFixed(1))
    }
  };
}

async function fetchWithRetry(url, options, attempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status < 500 || attempt === attempts) {
        return response;
      }
      lastError = new Error(`Open Food Facts returned ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 350));
  }

  throw lastError;
}

async function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const contentType = MIME_TYPES[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/nutrition") {
      const query = url.searchParams.get("q") || "";
      const result = await searchNutrition(query);
      sendJson(res, result.error ? 400 : 200, result);
      return;
    }

    await serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, {
      error:
        "The server could not complete the nutrition lookup. Check your internet connection and try again.",
      details: error.message
    });
  }
});

server.listen(PORT, () => {
  console.log(`Calories and protein calculator running at http://localhost:${PORT}`);
});
