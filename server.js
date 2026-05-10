const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const USDA_FOOD_SEARCH =
  "https://api.nal.usda.gov/fdc/v1/foods/search";
const USDA_API_KEY = process.env.USDA_API_KEY || "DEMO_KEY";

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

function findNutrient(food, ids, names) {
  const nutrients = Array.isArray(food.foodNutrients) ? food.foodNutrients : [];
  const match = nutrients.find((nutrient) => {
    const id = String(nutrient.nutrientId || nutrient.nutrientNumber || "");
    const name = String(nutrient.nutrientName || nutrient.name || "").toLowerCase();
    return ids.includes(id) || names.some((target) => name.includes(target));
  });

  return match ? toNumber(match.value || match.amount) : null;
}

function pickNutrition(food) {
  const caloriesPer100g = findNutrient(food, ["1008", "208"], ["energy"]);
  const proteinPer100g = findNutrient(food, ["1003", "203"], ["protein"]);

  if (caloriesPer100g === null && proteinPer100g === null) {
    return null;
  }

  return {
    caloriesPer100g,
    proteinPer100g
  };
}

function scoreFood(food) {
  const nutrition = pickNutrition(food);
  if (!nutrition) return -1;

  let score = 0;
  if (nutrition.caloriesPer100g !== null) score += 3;
  if (nutrition.proteinPer100g !== null) score += 3;
  if (food.description) score += 2;
  if (food.dataType === "Foundation") score += 3;
  if (food.dataType === "SR Legacy") score += 2;
  if (food.dataType === "Survey (FNDDS)") score += 2;
  if (food.brandName || food.brandOwner) score += 1;
  return score;
}

async function searchNutrition(query) {
  const parsed = parseFoodInput(query);
  if (!parsed.food || parsed.food.length < 2) {
    return {
      error: "Please enter a food name, for example: 200g chicken breast."
    };
  }

  const url = new URL(USDA_FOOD_SEARCH);
  url.searchParams.set("api_key", USDA_API_KEY);
  url.searchParams.set("query", parsed.food);
  url.searchParams.set("pageSize", "12");
  url.searchParams.set("sortBy", "dataType.keyword");
  url.searchParams.set("sortOrder", "asc");

  const response = await fetchWithRetry(url, {
    headers: {
      "User-Agent":
        "CaloriesProteinCalculator/1.0 (learning project; USDA FoodData Central API)"
    }
  });

  if (!response.ok) {
    throw new Error(`USDA FoodData Central returned ${response.status}`);
  }

  const data = await response.json();
  const foods = Array.isArray(data.foods) ? data.foods : [];
  const best = foods
    .map((food) => ({ food, score: scoreFood(food) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.food;

  if (!best) {
    return {
      query: parsed.raw,
      food: parsed.food,
      message:
        "I could not find calories or protein for that food in USDA FoodData Central."
    };
  }

  const nutrition = pickNutrition(best);
  const grams = parsed.grams || 100;
  const multiplier = grams / 100;

  return {
    query: parsed.raw,
    food: parsed.food,
    amountGrams: Number(grams.toFixed(1)),
    source: "USDA FoodData Central",
    matchedFood: best.description || parsed.food,
    brand: best.brandName || best.brandOwner || "",
    servingSize: best.servingSize
      ? `${best.servingSize}${best.servingSizeUnit || "g"}`
      : "",
    quantity: best.packageWeight || "",
    image: "",
    sourceUrl: best.fdcId
      ? `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${best.fdcId}/nutrients`
      : "https://fdc.nal.usda.gov",
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
      lastError = new Error(`USDA FoodData Central returned ${response.status}`);
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
