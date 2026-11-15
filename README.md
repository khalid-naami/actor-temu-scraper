# ⚡ Temu Scraper (Trending Products, Sales Count & Flash Deals)

Extract live Temu products, viral trending items, sales volume counts, lightning flash deals, discounted prices, customer ratings, and merchant details at scale.

> **Apify Store Short Description (292 chars):**  
> `Scrape Temu products, viral trending items, sales volume counts, lightning flash deals, discounted prices, customer reviews, and ratings at scale. Supports sorting by top sales to scout winning dropshipping products with residential proxy rotation for e-commerce trend research and arbitrage.`

---

## 🌟 Key Features

- 🚀 **Winning Products Discovery**: Sort by `top_sales` to instantly surface breakout consumer items with high viral demand.
- 📊 **Exact Sales Volume**: Captures verified sold badges (e.g. "100k+ sold", "15k+ sold") as formatted text and numeric counts.
- ⚡ **Lightning Deals & Flash Discounts**: Flags active lightning promotions and calculates true discount percentages (e.g. -78%).
- ⭐ **Customer Reviews & Ratings**: Extracts average star ratings (0.0 to 5.0) and total review volume.
- 🏪 **Merchant & Mall Intelligence**: Extracts merchant store names and seller profiles.
- 🖼️ **High-Resolution Galleries**: Captures clean product thumbnails and gallery image arrays.
- 🛡️ **Anti-Bot & CAPTCHA Bypass**: Emulates genuine browser traffic paired with Apify Residential Proxies to bypass anti-scraping screens.

---

## 📥 Input Configuration

| Field | Type | Default | Description |
|---|---|---|---|
| `productUrls` | Array | `["https://www.temu.com/goods-detail-..."]` | List of direct Temu goods URLs. |
| `searchKeywords` | Array | `[]` | Keywords to search on Temu (e.g. `'ergonomic mouse'`). |
| `sortBy` | String | `"top_sales"` | Sort order: `top_sales` (winning products), `default`, `price_low`, `price_high`, `rating`. |
| `maxProducts` | Integer | `40` | Maximum product records to extract per keyword. |
| `proxyConfiguration` | Object | `{ "useApifyProxy": true }` | Apify Proxy settings to bypass IP rate limits. |

---

## 📤 Output Data Format

```json
{
  "goodsId": "601099512345678",
  "title": "RGB Wireless Gaming Mouse with Ergonomic Grip and Rechargeable Battery",
  "price": 6.49,
  "originalPrice": 28.99,
  "discount": "-78%",
  "currency": "USD",
  "salesCount": "100k+ sold",
  "salesCountNumber": 100000,
  "rating": 4.7,
  "reviewsCount": 8420,
  "isLightningDeal": true,
  "stockStatus": "In stock",
  "storeName": "TechVibe Global Mall",
  "thumbnail": "https://img.kwcdn.com/product/open/2024-01-15/123456789.jpg",
  "images": [
    "https://img.kwcdn.com/product/open/2024-01-15/123456789.jpg",
    "https://img.kwcdn.com/product/open/2024-01-15/987654321.jpg"
  ],
  "url": "https://www.temu.com/goods-detail-g-601099512345678.html",
  "scrapedAt": "2026-11-10T13:25:00.000Z"
}
```

---

## 💡 Practical Commercial Use Cases

1. **Viral Product Hunting**: Discover explosive high-volume products selling 100k+ units to list on TikTok Shop and Shopify.
2. **Wholesale Margin Arbitrage**: Compare ultra-cheap Temu prices against Amazon BuyBox prices for reselling.
3. **Consumer Trend Forecasting**: Identify newly surging product niches across home, tech gadgets, and beauty.
4. **Competitor Pricing Intelligence**: Benchmark manufacturing prices against Asian factory-direct consumer pricing.

---

## ⚖️ License
Apache-2.0
