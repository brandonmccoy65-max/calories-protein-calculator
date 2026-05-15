# Calories and Protein Online Server

A small web app that uses internet access to look up USDA nutrition data and estimate calories and protein.

## Features

- **Smart food parsing**: Enter foods like `200g chicken breast`, `1kg apples`, or `8oz milk`
- **USDA data source**: Uses the official USDA FoodData Central API
- **Responsive design**: Works on desktop and mobile devices
- **Free to deploy**: Deploy on Render, Vercel, or run locally

## Run Locally

### Prerequisites

- Node.js 18.0.0 or higher

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

This runs the server with auto-reload on file changes.

### Production

```bash
npm start
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

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `HOST` | Server host | `0.0.0.0` |
| `USDA_API_KEY` | USDA API key | `DEMO_KEY` |

## Deploy On Render

1. Put this project on GitHub.
2. In Render, create a new Blueprint or Web Service from that GitHub repository.
3. Use this start command if asked:

```text
node server.js
```

Render will use the `PORT` environment variable automatically.

Set the `USDA_API_KEY` environment variable in Render's dashboard for production use.

## Deploy On Vercel

If Render asks for a paid plan, deploy on Vercel instead:

1. Import this GitHub repository in Vercel.
2. Choose the free Hobby plan.
3. Keep the default project settings.
4. Add `USDA_API_KEY` as an environment variable.
5. Deploy.

The Vercel deployment uses `api/nutrition.js` as a serverless function and serves the files in `public/`.

## API

```text
GET /api/nutrition?q=200g%20chicken%20breast
```

Example response fields:

- `matchedFood` - The matched food name from USDA
- `amountGrams` - The amount in grams
- `per100g.calories` - Calories per 100g
- `per100g.protein` - Protein per 100g (in grams)
- `estimatedForAmount.calories` - Estimated calories for the entered amount
- `estimatedForAmount.protein` - Estimated protein for the entered amount
- `sourceUrl` - Link to the USDA food details page

## License

MIT
