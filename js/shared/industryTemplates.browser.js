/**
 * Browser build of industry templates — mirrors js/shared/industryTemplates.js
 */
(function (global) {
    'use strict';

    const INDUSTRY_TEMPLATES = [
        { id: 'automotive', name: 'Automotive', icon: '🚗', page: 'industry-automotive.html' },
        { id: 'funeral', name: 'Funeral Services', icon: '⚰️', page: 'industry-funeral.html' },
        { id: 'school', name: 'Schools', icon: '🏫', page: 'industry-schools.html' },
        { id: 'church', name: 'Churches', icon: '⛪', page: 'industry-church.html' },
        { id: 'law-firm', name: 'Law Firms', icon: '⚖️', page: 'industry-legal.html' },
        { id: 'medical', name: 'Medical Clinics', icon: '🏥', page: 'industry-healthcare.html' },
        { id: 'dentist', name: 'Dental Practices', icon: '🦷', page: null },
        { id: 'security', name: 'Security', icon: '🔒', page: null },
        { id: 'construction', name: 'Construction', icon: '🏗️', page: null },
        { id: 'mining', name: 'Mining', icon: '⛏️', page: null },
        { id: 'retail', name: 'Retail', icon: '🏪', page: 'industry-retail.html' },
        { id: 'restaurant', name: 'Restaurants', icon: '🍽️', page: null },
        { id: 'hotel', name: 'Hotels', icon: '🏨', page: null },
        { id: 'real-estate', name: 'Real Estate', icon: '🏠', page: null },
        { id: 'accounting', name: 'Accounting', icon: '📊', page: null },
        { id: 'insurance', name: 'Insurance', icon: '🛡️', page: null },
        { id: 'logistics', name: 'Logistics', icon: '🚚', page: null },
        { id: 'courier', name: 'Courier', icon: '📦', page: null },
        { id: 'recruitment', name: 'Recruitment', icon: '🎯', page: null },
        { id: 'travel', name: 'Travel', icon: '✈️', page: null },
        { id: 'government', name: 'Government', icon: '🏛️', page: null },
        { id: 'municipality', name: 'Municipality', icon: '🏙️', page: null },
        { id: 'ngo', name: 'NGO', icon: '🤝', page: null },
        { id: 'university', name: 'University', icon: '🎓', page: null },
        { id: 'college', name: 'College', icon: '📚', page: null },
        { id: 'agriculture', name: 'Agriculture', icon: '🌾', page: null },
        { id: 'manufacturing', name: 'Manufacturing', icon: '🏭', page: null },
        { id: 'pharmacy', name: 'Pharmacy', icon: '💊', page: null },
        { id: 'beauty-salon', name: 'Beauty Salon', icon: '💅', page: null },
        { id: 'gym', name: 'Gym & Fitness', icon: '💪', page: null },
    ];

    function getIndustryTemplates() {
        return INDUSTRY_TEMPLATES.map((ind) => ({
            ...ind,
            hasPage: Boolean(ind.page),
        }));
    }

    global.ZiricIndustryTemplates = {
        INDUSTRY_TEMPLATES,
        getIndustryTemplates,
    };
})(typeof window !== 'undefined' ? window : globalThis);
