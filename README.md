# Calories and Protein Online Server

A small web app that uses internet access to look up USDA nutrition data and estimate calories and protein.

## Run

```powershell
node server.js
```

Then open:

```text
http://127.0.0.1:3000
```

## Use

Enter a food name with an optional amount:

- `200g chicken breast`
- `150g rice`
- `8oz milk`
- `1kg apples`

The backend calls the USDA FoodData Central API, chooses a nutrition match, and returns calories/protein per 100g plus an estimate for the amount you entered.

By default it uses USDA's `DEMO_KEY`, which is fine for light testing. For heavier public use, create a free USDA FoodData Central API key and set it as `USDA_API_KEY` in your hosting environment.

## Deploy On Render

1. Put this project on GitHub.
2. In Render, create a new Blueprint or Web Service from that GitHub repository.
3. Use this start command if asked:

```text
node server.js
```

Render will use the `PORT` environment variable automatically.

## Deploy On Vercel

If Render asks for a paid plan, deploy on Vercel instead:

1. Import this GitHub repository in Vercel.
2. Choose the free Hobby plan.
3. Keep the default project settings.
4. Deploy.

The Vercel deployment uses `api/nutrition.js` as a serverless function and serves the files in `public/`.

## API

```text
GET /api/nutrition?q=200g%20chicken%20breast
```

Example response fields:

- `matchedFood`
- `amountGrams`
- `per100g.calories`
- `per100g.protein`
- `estimatedForAmount.calories`
- `estimatedForAmount.protein`
- `sourceUrl`
