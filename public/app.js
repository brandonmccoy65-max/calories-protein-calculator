const form = document.querySelector("#food-form");
const input = document.querySelector("#food-input");
const result = document.querySelector("#result");
const suggestionsContainer = document.querySelector("#suggestions");
const searchBtn = document.querySelector("#search-btn");

let debounceTimer = null;
let highlightedIndex = -1;
let currentSuggestions = [];

function formatValue(value, unit) {
  return value === null || value === undefined ? "Unknown" : `${value}${unit}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showLoading() {
  result.setAttribute("aria-busy", "true");
  result.innerHTML = `
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Analyzing nutrition data from USDA...</p>
    </div>
  `;
}

function hideSuggestions() {
  suggestionsContainer.classList.remove("active");
  suggestionsContainer.hidden = true;
  highlightedIndex = -1;
  currentSuggestions = [];
}

function showSuggestions(suggestions) {
  currentSuggestions = suggestions;
  
  if (suggestions.length === 0) {
    hideSuggestions();
    return;
  }

  suggestionsContainer.innerHTML = suggestions.map((item, index) => `
    <div class="suggestion-item" role="option" data-index="${index}" data-food="${escapeHtml(item.description)}">
      <svg class="suggestion-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5"/>
      </svg>
      <span class="suggestion-text">${highlightMatch(escapeHtml(item.description), input.value.trim())}</span>
      <span class="suggestion-meta">${escapeHtml(item.dataType || "USDA")}</span>
    </div>
  `).join("");

  suggestionsContainer.hidden = false;
  suggestionsContainer.classList.add("active");
}

function highlightMatch(text, query) {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${escapeHtml(query.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi");
  return text.replace(regex, "<strong>$1</strong>");
}

function selectSuggestion(foodName) {
  input.value = foodName;
  hideSuggestions();
  performSearch(foodName);
}

function renderResult(data) {
  result.setAttribute("aria-busy", "false");
  
  if (data.message) {
    result.innerHTML = `
      <div class="error">
        <svg class="icon-small" style="display:inline;vertical-align:middle;margin-right:8px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
        </svg>
        ${escapeHtml(data.message)}
      </div>
    `;
    return;
  }

  if (data.error) {
    result.innerHTML = `
      <div class="error">
        <svg class="icon-small" style="display:inline;vertical-align:middle;margin-right:8px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
        </svg>
        ${escapeHtml(data.error)}
      </div>
    `;
    return;
  }

  const image = data.image
    ? `<img src="${escapeHtml(data.image)}" alt="">`
    : `<div class="image-placeholder">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:32px;height:32px">
           <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
         </svg>
       </div>`;
  const brand = data.brand ? `${escapeHtml(data.brand)} · ` : "";
  const serving = data.servingSize ? ` · Serving: ${escapeHtml(data.servingSize)}` : "";

  result.innerHTML = `
    <div class="food-result">
      <div class="matched">
        ${image}
        <div>
          <h2>${escapeHtml(data.matchedFood)}</h2>
          <p>${brand}${escapeHtml(data.amountGrams)}g${serving}</p>
        </div>
      </div>

      <div class="stats">
        <div class="stat">
          <span>🔥 Calories</span>
          <strong>${formatValue(data.estimatedForAmount.calories, "")}</strong>
        </div>
        <div class="stat">
          <span>💪 Protein</span>
          <strong>${formatValue(data.estimatedForAmount.protein, "g")}</strong>
        </div>
      </div>

      <p class="details">
        <strong>Per 100g:</strong> ${formatValue(data.per100g.calories, "")} calories and
        ${formatValue(data.per100g.protein, "g")} protein.
        <br>
        <strong>Source:</strong>
        <a href="${escapeHtml(data.sourceUrl)}" target="_blank" rel="noreferrer">
          ${escapeHtml(data.source)} →
        </a>
      </p>
    </div>
  `;
}

async function fetchSuggestions(query) {
  if (!query || query.length < 2) {
    hideSuggestions();
    return;
  }

  try {
    const response = await fetch(`/api/suggestions?q=${encodeURIComponent(query)}`);
    if (!response.ok) return;
    
    const data = await response.json();
    if (data.suggestions && data.suggestions.length > 0) {
      showSuggestions(data.suggestions.slice(0, 8));
    } else {
      hideSuggestions();
    }
  } catch (error) {
    console.error("Failed to fetch suggestions:", error);
  }
}

async function performSearch(food) {
  if (!food || !food.trim()) return;

  hideSuggestions();
  showLoading();

  const button = form.querySelector("button");
  button.disabled = true;
  searchBtn.querySelector(".btn-text").textContent = "Analyzing...";

  try {
    const response = await fetch(`/api/nutrition?q=${encodeURIComponent(food)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Nutrition lookup failed.");
    }

    renderResult(data);
  } catch (error) {
    result.setAttribute("aria-busy", "false");
    result.innerHTML = `
      <div class="error">
        <svg class="icon-small" style="display:inline;vertical-align:middle;margin-right:8px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
        </svg>
        ${escapeHtml(error.message)}
      </div>
    `;
  } finally {
    button.disabled = false;
    searchBtn.querySelector(".btn-text").textContent = "Calculate";
  }
}

