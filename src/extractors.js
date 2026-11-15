/**
 * Temu Product & Search Extraction Handlers
 */

/**
 * Extract Temu Goods ID from URL
 */
export function extractTemuGoodsId(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.match(/goods_id=(\d{10,})/i) ||
                  url.match(/-g-(\d{10,})\.html/i) ||
                  url.match(/goods-(\d{10,})\.html/i);
    return match ? match[1] : null;
}

/**
 * Clean numeric price
 */
export function parseTemuPrice(raw) {
    if (typeof raw === 'number') return raw;
    if (!raw || typeof raw !== 'string') return null;
    const cleaned = raw.replace(/[^0-9.,]/g, '').trim();
    if (!cleaned) return null;
    if (cleaned.includes(',') && !cleaned.includes('.')) {
        return parseFloat(cleaned.replace(',', '.'));
    }
    return parseFloat(cleaned.replace(/,/g, ''));
}

/**
 * Clean sales volume number (e.g. "100k+ sold" -> 100000, "15.2k+ sold" -> 15200)
 */
export function parseTemuSalesCount(raw) {
    if (typeof raw === 'number') return raw;
    if (!raw || typeof raw !== 'string') return 0;
    const lower = raw.toLowerCase().replace(/,/g, '').trim();
    const kMatch = lower.match(/([0-9.]+)\s*k/);
    if (kMatch) {
        return Math.round(parseFloat(kMatch[1]) * 1000);
    }
    const mMatch = lower.match(/([0-9.]+)\s*m/);
    if (mMatch) {
        return Math.round(parseFloat(mMatch[1]) * 1000000);
    }
    const digits = lower.replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : 0;
}

/**
 * Clean star rating
 */
export function parseTemuRating(raw) {
    if (typeof raw === 'number') return raw;
    if (!raw || typeof raw !== 'string') return null;
    const match = raw.replace(',', '.').match(/([0-5]\.[0-9]|[0-5])/);
    return match ? parseFloat(match[1]) : null;
}

/**
 * Parse product details from Temu Product HTML
 */
