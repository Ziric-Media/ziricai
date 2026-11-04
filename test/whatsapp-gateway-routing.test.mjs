import assert from "node:assert/strict";
import { getWhatsAppGatewayRoutingMode } from "../services/platform/whatsappGatewayService.js";

const prev = process.env.WHATSAPP_GATEWAY_REGISTRY_ROUTING;

try {
    process.env.WHATSAPP_GATEWAY_REGISTRY_ROUTING = "primary";
    assert.equal(getWhatsAppGatewayRoutingMode(), "primary");
    process.env.WHATSAPP_GATEWAY_REGISTRY_ROUTING = "invalid";
    assert.equal(getWhatsAppGatewayRoutingMode(), "off");
    delete process.env.WHATSAPP_GATEWAY_REGISTRY_ROUTING;
    assert.equal(getWhatsAppGatewayRoutingMode(), "off");
    console.log("whatsapp-gateway-routing.test.mjs OK");
} finally {
    if (prev === undefined) delete process.env.WHATSAPP_GATEWAY_REGISTRY_ROUTING;
    else process.env.WHATSAPP_GATEWAY_REGISTRY_ROUTING = prev;
}
