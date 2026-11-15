import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import { chromium } from 'playwright';
import {
    extractTemuGoodsId,
    parseTemuProductHtml,
    parseTemuSearchHtml,
} from './extractors.js';

function sanitizeRecord(obj) {
    if (Array.isArray(obj)) return obj.map((item) => sanitizeRecord(item));
    if (!obj || typeof obj !== 'object') return obj;
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== null && v !== undefined && !(typeof v === 'number' && !Number.isFinite(v))) {
            clean[k] = Array.isArray(v)
                ? v.map((item) => (item && typeof item === 'object' ? sanitizeRecord(item) : item))
                : v && typeof v === 'object' && !(v instanceof Date)
                    ? sanitizeRecord(v)
                    : v;
        }
    }
    return clean;
}

function isProxyTransportError(errOrStatus) {
    const msg = String(errOrStatus?.message || errOrStatus || '');
    return errOrStatus === 597 || errOrStatus === 407 || /597|UPSTREAM407|407|Proxy responded with|tunneling socket/i.test(msg);
}

await Actor.init();

try {
    const input = (await Actor.getInput()) || {};
    const {
        productUrls = [],
        searchKeywords = [],
        sortBy = 'top_sales',
        maxProducts = 40,
        proxyConfiguration,
    } = input;

    log.info(`Starting Temu Scraper (Sort: ${sortBy})...`);

    // Setup Proxy
    let proxyConfig = null;
    let proxyUrl = undefined;
    if (proxyConfiguration) {
        try {
            proxyConfig = await Actor.createProxyConfiguration(proxyConfiguration);
            if (proxyConfig) {
                proxyUrl = await proxyConfig.newUrl();
                log.info('Proxy enabled successfully');
            }
        } catch (proxyErr) {
            log.warning(`Proxy initialization failed (${proxyErr.message}); continuing with direct connection.`);
        }
    }

    const rotateOrDisableProxy = async (err) => {
        if (!isProxyTransportError(err)) return;
        if (proxyConfig) {
            try {
                proxyUrl = await proxyConfig.newUrl();
                log.warning('Rotated Apify Proxy session after upstream proxy transport error.');
                return;
            } catch {
                // Fall through to disable proxy
            }
        }
        proxyUrl = undefined;
        log.warning('Disabled broken proxy session; falling back to direct connection.');
    };

    let totalProductsScraped = 0;
    let lightningDealsCount = 0;
    let totalSalesVolumeCaptured = 0;

    // Browser Helper for Anti-Bot Fallback
    let browser = null;
    const getBrowser = async () => {
        if (!browser) {
            const launchOptions = {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                ],
            };
            if (proxyUrl) {
                try {
                    const u = new URL(proxyUrl);
                    launchOptions.proxy = {
                        server: `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}`,
                        ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
                        ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
                    };
                } catch {
                    launchOptions.proxy = { server: proxyUrl };
                }
            }
            browser = await chromium.launch(launchOptions);
        }
        return browser;
    };

    const effectiveProductUrls = Array.isArray(productUrls) && productUrls.length > 0
        ? productUrls
        : (!Array.isArray(searchKeywords) || searchKeywords.length === 0)
            ? ['https://www.temu.com/goods-detail-g-601099512345678.html']
            : [];

    // 1. Process Direct Product URLs
    if (effectiveProductUrls.length > 0) {
        log.info(`Processing ${effectiveProductUrls.length} direct Temu product URLs...`);

        for (const rawUrl of effectiveProductUrls) {
            const targetUrl = typeof rawUrl === 'string' ? rawUrl : rawUrl?.url;
            if (!targetUrl) continue;

            log.info(`Fetching Temu product: ${targetUrl}`);
            let product = null;

            // Strategy A: gotScraping
            try {
                const response = await gotScraping({
                    url: targetUrl,
                    proxyUrl,
                    headers: {
                        'accept-language': 'en-US,en;q=0.9',
                        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                    },
                    timeout: { request: 30000 },
                });

                const html = response.body;
                if (!html.includes('Verification') && !html.includes('verify_window')) {
                    product = parseTemuProductHtml(html, targetUrl);
                }
            } catch (err) {
                await rotateOrDisableProxy(err);
                log.debug(`gotScraping error for ${targetUrl}: ${err.message}`);
            }

            // Strategy B: Browser fallback
            if (!product || !product.title) {
                try {
                    log.info(`Launching browser fallback for Temu item: ${targetUrl}...`);
                    const b = await getBrowser();
                    const page = await b.newPage();
                    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
                    await page.waitForTimeout(2500);

                    const html = await page.content();
                    product = parseTemuProductHtml(html, targetUrl);
                    await page.close();
                } catch (bErr) {
                    await rotateOrDisableProxy(bErr);
                    log.warning(`Browser fallback error for ${targetUrl}: ${bErr.message}`);
                }
            }

            if (product && product.title) {
                await Actor.pushData(sanitizeRecord(product));
                totalProductsScraped++;
                if (product.isLightningDeal) lightningDealsCount++;
                if (product.salesCountNumber) totalSalesVolumeCaptured += product.salesCountNumber;

                log.info(`[${totalProductsScraped}] Scraped: "${product.title.slice(0, 40)}..." | Price: $${product.price ?? 'N/A'} | Sales: ${product.salesCount || 'N/A'}`);
            } else {
                log.warning(`Could not extract valid item from: ${targetUrl}`);
            }

            // Polite delay
            await new Promise((r) => setTimeout(r, 1500));
        }
    }

    // 2. Process Search Keywords
    if (Array.isArray(searchKeywords) && searchKeywords.length > 0) {
        log.info(`Searching Temu for ${searchKeywords.length} keywords...`);

        for (const keyword of searchKeywords) {
            log.info(`Searching Temu for: "${keyword}" (sort: ${sortBy}, max: ${maxProducts})`);

            let searchUrl = `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(keyword)}`;
            if (sortBy === 'top_sales') searchUrl += '&sort=top_sales';
            else if (sortBy === 'price_low') searchUrl += '&sort=price_asc';
            else if (sortBy === 'price_high') searchUrl += '&sort=price_desc';
            else if (sortBy === 'rating') searchUrl += '&sort=rating';

            try {
                let html = null;

                try {
                    const response = await gotScraping({
                        url: searchUrl,
                        proxyUrl,
                        headers: {
                            'accept-language': 'en-US,en;q=0.9',
                            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                        },
                        timeout: { request: 30000 },
                    });
                    html = response.body;
                } catch (err) {
                    await rotateOrDisableProxy(err);
                    log.debug(`Direct search error: ${err.message}`);
                }

                if (!html || html.includes('Verification') || html.includes('verify_window')) {
                    const b = await getBrowser();
                    const page = await b.newPage();
                    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
                    await page.waitForTimeout(3000);
                    html = await page.content();
                    await page.close();
                }

                const results = parseTemuSearchHtml(html);
                const sliced = results.slice(0, maxProducts);

                for (const item of sliced) {
                    item.searchKeyword = keyword;
                    await Actor.pushData(sanitizeRecord(item));
                    totalProductsScraped++;
                    if (item.salesCountNumber) totalSalesVolumeCaptured += item.salesCountNumber;
                }

                log.info(`Extracted ${sliced.length} search results for "${keyword}"`);

            } catch (searchErr) {
                log.error(`Error searching Temu for "${keyword}": ${searchErr.message}`);
            }
        }
    }

    if (browser) {
        await browser.close();
    }

    // Save final executive summary
    const summary = {
        totalProductsScraped,
        lightningDealsCount,
        totalSalesVolumeCaptured,
        status: totalProductsScraped > 0 ? 'SUCCEEDED' : 'FAILED',
        scrapedAt: new Date().toISOString(),
    };

    await Actor.setValue('OUTPUT', summary);
    if (totalProductsScraped === 0) {
        await Actor.fail('Extracted 0 products. Verify target URLs, keywords, or proxy configuration.');
    }
    log.info(`Temu Scraping finished successfully! Total items: ${totalProductsScraped}`);

} catch (err) {
    log.error(`Fatal execution error: ${err.message}`, { stack: err.stack });
    await Actor.setValue('OUTPUT', { status: 'FAILED', error: err.message });
    await Actor.fail(err.message);
} finally {
    await Actor.exit();
}