export function parseTemuProductHtml(html, url = '') {
    if (!html) return null;

    const goodsId = extractTemuGoodsId(url);

    // 1. Check for JSON-LD schema
    let ldData = null;
    try {
        const ldMatches = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
        if (ldMatches) {
            for (const script of ldMatches) {
                const jsonText = script.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
                const d = JSON.parse(jsonText);
                if (d['@type'] === 'Product') {
                    ldData = d;
                    break;
                }
            }
        }
    } catch {
        // Fallback
    }

    // Title
    let title = ldData?.name || null;
    if (!title) {
        const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
                           html.match(/data-pl="goods_title"[^>]*>([\s\S]*?)<\/(?:h1|span|div)>/i);
        if (titleMatch) title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    // Price & Original Price
    let price = ldData?.offers?.price ? parseTemuPrice(String(ldData.offers.price)) : null;
    let originalPrice = null;
    let currency = ldData?.offers?.priceCurrency || 'USD';

    const curPriceMatch = html.match(/data-pl="goods_price"[^>]*>([\s\S]*?)<\/(?:span|div)>/i) ||
                          html.match(/class="[^"]*price-current[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/i);
    if (curPriceMatch && price === null) {
        price = parseTemuPrice(curPriceMatch[1]);
    }

    const origPriceMatch = html.match(/data-pl="original_price"[^>]*>([\s\S]*?)<\/(?:span|div)>/i) ||
                           html.match(/class="[^"]*price-origin[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/i);
    if (origPriceMatch) {
        originalPrice = parseTemuPrice(origPriceMatch[1]);
    }

    // Discount percentage
    let discount = null;
    if (price && originalPrice && originalPrice > price) {
        const pct = Math.round(((originalPrice - price) / originalPrice) * 100);
        discount = `-${pct}%`;
    }

    // Sales Count (e.g. "100k+ sold")
    let salesCount = null;
    let salesCountNumber = 0;
    const salesMatch = html.match(/(\d[\d.]*\s*[kKmM]?\+?\s*sold)/i) ||
                       html.match(/class="[^"]*sales-tip[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    if (salesMatch) {
        salesCount = salesMatch[1].replace(/<[^>]+>/g, '').trim();
        salesCountNumber = parseTemuSalesCount(salesCount);
    }

    // Rating & Reviews
    let rating = ldData?.aggregateRating?.ratingValue !== undefined
        ? parseTemuRating(String(ldData.aggregateRating.ratingValue))
        : null;
    let reviewsCount = ldData?.aggregateRating?.reviewCount !== undefined
        ? (parseInt(String(ldData.aggregateRating.reviewCount).replace(/[^\d]/g, ''), 10) || 0)
        : 0;

    if (rating === null) {
        const ratingMatch = html.match(/([0-5]\.[0-9])\s*★/) ||
                            html.match(/class="[^"]*review-score[^"]*"[^>]*>([0-5]\.[0-9])<\/span>/i);
        if (ratingMatch) rating = parseTemuRating(ratingMatch[1]);
    }

    if (reviewsCount === 0) {
        const revMatch = html.match(/(\d[\d,]*)\s*(?:Reviews|reviews)/i);
        if (revMatch) reviewsCount = parseInt(revMatch[1].replace(/,/g, ''), 10);
    }

    // Lightning Deal check
    const isLightningDeal = html.toLowerCase().includes('lightning deal') || html.toLowerCase().includes('limited time offer');

    // Store Name
    let storeName = null;
    const storeMatch = html.match(/data-pl="mall_name"[^>]*>([\s\S]*?)<\/(?:span|a)>/i) ||
                       html.match(/class="[^"]*mall-name[^"]*"[^>]*>([\s\S]*?)<\/(?:span|a)>/i);
    if (storeMatch) storeName = storeMatch[1].replace(/<[^>]+>/g, '').trim();

    // Images
    const images = [];
    if (Array.isArray(ldData?.image)) images.push(...ldData.image);
    else if (typeof ldData?.image === 'string') images.push(ldData.image);

    const imgMatches = [...html.matchAll(/class="[^"]*(?:main-image|goods-image)[^"]*"[^>]*src="([^"]+)"/gi)];
    for (const m of imgMatches) images.push(m[1]);

    const thumbnail = images[0] || null;

    return {
        goodsId,
        title,
        price,
        originalPrice,
        discount,
        currency,
        salesCount,
        salesCountNumber,
        rating,
        reviewsCount,
        isLightningDeal,
        stockStatus: 'In stock',
        storeName,
        thumbnail,
        images: [...new Set(images)],
        url,
        scrapedAt: new Date().toISOString(),
    };
}

/**
 * Extract items from Temu Search Results HTML
 */
export function parseTemuSearchHtml(html) {
    const results = [];
    if (!html) return results;

    const cards = [...html.matchAll(/data-goods-id="(\d{10,})"[\s\S]*?(?=<div[^>]*data-goods-id=|$)/gi)];

    for (const c of cards) {
        const goodsId = c[1];
        const cardHtml = c[0];

        // Title
        const titleMatch = cardHtml.match(/class="[^"]*goods-title[^"]*"[^>]*>([\s\S]*?)<\/(?:h2|span|div)>/i) ||
                           cardHtml.match(/title="([^"]+)"/i);
        if (!titleMatch) continue;

        const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
        if (!title) continue;

        // Price
        const priceMatch = cardHtml.match(/\$([0-9,]+\.[0-9]{2})/);
        const price = priceMatch ? parseTemuPrice(priceMatch[1]) : null;

        // Sales count
        const salesMatch = cardHtml.match(/(\d[\d.]*\s*[kKmM]?\+?\s*sold)/i);
        const salesCount = salesMatch ? salesMatch[1].trim() : null;

        // Rating
        const ratingMatch = cardHtml.match(/([0-5]\.[0-9])\s*★/);
        const rating = ratingMatch ? parseTemuRating(ratingMatch[1]) : null;

        // Thumbnail
        const imgMatch = cardHtml.match(/<img[^>]*src="([^"]+)"/i);
        const thumbnail = imgMatch ? imgMatch[1] : null;

        results.push({
            goodsId,
            title,
            price,
            currency: 'USD',
            salesCount,
            salesCountNumber: parseTemuSalesCount(salesCount),
            rating,
            thumbnail,
            url: `https://www.temu.com/goods-detail-g-${goodsId}.html`,
            scrapedAt: new Date().toISOString(),
        });
    }

    return results;
}
