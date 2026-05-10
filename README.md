# Calories and Protein Online Server

A small web app that uses internet access to look up food nutrition data and estimate calories and protein.

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

The backend calls the public Open Food Facts API, chooses a nutrition match, and returns calories/protein per 100g plus an estimate for the amount you entered.

## Deploy On Render

1. Put this project on GitHub.
2. In Render, create a new Blueprint or Web Service from that GitHub repository.
3. Use this start command if asked:

```text
node server.js
```

Render will use the `PORT` environment variable automatically.

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
