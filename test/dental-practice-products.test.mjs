import test from "node:test";
import assert from "node:assert/strict";
import {
    buildDentalPracticeDiscoverProducts,
    dentalProductsCatalogIsCurrent,
    DENTAL_PRACTICE_PRODUCTS,
} from "../services/dental/dentalPracticeProducts.js";

test("dental product catalog is discover-shaped and under listing cap", () => {
    const products = buildDentalPracticeDiscoverProducts();
    assert.equal(products.length, DENTAL_PRACTICE_PRODUCTS.length);
    assert.ok(products.length <= 48);
    for (const row of products) {
        assert.ok(row.id);
        assert.ok(row.name);
        assert.ok(row.description);
    }
    assert.ok(dentalProductsCatalogIsCurrent(products));
    const prices = products.map((p) => String(p.price));
    assert.equal(prices[0], "From R1 200");
    assert.ok(String(prices.at(-1)).includes("45 000"));
});