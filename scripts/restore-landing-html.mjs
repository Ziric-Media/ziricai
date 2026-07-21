#!/usr/bin/env node
/**
 * Restore full-featured landing HTML sections lost during Netlify restructure.
 * Run: node scripts/restore-landing-html.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function patch(html) {
  let out = html;

  const apply = (label, oldStr, newStr) => {
    if (!out.includes(oldStr)) {
      console.warn(`WARN: block not found — ${label}`);
      return;
    }
    out = out.replace(oldStr, newStr);
    console.log(`OK: ${label}`);
  };

  apply(
    'why-ai two-panel',
    `<!-- ===== 3. PAIN POINTS ===== -->
<section class="section pain-section" id="why-ai">
    <div class="container">
        <p class="pain-headline">Stop losing customers because your business sleeps.</p>
        <p class="pain-subheadline">Your AI workforce works 24 hours a day.</p>
        <div class="pain-checklist">
            <div class="pain-item"><i class="fa-solid fa-circle-check"></i> Answers instantly</div>
            <div class="pain-item"><i class="fa-solid fa-circle-check"></i> Books appointments</div>
            <div class="pain-item"><i class="fa-solid fa-circle-check"></i> Generates quotations</div>
            <div class="pain-item"><i class="fa-solid fa-circle-check"></i> Captures leads</div>
            <div class="pain-item"><i class="fa-solid fa-circle-check"></i> Follows up automatically</div>
            <div class="pain-item"><i class="fa-solid fa-circle-check"></i> Supports your team</div>
            <div class="pain-item"><i class="fa-solid fa-circle-check"></i> Never takes leave</div>
            <div class="pain-item"><i class="fa-solid fa-circle-check"></i> Never forgets</div>
            <div class="pain-item"><i class="fa-solid fa-circle-check"></i> Never misses a customer</div>
        </div>
    </div>
</section>`,
    `<!-- ===== 3. WHY AI ===== -->
<section class="section pain-section" id="why-ai">
    <div class="container">
        <div class="split-panel-layout why-ai-layout">
            <div class="split-panel-left why-ai-copy">
                <span class="section-eyebrow">Why AI?</span>
                <h2 class="why-ai-headline">Your customers don't wait. Why should they?</h2>
                <p class="why-ai-lead">While you sleep, your competitors are closing deals. ZiricAI gives you an always-on workforce that replies in seconds — not hours.</p>
                <div class="why-ai-stats">
                    <div class="why-ai-stat">
                        <strong>&lt;2s</strong>
                        <span>Avg. reply time</span>
                    </div>
                    <div class="why-ai-stat">
                        <strong>24/7</strong>
                        <span>Always on duty</span>
                    </div>
                    <div class="why-ai-stat">
                        <strong>42%</strong>
                        <span>After-hours wins</span>
                    </div>
                </div>
                <ul class="why-ai-highlights">
                    <li><i class="fa-solid fa-bolt"></i> Instant WhatsApp, web &amp; social replies</li>
                    <li><i class="fa-solid fa-calendar-check"></i> Appointments booked while you sleep</li>
                    <li><i class="fa-solid fa-chart-line"></i> Every enquiry captured in your CRM</li>
                </ul>
                <button class="btn btn-glow" onclick="launchWizard()"><i class="fa-solid fa-rocket"></i> Start Free Trial</button>
            </div>
            <div class="split-panel-right why-ai-visual">
                <div class="why-ai-visual-card">
                    <div class="why-ai-visual-header">
                        <span><i class="fa-solid fa-gauge-high"></i> What changes with AI</span>
                        <span class="live-dot"><span></span> Live impact</span>
                    </div>
                    <div class="pain-checklist">
                        <div class="pain-item"><i class="fa-solid fa-circle-check"></i> Win back after-hours enquiries</div>
                        <div class="pain-item"><i class="fa-solid fa-circle-check"></i> Fill your calendar while you sleep</div>
                        <div class="pain-item"><i class="fa-solid fa-circle-check"></i> Send quotes before they ask twice</div>
                        <div class="pain-item"><i class="fa-solid fa-circle-check"></i> Capture every lead — not just the easy ones</div>
                        <div class="pain-item"><i class="fa-solid fa-circle-check"></i> Follow up so no deal goes cold</div>
                        <div class="pain-item"><i class="fa-solid fa-circle-check"></i> Free your team from repetitive work</div>
                        <div class="pain-item"><i class="fa-solid fa-circle-check"></i> Never lose revenue to sick days</div>
                        <div class="pain-item"><i class="fa-solid fa-circle-check"></i> Never forget a customer detail</div>
                        <div class="pain-item"><i class="fa-solid fa-circle-check"></i> Never miss another WhatsApp message</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</section>`
  );

  apply(
    'ai-employees + Sarah hero',
    `<!-- ===== 5. AI EMPLOYEES ===== -->
<section class="section" id="ai-employees">
    <div class="container">
        <div class="section-header">
            <span class="section-eyebrow">AI Employees</span>
            <h2>Specialized AI agents ready to work from day one</h2>
            <p>Each AI employee is trained for a specific role — support, sales, reception, finance, and more.</p>
        </div>
        <div class="agent-grid">
            <div class="agent-card"><div class="agent-avatar">💬</div><h4>Customer Support</h4><p>24/7 ticket resolution, FAQs, handoff</p></div>
            <div class="agent-card"><div class="agent-avatar">💰</div><h4>Sales AI</h4><p>Lead qualification, follow-ups, proposals</p></div>
            <div class="agent-card"><div class="agent-avatar">📈</div><h4>Marketing AI</h4><p>Campaigns, segmentation, content</p></div>
            <div class="agent-card"><div class="agent-avatar">📞</div><h4>Receptionist AI</h4><p>Call routing, booking, inquiries</p></div>
            <div class="agent-card"><div class="agent-avatar">🧑‍💼</div><h4>HR AI</h4><p>Onboarding, policies, leave requests</p></div>
            <div class="agent-card"><div class="agent-avatar">📊</div><h4>Finance AI</h4><p>Invoicing, expenses, reports</p></div>
            <div class="agent-card"><div class="agent-avatar">⚖️</div><h4>Legal AI</h4><p>Contract review, compliance, research</p></div>
            <div class="agent-card"><div class="agent-avatar">🏫</div><h4>School AI</h4><p>Student inquiries, parent comms</p></div>
            <div class="agent-card"><div class="agent-avatar">🏥</div><h4>Healthcare AI</h4><p>Appointments, triage, patient info</p></div>
            <div class="agent-card"><div class="agent-avatar">⛪</div><h4>Church AI</h4><p>Events, member care, donations</p></div>
        </div>
    </div>
</section>`,
    `<!-- ===== 5. AI EMPLOYEES / MEET SARAH ===== -->
<section class="section" id="ai-employees">
    <div class="container">
        <div class="section-header">
            <span class="section-eyebrow">AI Employees</span>
            <h2>Hire your first employee that never sleeps, never forgets, never calls in sick.</h2>
            <p>Starts working in under 10 minutes. Meet Sarah — your reception AI.</p>
        </div>
        <div class="sarah-hero-card">
            <div class="sarah-avatar-wrap">
                <div class="sarah-avatar">S</div>
                <span class="sarah-status"><span class="pulse-dot"></span> Online now</span>
            </div>
            <div class="sarah-info">
                <div class="sarah-name">Sarah <span class="sarah-role">Reception AI</span></div>
                <p class="sarah-tagline">Answers every call and WhatsApp. Books appointments. Makes your front desk feel human — without the payroll.</p>
                <div class="sarah-stats">
                    <div class="sarah-stat"><strong data-counter="24" data-format="number">0</strong><span>Hours / day</span></div>
                    <div class="sarah-stat"><strong data-counter="1.4" data-format="decimal">0</strong><span>Sec reply</span></div>
                    <div class="sarah-stat"><strong data-counter="16" data-format="number">0</strong><span>Languages</span></div>
                    <div class="sarah-stat"><strong data-counter="8412" data-format="number">0</strong><span>Bookings</span></div>
                    <div class="sarah-stat"><strong data-counter="98.7" data-format="percent">0</strong><span>Accuracy</span></div>
                </div>
                <div class="sarah-actions">
                    <button class="btn btn-outline" id="talkToSarahBtn"><i class="fa-solid fa-comment-dots"></i> Talk to Sarah</button>
                    <button class="btn btn-outline" id="listenVoiceBtn"><i class="fa-solid fa-volume-high"></i> Listen to Voice</button>
                    <button class="btn btn-outline" id="watchSarahBtn"><i class="fa-solid fa-play"></i> Watch Live</button>
                </div>
            </div>
        </div>
        <p class="sarah-more-label">Or build your full AI department:</p>
        <div class="agent-grid">
            <div class="agent-card"><div class="agent-avatar">💬</div><h4>Customer Support</h4><p>Resolve issues before customers churn</p></div>
            <div class="agent-card"><div class="agent-avatar">💰</div><h4>Sales AI</h4><p>Close deals while your team sleeps</p></div>
            <div class="agent-card"><div class="agent-avatar">📈</div><h4>Marketing AI</h4><p>Turn enquiries into campaigns that convert</p></div>
            <div class="agent-card"><div class="agent-avatar">📞</div><h4>Receptionist AI</h4><p>Never miss a call or booking again</p></div>
            <div class="agent-card"><div class="agent-avatar">🧑‍💼</div><h4>HR AI</h4><p>Onboard staff without the admin burden</p></div>
            <div class="agent-card"><div class="agent-avatar">📊</div><h4>Finance AI</h4><p>Get paid faster with automated invoicing</p></div>
            <div class="agent-card"><div class="agent-avatar">⚖️</div><h4>Legal AI</h4><p>Intake clients in minutes, not hours</p></div>
            <div class="agent-card"><div class="agent-avatar">🏫</div><h4>School AI</h4><p>Give every parent an instant answer</p></div>
            <div class="agent-card"><div class="agent-avatar">🏥</div><h4>Healthcare AI</h4><p>Fill your appointment book automatically</p></div>
            <div class="agent-card"><div class="agent-avatar">⛪</div><h4>Church AI</h4><p>Stay connected with every member</p></div>
        </div>
    </div>
</section>`
  );

  const productTourBlock = `<!-- ===== PRODUCT TOUR ===== -->
<section class="section section-alt" id="product-tour">
    <div class="container">
        <div class="section-header">
            <span class="section-eyebrow">Live Demo</span>
            <h2>Watch Sarah handle a real customer journey.</h2>
            <p>Four steps. One conversation. Zero human intervention.</p>
        </div>
        <div class="tour-layout">
            <div class="tour-phone-wrap">
                <div class="device-simulator device-iphone" aria-hidden="true">
                    <div class="device-frame">
                        <div class="device-btn device-btn-silent"></div>
                        <div class="device-btn device-btn-vol-up"></div>
                        <div class="device-btn device-btn-vol-down"></div>
                        <div class="device-btn device-btn-power"></div>
                        <div class="device-screen">
                            <div class="device-status-bar">
                                <span class="device-time">9:41</span>
                                <div class="device-dynamic-island"><span class="device-island-cam"></span></div>
                                <div class="device-status-icons">
                                    <i class="fa-solid fa-signal"></i>
                                    <i class="fa-solid fa-wifi"></i>
                                    <span class="device-battery"><span class="device-battery-level"></span></span>
                                </div>
                            </div>
                            <div class="tour-phone-app">
                                <div class="tour-phone-header">
                                    <span class="tour-phone-back"><i class="fa-solid fa-chevron-left"></i></span>
                                    <div class="tour-phone-avatar">S</div>
                                    <div class="tour-phone-contact">
                                        <span class="tour-phone-title" id="tourPhoneTitle">Central Motors</span>
                                        <span class="tour-phone-status"><span class="pulse-dot"></span> Sarah · online</span>
                                    </div>
                                    <div class="tour-phone-actions">
                                        <i class="fa-brands fa-whatsapp"></i>
                                        <i class="fa-solid fa-phone"></i>
                                        <i class="fa-solid fa-ellipsis-vertical"></i>
                                    </div>
                                </div>
                                <div class="tour-phone-chat" id="tourPhoneChat"></div>
                                <div class="tour-phone-action" id="tourPhoneAction"></div>
                                <div class="tour-phone-input">
                                    <i class="fa-regular fa-face-smile"></i>
                                    <span class="tour-phone-input-field">Message</span>
                                    <i class="fa-solid fa-paperclip"></i>
                                    <span class="tour-phone-send"><i class="fa-solid fa-microphone"></i></span>
                                </div>
                            </div>
                            <div class="device-home-indicator"></div>
                        </div>
                    </div>
                    <div class="device-shadow"></div>
                </div>
            </div>
            <div class="tour-controls">
                <div class="tour-step-indicator">
                    <span class="tour-dot active" data-step="0"></span>
                    <span class="tour-dot" data-step="1"></span>
                    <span class="tour-dot" data-step="2"></span>
                    <span class="tour-dot" data-step="3"></span>
                </div>
                <h3 id="tourStepTitle">Step 1 · Answer WhatsApp enquiry</h3>
                <p id="tourStepDesc">A customer asks about stock at 9pm. Sarah replies instantly with accurate inventory from your knowledge base.</p>
                <div class="tour-nav">
                    <button class="btn btn-outline" id="tourPrevBtn" disabled><i class="fa-solid fa-arrow-left"></i> Back</button>
                    <button class="btn" id="tourNextBtn">Next <i class="fa-solid fa-arrow-right"></i></button>
                </div>
                <button class="btn btn-glow tour-cta hidden" id="tourCtaBtn" onclick="launchWizard()"><i class="fa-solid fa-rocket"></i> Start Free Trial</button>
            </div>
        </div>
    </div>
</section>

`;

  if (!out.includes('id="product-tour"')) {
    out = out.replace(
      '<!-- ===== 6. MARKETPLACE ===== -->',
      `${productTourBlock}<!-- ===== 6. MARKETPLACE ===== -->`
    );
    console.log('OK: product tour section');
  }

  apply(
    'FAQ two-panel',
    `<!-- ===== 12. FAQ ===== -->
<section class="section section-alt" id="faq">
    <div class="container">
        <div class="section-header">
            <span class="section-eyebrow">FAQ</span>
            <h2>Frequently asked questions</h2>
        </div>
        <div class="faq-list">
            <div class="faq-item">
                <button class="faq-question" type="button">How long does setup take? <i class="fa-solid fa-chevron-down"></i></button>
                <div class="faq-answer"><p>Most businesses go live in under 10 minutes. Create your account, choose your industry pack, connect WhatsApp, upload knowledge, and your AI employee is ready.</p></div>
            </div>
            <div class="faq-item">
                <button class="faq-question" type="button">Do I need coding skills? <i class="fa-solid fa-chevron-down"></i></button>
                <div class="faq-answer"><p>No. ZiricAI is designed for business owners and teams. Everything is point-and-click — from onboarding to workflow automation.</p></div>
            </div>
            <div class="faq-item">
                <button class="faq-question" type="button">Which channels are supported? <i class="fa-solid fa-chevron-down"></i></button>
                <div class="faq-answer"><p>WhatsApp, Facebook Messenger, Instagram DMs, Telegram, website live chat, email, and SMS. More channels are added regularly.</p></div>
            </div>
            <div class="faq-item">
                <button class="faq-question" type="button">Is my data secure? <i class="fa-solid fa-chevron-down"></i></button>
                <div class="faq-answer"><p>Yes. All data is encrypted at rest and in transit. Each company's knowledge base is fully isolated. ZiricAI is POPIA-ready with role-based access and audit logs.</p></div>
            </div>
            <div class="faq-item">
                <button class="faq-question" type="button">Can I try before I pay? <i class="fa-solid fa-chevron-down"></i></button>
                <div class="faq-answer"><p>Absolutely. Every plan includes a 14-day free trial with full access. No credit card required to start.</p></div>
            </div>
            <div class="faq-item">
                <button class="faq-question" type="button">What happens after the trial? <i class="fa-solid fa-chevron-down"></i></button>
                <div class="faq-answer"><p>Choose a plan that fits your business. Your AI employees, knowledge base, and conversation history carry over seamlessly.</p></div>
            </div>
        </div>
    </div>
</section>`,
    `<!-- ===== 12. FAQ ===== -->
<section class="section section-alt" id="faq">
    <div class="container">
        <div class="split-panel-layout faq-layout">
            <aside class="split-panel-left faq-sidebar">
                <span class="section-eyebrow">FAQ</span>
                <h2 class="faq-sidebar-title">Got questions? We've got answers.</h2>
                <p class="faq-sidebar-intro">Everything you need to know about setup, channels, security, and pricing — or ask Sarah anytime.</p>
                <nav class="faq-categories" id="faqCategories" aria-label="FAQ categories">
                    <button type="button" class="faq-cat-btn active" data-faq-cat="all"><i class="fa-solid fa-grid-2"></i> All questions</button>
                    <button type="button" class="faq-cat-btn" data-faq-cat="getting-started"><i class="fa-solid fa-rocket"></i> Getting started</button>
                    <button type="button" class="faq-cat-btn" data-faq-cat="product"><i class="fa-solid fa-plug"></i> Product &amp; channels</button>
                    <button type="button" class="faq-cat-btn" data-faq-cat="security"><i class="fa-solid fa-shield-halved"></i> Security &amp; privacy</button>
                    <button type="button" class="faq-cat-btn" data-faq-cat="billing"><i class="fa-solid fa-credit-card"></i> Billing &amp; trial</button>
                </nav>
                <div class="faq-sarah-prompt">
                    <div class="faq-sarah-avatar">S</div>
                    <div>
                        <strong>Still unsure?</strong>
                        <p>Ask Sarah — she knows pricing, setup, and every industry pack.</p>
                        <button type="button" class="btn btn-outline btn-sm" id="faqAskSarahBtn"><i class="fa-solid fa-comment-dots"></i> Chat with Sarah</button>
                    </div>
                </div>
            </aside>
            <div class="split-panel-right faq-content">
                <div class="faq-list" id="faqList">
                    <div class="faq-item" data-faq-cat="getting-started">
                        <button class="faq-question" type="button">How long does setup take? <i class="fa-solid fa-chevron-down"></i></button>
                        <div class="faq-answer"><p>Most businesses go live in under 10 minutes. Create your account, choose your industry pack, connect WhatsApp, upload knowledge, and your AI employee is ready.</p></div>
                    </div>
                    <div class="faq-item" data-faq-cat="getting-started">
                        <button class="faq-question" type="button">Do I need coding skills? <i class="fa-solid fa-chevron-down"></i></button>
                        <div class="faq-answer"><p>No. ZiricAI is designed for business owners and teams. Everything is point-and-click — from onboarding to workflow automation.</p></div>
                    </div>
                    <div class="faq-item" data-faq-cat="product">
                        <button class="faq-question" type="button">Which channels are supported? <i class="fa-solid fa-chevron-down"></i></button>
                        <div class="faq-answer"><p>WhatsApp, Facebook Messenger, Instagram DMs, Telegram, website live chat, email, and SMS. More channels are added regularly.</p></div>
                    </div>
                    <div class="faq-item" data-faq-cat="security">
                        <button class="faq-question" type="button">Is my data secure? <i class="fa-solid fa-chevron-down"></i></button>
                        <div class="faq-answer"><p>Yes. All data is encrypted at rest and in transit. Each company's knowledge base is fully isolated. ZiricAI is POPIA-ready with role-based access and audit logs.</p></div>
                    </div>
                    <div class="faq-item" data-faq-cat="billing">
                        <button class="faq-question" type="button">Can I try before I pay? <i class="fa-solid fa-chevron-down"></i></button>
                        <div class="faq-answer"><p>Absolutely. Every plan includes a 14-day free trial with full access. No credit card required to start.</p></div>
                    </div>
                    <div class="faq-item" data-faq-cat="billing">
                        <button class="faq-question" type="button">What happens after the trial? <i class="fa-solid fa-chevron-down"></i></button>
                        <div class="faq-answer"><p>Choose a plan that fits your business. Your AI employees, knowledge base, and conversation history carry over seamlessly.</p></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</section>`
  );

  apply(
    'demo modal split + iPhone',
    `<!-- ===== WATCH AI LIVE — DEMO MODAL ===== -->
<div class="demo-overlay" id="demoOverlay">
    <div class="demo-modal" role="dialog" aria-label="AI Live Demo">
        <div class="demo-modal-header">
            <h3><i class="fa-brands fa-whatsapp"></i> Central Motors — Sales AI</h3>
            <button class="demo-close" id="demoClose" aria-label="Close">&times;</button>
        </div>
        <div class="demo-chat" id="demoChat"></div>
        <div class="demo-modal-footer">Simulated conversation · Powered by ZiricAI</div>
    </div>
</div>`,
    `<!-- ===== WATCH AI LIVE — DEMO MODAL ===== -->
<div class="demo-overlay" id="demoOverlay">
    <div class="demo-modal demo-modal-split" role="dialog" aria-label="AI Live Demo">
        <div class="demo-modal-header">
            <h3 id="demoModalTitle"><i class="fa-brands fa-whatsapp"></i> Watch AI Live</h3>
            <button class="demo-close" id="demoClose" aria-label="Close">&times;</button>
        </div>
        <div class="demo-modal-body">
            <div class="demo-controls">
                <p class="demo-controls-label">Live scenario</p>
                <div class="demo-scenario-tabs" id="demoScenarioTabs">
                    <button type="button" class="demo-scenario-tab active" data-scenario="sales"><i class="fa-solid fa-car"></i> Sales enquiry</button>
                    <button type="button" class="demo-scenario-tab" data-scenario="sarah"><i class="fa-solid fa-calendar-check"></i> Appointment booking</button>
                </div>
                <p class="demo-scenario-desc" id="demoScenarioDesc">Watch Sales AI handle a full Hilux enquiry — pricing, trade-in, financing, and test drive booking.</p>
                <div class="demo-live-feed" id="demoLiveFeed">
                    <div class="demo-feed-line"><span class="dot"></span> Waiting for customer message…</div>
                </div>
                <p class="demo-modal-note"><i class="fa-solid fa-circle-info"></i> Messages appear on the phone in real time — just like your customers see them.</p>
            </div>
            <div class="demo-phone-wrap">
                <div class="device-simulator device-iphone device-iphone-compact" aria-hidden="true">
                    <div class="device-frame">
                        <div class="device-btn device-btn-silent"></div>
                        <div class="device-btn device-btn-vol-up"></div>
                        <div class="device-btn device-btn-vol-down"></div>
                        <div class="device-btn device-btn-power"></div>
                        <div class="device-screen">
                            <div class="device-status-bar">
                                <span class="device-time">9:41</span>
                                <div class="device-dynamic-island"><span class="device-island-cam"></span></div>
                                <div class="device-status-icons">
                                    <i class="fa-solid fa-signal"></i>
                                    <i class="fa-solid fa-wifi"></i>
                                    <span class="device-battery"><span class="device-battery-level"></span></span>
                                </div>
                            </div>
                            <div class="tour-phone-app">
                                <div class="tour-phone-header">
                                    <span class="tour-phone-back"><i class="fa-solid fa-chevron-left"></i></span>
                                    <div class="tour-phone-avatar" id="demoPhoneAvatar"><i class="fa-solid fa-car"></i></div>
                                    <div class="tour-phone-contact">
                                        <span class="tour-phone-title" id="demoPhoneTitle">Central Motors</span>
                                        <span class="tour-phone-status"><span class="pulse-dot"></span> <span id="demoPhoneAgent">Sales AI</span> · online</span>
                                    </div>
                                    <div class="tour-phone-actions">
                                        <i class="fa-brands fa-whatsapp"></i>
                                        <i class="fa-solid fa-phone"></i>
                                        <i class="fa-solid fa-ellipsis-vertical"></i>
                                    </div>
                                </div>
                                <div class="tour-phone-chat demo-phone-chat" id="demoPhoneChat"></div>
                                <div class="tour-phone-action" id="demoPhoneAction"></div>
                                <div class="tour-phone-input">
                                    <i class="fa-regular fa-face-smile"></i>
                                    <span class="tour-phone-input-field">Message</span>
                                    <i class="fa-solid fa-paperclip"></i>
                                    <span class="tour-phone-send"><i class="fa-solid fa-microphone"></i></span>
                                </div>
                            </div>
                            <div class="device-home-indicator"></div>
                        </div>
                    </div>
                    <div class="device-shadow"></div>
                </div>
            </div>
        </div>
        <div class="demo-modal-footer">Simulated conversation · Powered by ZiricAI</div>
    </div>
</div>`
  );

  const sarahWidget = `<!-- ===== SARAH FLOATING CHAT ===== -->
<div class="sarah-widget" id="sarahWidget">
    <div class="sarah-panel" id="sarahPanel" aria-hidden="true">
        <div class="sarah-panel-header">
            <div class="sarah-panel-avatar">S</div>
            <div>
                <strong>Sarah</strong>
                <span>Reception AI · Online</span>
            </div>
            <button class="sarah-panel-close" id="sarahPanelClose" aria-label="Close chat">&times;</button>
        </div>
        <div class="sarah-panel-messages" id="sarahMessages">
            <div class="sarah-msg ai">Hi 👋 I'm Sarah. Ask me anything about ZiricAI — pricing, setup, industries, WhatsApp integration. No signup required!</div>
        </div>
        <div class="sarah-panel-suggestions" id="sarahSuggestions">
            <button type="button" data-q="How much does ZiricAI cost?">Pricing</button>
            <button type="button" data-q="How long does setup take?">Setup time</button>
            <button type="button" data-q="Which industries do you support?">Industries</button>
            <button type="button" data-q="Does it work with WhatsApp?">WhatsApp</button>
        </div>
        <form class="sarah-panel-input" id="sarahForm">
            <input type="text" id="sarahInput" placeholder="Ask Sarah anything…" autocomplete="off" maxlength="500">
            <button type="submit" aria-label="Send"><i class="fa-solid fa-paper-plane"></i></button>
        </form>
    </div>
    <button class="sarah-bubble" id="sarahBubble" aria-label="Chat with Sarah">
        <span class="sarah-bubble-avatar">S</span>
        <span class="sarah-bubble-text">Hi 👋 I'm Sarah. Ask me anything about ZiricAI. No signup required.</span>
        <span class="sarah-bubble-icon"><i class="fa-solid fa-comment-dots"></i></span>
    </button>
</div>

`;

  if (!out.includes('id="sarahWidget"')) {
    out = out.replace('<!-- TOAST CONTAINER -->', `${sarahWidget}<!-- TOAST CONTAINER -->`);
    console.log('OK: Sarah floating widget');
  }

  const scriptBlock = `<script src="js/shared/billingPlans.browser.js"></script>
<script src="js/shared/platformKnowledge.browser.js"></script>
<script src="js/shared/marketplacePacks.browser.js"></script>
<script src="js/ziricai-landing.js"></script>
<script type="module" src="js/landing/pricing.js"></script>
<script>`;

  out = out.replace(
    /<script src="js\/shared\/marketplacePacks\.browser\.js"><\/script>\s*<script src="js\/ziricai-landing\.js"><\/script>\s*<script>/,
    scriptBlock
  );
  if (!out.includes('platformKnowledge.browser.js')) {
    out = out.replace(
      /<script src="js\/shared\/marketplacePacks\.browser\.js"><\/script>\s*<script src="js\/ziricai-landing\.js"><\/script>\s*<script>/,
      scriptBlock
    );
  }
  console.log('OK: script load order');

  // Remove duplicate inline FAQ + demo handlers (ziricai-landing.js owns these)
  out = out.replace(
    `    // ===== FAQ ACCORDION =====
    document.querySelectorAll('.faq-question').forEach(btn => {
        btn.addEventListener('click', () => {
            const item = btn.closest('.faq-item');
            const wasOpen = item.classList.contains('open');
            document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
            if (!wasOpen) item.classList.add('open');
        });
    });

    // ===== WATCH AI LIVE DEMO =====
    const demoMessages = [
        { role: 'customer', text: 'Do you sell Toyota Hilux?' },
        { role: 'ai', text: 'Yes! We have 2022, 2023, and 2024 Toyota Hilux models available. Would you like financing options or to book a test drive?' },
    ];
    let demoRunning = false;

    function openDemo() {
        const overlay = document.getElementById('demoOverlay');
        const chat = document.getElementById('demoChat');
        overlay.classList.add('active');
        chat.innerHTML = '';
        demoRunning = true;
        playDemo(chat, 0);
    }

    function closeDemo() {
        document.getElementById('demoOverlay').classList.remove('active');
        demoRunning = false;
    }

    async function playDemo(chat, index) {
        if (!demoRunning || index >= demoMessages.length) return;
        const msg = demoMessages[index];

        if (msg.role === 'ai') {
            const typing = document.createElement('div');
            typing.className = 'chat-bubble typing';
            typing.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
            chat.appendChild(typing);
            chat.scrollTop = chat.scrollHeight;
            await delay(1400);
            if (!demoRunning) return;
            typing.remove();
        }

        const bubble = document.createElement('div');
        bubble.className = \`chat-bubble \${msg.role}\`;
        bubble.textContent = msg.text;
        chat.appendChild(bubble);
        chat.scrollTop = chat.scrollHeight;

        await delay(msg.role === 'customer' ? 800 : 2000);
        playDemo(chat, index + 1);
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    document.getElementById('watchDemoBtn')?.addEventListener('click', openDemo);
    document.getElementById('watchDemoBtn2')?.addEventListener('click', openDemo);
    document.getElementById('demoClose')?.addEventListener('click', closeDemo);
    document.getElementById('demoOverlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'demoOverlay') closeDemo();
    });`,
    `    document.getElementById('faqAskSarahBtn')?.addEventListener('click', () => {
        if (typeof openSarahChat === 'function') openSarahChat();
        else showToast('Sarah chat loading — try again in a moment', 'info');
    });

    // FAQ accordion, Watch AI Live demo, Sarah chat — js/ziricai-landing.js`
  );
  console.log('OK: removed duplicate inline demo/FAQ handlers');

  return out;
}

for (const rel of ['ziricai.html', '_sources/ziricai.html']) {
  const file = path.join(ROOT, rel);
  const html = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, patch(html), 'utf8');
  console.log(`Wrote ${rel}`);
}
