#!/usr/bin/env node
/**
 * Quick Babes inventory smoke (Postgres required).
 */
import { searchInventory, listVehiclesByCompany } from "../services/inventory/inventoryService.js";
import { BABES_CAR_SALES_COMPANY_ID } from "../services/automotive/babesCarSalesBootstrap.js";

const id = BABES_CAR_SALES_COMPANY_ID;

const all = await listVehiclesByCompany(id);
const available = all.filter((v) => v.availability === "available");
const fortuner = await searchInventory(id, "Toyota Fortuner", { limit: 5, availabilityOnly: true });
const suvBudget = await searchInventory(id, "automatic SUV", {
    limit: 8,
    availabilityOnly: true,
    maxPrice: 250_000,
});

console.log(
    JSON.stringify(
        {
            companyId: id,
            total: all.length,
            available: available.length,
            fortunerMatches: fortuner.length,
            suvUnder250k: suvBudget.map((v) => ({
                title: v.title,
                price: v.price,
                transmission: v.transmission,
                bodyType: v.metadata?.bodyType,
            })),
        },
        null,
        2
    )
);