// Form submission
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const food = input.value.trim();
  if (!food) return;
  performSearch(food);
});

// Input handling with debounced suggestions
input.addEventListener("input", () => {
  const query = input.value.trim();
  
  clearTimeout(debounceTimer);
  
  if (query.length < 2) {
    hideSuggestions();
    return;
  }

  debounceTimer = setTimeout(() => {
    fetchSuggestions(query);
  }, 250);
});

// Keyboard navigation for suggestions
input.addEventListener("keydown", (event) => {
  if (!suggestionsContainer.classList.contains("active")) return;

  const items = suggestionsContainer.querySelectorAll(".suggestion-item");
  
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, items.length - 1);
      items.forEach((item, i) => {
        item.classList.toggle("highlighted", i === highlightedIndex);
      });
      if (highlightedIndex >= 0) {
        items[highlightedIndex].scrollIntoView({ block: "nearest" });
      }
      break;

    case "ArrowUp":
      event.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      items.forEach((item, i) => {
        item.classList.toggle("highlighted", i === highlightedIndex);
      });
      if (highlightedIndex >= 0) {
        items[highlightedIndex].scrollIntoView({ block: "nearest" });
      }
      break;

    case "Enter":
      if (highlightedIndex >= 0 && items[highlightedIndex]) {
        event.preventDefault();
        const foodName = items[highlightedIndex].dataset.food;
        selectSuggestion(foodName);
      }
      break;

    case "Escape":
      hideSuggestions();
      break;
  }
});

// Click on suggestion
suggestionsContainer.addEventListener("click", (event) => {
  const item = event.target.closest(".suggestion-item");
  if (item) {
    const foodName = item.dataset.food;
    selectSuggestion(foodName);
  }
});

// Close suggestions when clicking outside
document.addEventListener("click", (event) => {
  if (!form.contains(event.target)) {
    hideSuggestions();
  }
});

// Focus handling
input.addEventListener("focus", () => {
  const query = input.value.trim();
  if (query.length >= 2 && currentSuggestions.length > 0) {
    suggestionsContainer.classList.add("active");
    suggestionsContainer.hidden = false;
  }
});

// Blur handling with delay to allow clicking suggestions
input.addEventListener("blur", () => {
  setTimeout(() => {
    if (!suggestionsContainer.matches(":hover")) {
      hideSuggestions();
    }
  }, 150);
});

suggestionsContainer.addEventListener("mouseenter", () => {
  highlightedIndex = -1;
  suggestionsContainer.querySelectorAll(".suggestion-item").forEach(item => {
    item.classList.remove("highlighted");
  });
});
