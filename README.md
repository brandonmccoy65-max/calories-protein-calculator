# Calories and Protein Calculator

A modern web app that provides instant, accurate nutrition data using the Nutritionix API. Features a Google-like search experience with real-time autocomplete suggestions.

## Features

- **Smart Search Engine**: Real-time autocomplete suggestions as you type
- **Intelligent Food Parsing**: Enter foods like `200g chicken breast`, `1kg apples`, or `8oz milk`
- **Accurate Data Source**: Uses Nutritionix API for comprehensive nutrition information
- **Modern UI/UX**: Beautiful gradient design with smooth animations
- **Keyboard Navigation**: Full arrow key support for suggestions
- **Responsive Design**: Works perfectly on desktop and mobile devices
- **Free to Deploy**: Deploy on Render, Vercel, or run locally

## Run Locally

### Prerequisites

- Node.js 18.0.0 or higher
- Nutritionix API credentials (free at https://www.nutritionix.com/business/api)

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and add your Nutritionix API credentials:

```
NUTRITIONIX_APP_ID=your_app_id_here
NUTRITIONIX_API_KEY=your_api_key_here
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
- `1 cup almonds`
- `2 bananas`

The app will show autocomplete suggestions as you type. Click on a suggestion or press Enter to get detailed nutrition information including calories and protein per 100g plus an estimate for the amount you entered.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `HOST` | Server host | `0.0.0.0` |
| `NUTRITIONIX_APP_ID` | Nutritionix App ID | Required |
| `NUTRITIONIX_API_KEY` | Nutritionix API Key | Required |

## Deploy On Render

1. Put this project on GitHub.
2. In Render, create a new Web Service from that GitHub repository.
3. Use this start command:

```text
node server.js
```

4. Set the `NUTRITIONIX_APP_ID` and `NUTRITIONIX_API_KEY` environment variables in Render's dashboard.

Render will use the `PORT` environment variable automatically.

## Deploy On Vercel

1. Import this GitHub repository in Vercel.
2. Choose the free Hobby plan.
3. Keep the default project settings.
4. Add `NUTRITIONIX_APP_ID` and `NUTRITIONIX_API_KEY` as environment variables.
5. Deploy.

The Vercel deployment uses `api/nutrition.js` as a serverless function and serves the files in `public/`.

## API Endpoints

### Get Nutrition Information

```text
GET /api/nutrition?q=200g%20chicken%20breast
```

Example response:

```json
{
  "query": "200g chicken breast",
  "food": "chicken breast",
  "amountGrams": 200,
  "source": "Nutritionix",
  "matchedFood": "Chicken Breast",
  "brand": "",
  "servingSize": "1 breast",
  "per100g": {
    "calories": 165,
    "protein": 31.0
  },
  "estimatedForAmount": {
    "calories": 330,
    "protein": 62.0
  }
}
```

### Get Suggestions (Autocomplete)

```text
GET /api/suggestions?q=chick
```

Example response:

```json
{
  "suggestions": [
    {
      "description": "Chicken Breast",
      "dataType": "Common",
      "brand": ""
    },
    {
      "description": "Chicken Thigh",
      "dataType": "Common",
      "brand": ""
    }
  ]
}
```

## Getting Nutritionix API Keys

1. Visit https://www.nutritionix.com/business/api
2. Sign up for a free account
3. Navigate to your API keys section
4. Copy your App ID and API Key
5. Add them to your `.env` file or hosting environment

The free tier includes:
- Up to 50,000 API calls per month
- Access to comprehensive nutrition database
- Branded and common food items

## License

MIT
