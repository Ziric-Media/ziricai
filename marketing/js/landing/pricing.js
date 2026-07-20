/**

 * Landing page pricing — renders cards from ZiricBillingPlans (services/platform/billingPlans.js).

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

        ? '<button class="btn btn-outline" type="button" onclick="showToast(\'Contact sales for custom pricing\',\'info\')">Contact Sales</button>'

        : '<button class="btn" type="button" onclick="launchWizard()">Start Free Trial</button>';



    return `

        <div class="pricing-card${featured ? ' featured' : ''}">

            <div class="pricing-plan">${plan.label}</div>

            <p class="pricing-tagline">${plan.tagline || ''}</p>

            <div class="pricing-price">${priceHtml}</div>

            <ul class="pricing-features">

                ${(plan.features || []).slice(0, 5).map(renderFeature).join('')}

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


