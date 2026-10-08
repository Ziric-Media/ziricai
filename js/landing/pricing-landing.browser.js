/**
 * Landing pricing — sync render from window.ZiricBillingPlans (canonical catalog).
 * Loaded after billingPlans.browser.js so prices never flash from stale HTML.
 */
(function () {
  'use strict';

  function renderFeature(feature) {
    return '<li><i class="fa-solid fa-check"></i> ' + String(feature) + '</li>';
  }

  function renderPlanCard(plan, featured) {
    const bp = window.ZiricBillingPlans;
    if (!bp) return '';

    const isCustom = plan.price == null || plan.contactSales;
    const priceHtml = isCustom
      ? 'Custom'
      : plan.price > 0
        ? bp.formatPrice(plan.price) + ' <small>/month</small>'
        : 'Free <small>/trial</small>';

    const ctaHtml = isCustom
      ? '<button class="btn btn-outline" type="button" onclick="showToast(\'Contact sales for custom pricing\',\'info\')">Contact Sales</button>'
      : '<button class="btn" type="button" onclick="launchWizard()">Start Free Trial</button>';

    const tagline = plan.tagline ? '<p class="pricing-tagline">' + plan.tagline + '</p>' : '';

    return (
      '<div class="pricing-card' +
      (featured ? ' featured' : '') +
      '">' +
      '<div class="pricing-plan">' +
      plan.label +
      '</div>' +
      tagline +
      '<div class="pricing-price">' +
      priceHtml +
      '</div>' +
      '<ul class="pricing-features">' +
      (plan.features || []).slice(0, 5).map(renderFeature).join('') +
      '</ul>' +
      ctaHtml +
      '</div>'
    );
  }

  function initLandingPricing() {
    const bp = window.ZiricBillingPlans;
    if (!bp?.getPublicPlans) return;

    const grids = document.querySelectorAll(
      '#pricing .pricing-grid, #page-pricing .marketing-pricing-grid, .marketing-page-pricing .pricing-grid'
    );
    if (!grids.length) return;

    const plans = bp.getPublicPlans();
    const html = plans.map((plan) => renderPlanCard(plan, Boolean(plan.featured))).join('');
    grids.forEach((grid) => {
      grid.innerHTML = html;
      grid.removeAttribute('aria-busy');
    });
  }

  function scheduleInit() {
    initLandingPricing();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleInit);
  } else {
    scheduleInit();
  }
  window.addEventListener('load', scheduleInit);
})();
