/**
 * SmileMore till price list, copied from the practice Point of Sale page.
 * The server prices every sale from this list.
 */
export const DENTAL_POS_TREATMENTS = Object.freeze([
    { id: "T01", name: "Consultation", cat: "family", price: 350, dur: "30m", icon: "fa-stethoscope" },
    { id: "T02", name: "Teeth Cleaning", cat: "family", price: 450, dur: "30m", icon: "fa-tooth" },
    { id: "T03", name: "Deep Cleaning", cat: "family", price: 850, dur: "60m", icon: "fa-teeth" },
    { id: "T04", name: "Fillings (Composite)", cat: "restorative", price: 650, dur: "45m", icon: "fa-fill-drip" },
    { id: "T05", name: "Dental Crown", cat: "restorative", price: 2800, dur: "90m", icon: "fa-crown" },
    { id: "T06", name: "Dental Bridge", cat: "restorative", price: 3500, dur: "120m", icon: "fa-teeth-open" },
    { id: "T07", name: "Dentures (Full)", cat: "restorative", price: 4500, dur: "120m", icon: "fa-laugh" },
    { id: "T08", name: "Teeth Whitening", cat: "cosmetic", price: 1200, dur: "60m", icon: "fa-sparkles" },
    { id: "T09", name: "Veneers (per tooth)", cat: "cosmetic", price: 1800, dur: "60m", icon: "fa-star" },
    { id: "T10", name: "Smile Makeover", cat: "cosmetic", price: 8500, dur: "180m", icon: "fa-face-smile" },
    { id: "T11", name: "Braces (Metal)", cat: "ortho", price: 3500, dur: "60m", icon: "fa-braces" },
    { id: "T12", name: "Clear Aligners", cat: "ortho", price: 5500, dur: "45m", icon: "fa-align-center" },
    { id: "T13", name: "Braces Adjustment", cat: "ortho", price: 600, dur: "30m", icon: "fa-wrench" },
    { id: "T14", name: "Tooth Extraction", cat: "restorative", price: 800, dur: "45m", icon: "fa-tooth" },
    { id: "T15", name: "Wisdom Tooth Removal", cat: "restorative", price: 1800, dur: "60m", icon: "fa-x-ray" },
    { id: "T16", name: "Paediatric Checkup", cat: "paediatric", price: 350, dur: "30m", icon: "fa-child" },
    { id: "T17", name: "Paediatric Cleaning", cat: "paediatric", price: 300, dur: "20m", icon: "fa-baby" },
    { id: "T18", name: "X-Ray (Panoramic)", cat: "family", price: 450, dur: "15m", icon: "fa-x-ray" },
    { id: "T19", name: "Dental Implant", cat: "restorative", price: 8500, dur: "120m", icon: "fa-screwdriver-wrench" },
    { id: "T20", name: "Root Canal", cat: "restorative", price: 2200, dur: "90m", icon: "fa-flask" },
    { id: "T21", name: "Night Guard", cat: "family", price: 950, dur: "30m", icon: "fa-moon" },
    { id: "T22", name: "Emergency Visit", cat: "family", price: 500, dur: "30m", icon: "fa-truck-medical" },
    { id: "T23", name: "Dentures (Partial)", cat: "restorative", price: 2800, dur: "90m", icon: "fa-smile" },
    { id: "T24", name: "Fillings (Amalgam)", cat: "restorative", price: 550, dur: "45m", icon: "fa-fill" },
]);

export const DENTAL_POS_CATEGORIES = Object.freeze([
    { id: "all", label: "All" },
    { id: "family", label: "Family" },
    { id: "cosmetic", label: "Cosmetic" },
    { id: "ortho", label: "Orthodontics" },
    { id: "restorative", label: "Restorative" },
    { id: "paediatric", label: "Paediatric" },
]);

export const DENTAL_POS_METHODS = Object.freeze(["cash", "card", "medical_aid", "eft", "mobile", "split"]);

export function dentalPosTreatment(id) {
    return DENTAL_POS_TREATMENTS.find((item) => item.id === id) || null;
}
