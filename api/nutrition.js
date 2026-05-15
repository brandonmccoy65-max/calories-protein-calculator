const USDA_FOOD_SEARCH =
  "https://api.nal.usda.gov/fdc/v1/foods/search";
const USDA_API_KEY = process.env.USDA_API_KEY || "DEMO_KEY";

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
      status: 200,
      body: {
        query: parsed.raw,
        food: parsed.food,
        message:
          "I could not find calories or protein for that food in USDA FoodData Central."
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
    }
  };
}

async function fetchSuggestions(query) {
  if (!query || query.length < 2) {
    return { suggestions: [] };
  }

  const url = new URL(USDA_FOOD_SEARCH);
  url.searchParams.set("api_key", USDA_API_KEY);
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "8");
  url.searchParams.set("sortBy", "dataType.keyword");
  url.searchParams.set("sortOrder", "asc");

  const response = await fetchWithRetry(url, {
    headers: {
      "User-Agent":
        "CaloriesProteinCalculator/1.0 (learning project; USDA FoodData Central API)"
    }
  });

  if (!response.ok) {
    return { suggestions: [] };
  }

  const data = await response.json();
  const foods = Array.isArray(data.foods) ? data.foods : [];
  
  const suggestions = foods
    .filter((food) => food.description && food.dataType)
    .map((food) => ({
      description: food.description,
      dataType: food.dataType,
      fdcId: food.fdcId
    }));

  return { suggestions };
}

export default async function handler(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    
    if (url.pathname === "/api/suggestions") {
      const query = url.searchParams.get("q") || "";
      const result = await fetchSuggestions(query);
      response.status(200).json(result);
      return;
    }

    if (url.pathname === "/api/nutrition") {
      const query = url.searchParams.get("q") || "";
      const result = await searchNutrition(query);
      response.status(result.status).json(result.body);
      return;
    }

    response.status(404).json({ error: "Not found" });
  } catch (error) {
    response.status(500).json({
      error:
        "The server could not complete the nutrition lookup. Check your internet connection and try again.",
      details: error.message
    });
  }
}
