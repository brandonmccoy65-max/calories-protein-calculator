const form = document.querySelector("#food-form");
const input = document.querySelector("#food-input");
const result = document.querySelector("#result");

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

function renderResult(data) {
  if (data.message) {
    result.innerHTML = `<p class="error">${escapeHtml(data.message)}</p>`;
    return;
  }

  const image = data.image
    ? `<img src="${escapeHtml(data.image)}" alt="">`
    : `<div class="image-placeholder">Food</div>`;
  const brand = data.brand ? `${escapeHtml(data.brand)} · ` : "";
  const serving = data.servingSize ? ` · Serving: ${escapeHtml(data.servingSize)}` : "";

  result.innerHTML = `
    <div class="food-result">
      <div class="matched">
        ${image}
        <div>
          <h2>${escapeHtml(data.matchedFood)}</h2>
          <p>${brand}${escapeHtml(data.amountGrams)}g estimate${serving}</p>
        </div>
      </div>

      <div class="stats">
        <div class="stat">
          <span>Calories for amount</span>
          <strong>${formatValue(data.estimatedForAmount.calories, " kcal")}</strong>
        </div>
        <div class="stat">
          <span>Protein for amount</span>
          <strong>${formatValue(data.estimatedForAmount.protein, "g")}</strong>
        </div>
      </div>

      <p class="details">
        Per 100g: ${formatValue(data.per100g.calories, " kcal")} and
        ${formatValue(data.per100g.protein, "g")} protein.
        Data source:
        <a href="${escapeHtml(data.sourceUrl)}" target="_blank" rel="noreferrer">
          ${escapeHtml(data.source)}
        </a>
      </p>
    </div>
  `;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const food = input.value.trim();
  if (!food) return;

  const button = form.querySelector("button");
  button.disabled = true;
  button.textContent = "Checking...";
  result.innerHTML = `<div class="empty-state">Looking up nutrition data online...</div>`;

  try {
    const response = await fetch(`/api/nutrition?q=${encodeURIComponent(food)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Nutrition lookup failed.");
    }

    renderResult(data);
  } catch (error) {
    result.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = "Calculate";
  }
});
