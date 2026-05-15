const NUTRITIONIX_SEARCH = "https://trackapi.nutritionix.com/v2/search/instant";
const NUTRITIONIX_NATURAL = "https://trackapi.nutritionix.com/v2/natural/nutrients";
const NUTRITIONIX_APP_ID = process.env.NUTRITIONIX_APP_ID || "";
const NUTRITIONIX_API_KEY = process.env.NUTRITIONIX_API_KEY || "";

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

async function fetchWithRetry(url, options, attempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status < 500 || attempt === attempts) {
        return response;
      }
      lastError = new Error(`Nutritionix returned ${response.status}`);
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

  // Use Nutritionix Natural API for accurate nutrition data
  const response = await fetchWithRetry(NUTRITIONIX_NATURAL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-app-id": NUTRITIONIX_APP_ID,
      "x-app-key": NUTRITIONIX_API_KEY
    },
    body: JSON.stringify({ query: parsed.raw })
  });

  if (!response.ok) {
    throw new Error(`Nutritionix returned ${response.status}`);
  }

  const data = await response.json();
  const foods = Array.isArray(data.foods) ? data.foods : [];
  
  if (foods.length === 0) {
    return {
      status: 200,
      body: {
        query: parsed.raw,
        food: parsed.food,
        message: "I could not find calories or protein for that food."
      }
    };
  }

  // Use the first food result (most relevant)
  const food = foods[0];
  const grams = parsed.grams || food.serving_qty * (food.serving_unit === "g" ? 1 : 
                 food.serving_unit === "oz" ? 28.3495 : 
                 food.serving_unit === "kg" ? 1000 : 100) || 100;
  
  // Calculate based on serving size if available
  let multiplier = 1;
  if (food.serving_qty && food.serving_weight_grams) {
    multiplier = grams / food.serving_weight_grams;
  }

  return {
    status: 200,
    body: {
      query: parsed.raw,
      food: food.food_name || parsed.food,
      amountGrams: Number(grams.toFixed(1)),
      matchedFood: food.food_name || parsed.food,
      brand: food.brand_name || "",
      servingSize: food.serving_qty && food.serving_unit 
        ? `${food.serving_qty} ${food.serving_unit}` 
        : "",
      image: food.photo?.thumb || "",
      per100g: {
        calories: food.nf_calories ? Math.round(food.nf_calories) : null,
        protein: food.nf_protein ? Number(food.nf_protein.toFixed(1)) : null
      },
      estimatedForAmount: {
        calories: food.nf_calories ? Math.round(food.nf_calories * multiplier) : null,
        protein: food.nf_protein ? Number((food.nf_protein * multiplier).toFixed(1)) : null
      }
    }
  };
}

async function fetchSuggestions(query) {
  if (!query || query.length < 2) {
    return { suggestions: [] };
  }

  const url = new URL(NUTRITIONIX_SEARCH);
  url.searchParams.set("query", query);

  const response = await fetchWithRetry(url, {
    method: "GET",
    headers: {
      "x-app-id": NUTRITIONIX_APP_ID,
      "x-app-key": NUTRITIONIX_API_KEY
    }
  });

  if (!response.ok) {
    return { suggestions: [] };
  }

  const data = await response.json();
  const common = Array.isArray(data.common) ? data.common : [];
  const branded = Array.isArray(data.branded) ? data.branded : [];
  
  const suggestions = [...common, ...branded]
    .slice(0, 8)
    .map((item) => ({
      description: item.food_name || item.tag_name || "",
      dataType: item.brand_name ? "Branded" : "Common",
      brand: item.brand_name || ""
    }))
    .filter((item) => item.description);

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
