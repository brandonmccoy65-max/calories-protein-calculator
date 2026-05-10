const OPEN_FOOD_FACTS_SEARCH =
  "https://world.openfoodfacts.org/cgi/search.pl";

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

async function searchNutrition(query) {
  const parsed = parseFoodInput(query);
  if (!parsed.food || parsed.food.length < 2) {
    return {
      status: 400,
      body: {
        error: "Please enter a food name, for example: 200g chicken breast."
      }
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
      status: 200,
      body: {
        query: parsed.raw,
        food: parsed.food,
        message:
          "I could not find calories or protein for that food in Open Food Facts."
      }
    };
  }

  const nutrition = pickNutrition(best);
  const grams = parsed.grams || 100;
  const multiplier = grams / 100;

  return {
    status: 200,
    body: {
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
    }
  };
}

export default async function handler(request, response) {
  try {
    const query = request.query?.q || "";
    const result = await searchNutrition(query);
    response.status(result.status).json(result.body);
  } catch (error) {
    response.status(500).json({
      error:
        "The server could not complete the nutrition lookup. Check your internet connection and try again.",
      details: error.message
    });
  }
}
