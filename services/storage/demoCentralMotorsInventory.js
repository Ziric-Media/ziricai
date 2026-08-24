/**
 * Demo used-vehicle inventory for Central Motors (demo-central-motors).
 * Stored as knowledge-base documents — searchable via knowledgeService.
 *
 * Inventory document schema (type: "inventory"):
 * - title: short listing headline
 * - content: structured text with Year, Model, Mileage, Price, Transmission,
 *   Fuel, Location, Stock Number, Finance Estimate, Images, Availability
 */

export const CENTRAL_MOTORS_INVENTORY_DOCS = [
    {
        id: "demo-kn-inv-index",
        title: "Used Vehicle Inventory — Toyota Hilux & Fortuner",
        type: "inventory",
        content: `Central Motors used stock (Gauteng). Budget-friendly Hilux and Fortuner listings typically R350,000–R500,000.

Keywords: Hilux, Fortuner, Toyota, used, inventory, stock, budget, price range, diesel, automatic, manual.

When a customer asks about Hilux or Fortuner in their budget, list matching vehicles from this inventory with year, model, mileage, price, transmission, fuel, location, stock number, finance estimate, and availability.`,
    },
    {
        id: "demo-kn-inv-hlx-001",
        title: "2021 Toyota Hilux 2.4 GD-6 Double Cab SR",
        type: "inventory",
        content: `Year: 2021
Model: Toyota Hilux 2.4 GD-6 Double Cab SR
Mileage: 68,400 km
Price: R389,900
Transmission: Manual
Fuel: Diesel
Location: Central Motors Sandton, 42 Main Road
Stock Number: CM-HLX-001
Finance Estimate: from R9,850/month (72 months, 10% deposit, subject to approval)
Images: Available on request via WhatsApp
Availability: In stock — available for test drive`,
    },
    {
        id: "demo-kn-inv-hlx-002",
        title: "2020 Toyota Hilux 2.4 GD-6 Double Cab SRX",
        type: "inventory",
        content: `Year: 2020
Model: Toyota Hilux 2.4 GD-6 Double Cab SRX
Mileage: 82,100 km
Price: R425,000
Transmission: Automatic
Fuel: Diesel
Location: Central Motors Sandton, 42 Main Road
Stock Number: CM-HLX-002
Finance Estimate: from R10,720/month (72 months, 10% deposit, subject to approval)
Images: Available on request via WhatsApp
Availability: In stock`,
    },
    {
        id: "demo-kn-inv-hlx-003",
        title: "2019 Toyota Hilux 2.4 GD-6 Double Cab",
        type: "inventory",
        content: `Year: 2019
Model: Toyota Hilux 2.4 GD-6 Double Cab
Mileage: 95,200 km
Price: R365,000
Transmission: Manual
Fuel: Diesel
Location: Central Motors Centurion
Stock Number: CM-HLX-003
Finance Estimate: from R9,220/month (72 months, 10% deposit, subject to approval)
Images: Available on request via WhatsApp
Availability: In stock`,
    },
    {
        id: "demo-kn-inv-hlx-004",
        title: "2022 Toyota Hilux 2.8 GD-6 Raider",
        type: "inventory",
        content: `Year: 2022
Model: Toyota Hilux 2.8 GD-6 Raider Double Cab
Mileage: 45,300 km
Price: R489,900
Transmission: Automatic
Fuel: Diesel
Location: Central Motors Sandton, 42 Main Road
Stock Number: CM-HLX-004
Finance Estimate: from R12,350/month (72 months, 10% deposit, subject to approval)
Images: Available on request via WhatsApp
Availability: In stock — low mileage`,
    },
    {
        id: "demo-kn-inv-ftn-001",
        title: "2020 Toyota Fortuner 2.4 GD-6",
        type: "inventory",
        content: `Year: 2020
Model: Toyota Fortuner 2.4 GD-6
Mileage: 71,000 km
Price: R399,900
Transmission: Automatic
Fuel: Diesel
Location: Central Motors Sandton, 42 Main Road
Stock Number: CM-FTN-001
Finance Estimate: from R10,100/month (72 months, 10% deposit, subject to approval)
Images: Available on request via WhatsApp
Availability: In stock`,
    },
    {
        id: "demo-kn-inv-ftn-002",
        title: "2019 Toyota Fortuner 2.8 GD-6",
        type: "inventory",
        content: `Year: 2019
Model: Toyota Fortuner 2.8 GD-6
Mileage: 88,500 km
Price: R459,000
Transmission: Automatic
Fuel: Diesel
Location: Central Motors Centurion
Stock Number: CM-FTN-002
Finance Estimate: from R11,580/month (72 months, 10% deposit, subject to approval)
Images: Available on request via WhatsApp
Availability: In stock`,
    },
];
