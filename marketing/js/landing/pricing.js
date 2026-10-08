/**
 * Landing page pricing (ES module) — local dev with import map.
 * Production marketing uses js/landing/pricing-landing.browser.js after billingPlans.browser.js.
 */

import { getPublicPlans, formatPrice } from '../shared/billingPlans.js';



function renderFeature(feature) {

    return `<li><i class="fa-solid fa-check"></i> ${feature}</li>`;

}



function renderPlanCard(plan, featured) {

    const isCustom = plan.price == null || plan.contactSales;

    const priceHtml = isCustom

        ? 'Custom'

        : plan.price > 0

            ? `${formatPrice(plan.price)} <small>/month</small>`

            : 'Free <small>/trial</small>';



    const ctaHtml = isCustom

        ? '<button class="btn btn-outline" type="button" onclick="showToast(\'Our team will reach out with custom pricing.\',\'info\')">Talk to Sales</button>'

        : '<button class="btn" type="button" onclick="launchWizard()">Start Free Trial</button>';

    const headline = plan.headline || plan.tagline || '';

    const description = plan.description || '';



    return `

        <div class="pricing-card${featured ? ' featured' : ''}">

            <div class="pricing-plan">${plan.label}</div>

            ${headline ? `<p class="pricing-headline">${headline}</p>` : ''}

            <div class="pricing-price">${priceHtml}</div>

            ${description ? `<p class="pricing-description">${description}</p>` : ''}

            <ul class="pricing-features">

                ${(plan.features || []).map(renderFeature).join('')}

            </ul>

            ${ctaHtml}

        </div>

    `;

}



function initLandingPricing() {

    const grid = document.querySelector('#pricing .pricing-grid');

    if (!grid) return;



    const plans = getPublicPlans();

    grid.innerHTML = plans.map((plan) => renderPlanCard(plan, Boolean(plan.featured))).join('');

}



if (document.readyState === 'loading') {

    document.addEventListener('DOMContentLoaded', initLandingPricing);

} else {

    initLandingPricing();

}


