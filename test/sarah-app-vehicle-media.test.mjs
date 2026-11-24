import test from "node:test";
import assert from "node:assert/strict";
import {
    buildSarahAppVehicleMarkdownGallery,
    isSarahAppDisplayableImageUrl,
    replyContainsMarkdownImages,
    scrubInvalidMarkdownImages,
    wantsSarahAppVehicleGallery,
    resolveMediaSearchContext,
    expandDealerImageCandidates,
    automotiveReplyNeedsMedia,
    replyDefersDelivery,
    stripDeferredDeliveryPhrases,
    planVehicleMediaSelection,
    vehicleMatchesHints,
    parseRequestedVehicleMediaCount,
    filterVehiclesByBodyType,
    matchVehiclesToReplyOrder,
    resolvePromisedBodyType,
    customerWantsVehicleMedia,
    isNonVehicleStockTurn,
    findVehicleByTitleFragment,
    resolveDiscussedVehicleFromHistory,
    customerAsksVehiclePhoto,
    parseBulletVehicleLinesFromReply,
    parseVehicleLinesFromReply,
} from "../services/sarah/company/sarahAppVehicleMediaReply.js";
import { formatVehicleTitle } from "../services/conversation/vehiclePresentation.js";

test("SUV promise filters sedans and orders images to numbered list", () => {
    const reply = `Here are SUV options:
1. **2019 Volkswagen Tiguan 1.4TSI**
2. **2015 Toyota RAV4 2.0 GX**
3. **2019 Ford Everest 2.0SiT**`;
    assert.equal(resolvePromisedBodyType("suv please", reply), "SUV");
    const pool = [
        { vehicleId: "1", make: "Ford", model: "Focus", bodyType: "Sedan", title: "2017 Ford Focus" },
        { vehicleId: "2", make: "Volkswagen", model: "Tiguan", bodyType: "SUV", title: "2019 Volkswagen Tiguan" },
        { vehicleId: "3", make: "Toyota", model: "RAV4", bodyType: "SUV", title: "2015 Toyota RAV4" },
        { vehicleId: "4", make: "Ford", model: "Everest", bodyType: "SUV", title: "2019 Ford Everest" },
    ];
    const suvs = filterVehiclesByBodyType(pool, "SUV");
    assert.equal(suvs.length, 3);
    const ordered = matchVehiclesToReplyOrder(reply, suvs);
    assert.match(formatVehicleTitle(ordered[0]) || ordered[0].title, /Tiguan/i);
    assert.match(formatVehicleTitle(ordered[2]) || ordered[2].title, /Everest/i);
});

test("planVehicleMediaSelection caps count and everest hints", () => {
    const rec = [
        { vehicleId: "a", make: "Ford", model: "Everest", title: "2019 Ford Everest XLT" },
        { vehicleId: "b", make: "Ford", model: "Everest", title: "2019 Ford Everest Limited" },
        { vehicleId: "c", make: "Ford", model: "Ranger", title: "2020 Ford Ranger" },
    ];
    const plan = planVehicleMediaSelection("Ok show me the 2 everests you suggested for me", [], rec, []);
    assert.equal(plan.vehicles.length, 2);
    assert.ok(plan.vehicles.every((v) => vehicleMatchesHints(v, ["everest"])));
    assert.equal(parseRequestedVehicleMediaCount("pics of 2 everests"), 2);
});

test("resolveDiscussedVehicleFromHistory for yes-after-photos offer", () => {
    const history = [
        { role: "user", content: "Lets try again on Ford Everest" },
        {
            role: "assistant",
            content:
                "The **2019 Ford Everest 2.0SiT XLT** is available in white. Would you like to see some images of the vehicle?",
        },
        { role: "user", content: "What color is it?" },
        { role: "assistant", content: "It is available in white. Would you like to see some images?" },
        { role: "user", content: "Yes i want to" },
    ];
    const title = resolveDiscussedVehicleFromHistory(history);
    assert.match(title, /Everest/i);
    const everest = { make: "Ford", model: "Everest", title: "2019 Ford Everest 2.0SiT XLT" };
    const focus = { make: "Ford", model: "Focus", title: "2017 Ford Focus Sedan" };
    const pick = findVehicleByTitleFragment([focus, everest], title);
    assert.match(formatVehicleTitle(pick) || pick.title, /Everest/i);
});

test("vehicle media only when customer asks — not staff or suggestions alone", () => {
    assert.equal(isNonVehicleStockTurn("which people are working at Central Motors"), true);
    assert.equal(customerWantsVehicleMedia("which people are working at Central Motors", "Our team...", []), false);
    assert.equal(customerWantsVehicleMedia("Ok im interested in the Everest", "specs...", []), false);
    assert.equal(customerWantsVehicleMedia("Which one would you suggest?", "", []), false);
    assert.equal(customerWantsVehicleMedia("show me pics of the Everest", "", []), true);
    assert.equal(customerAsksVehiclePhoto("Lets see its pic", [{ role: "assistant", content: "**2019 Ford Everest**" }]), true);
    assert.equal(customerAsksVehiclePhoto("Show me its image", [{ role: "assistant", content: "2019 Ford Everest 2.0SiT" }]), true);
    assert.equal(
        automotiveReplyNeedsMedia("Here is an alternative.", "SUV please", [
            { tool: "searchInventory", ok: true, vehicles: [{ make: "Ford", model: "Everest" }] },
        ]),
        false
    );
    assert.equal(
        automotiveReplyNeedsMedia("Just a moment, I'll send you the details.", "Changan", []),
        true
    );
    const tiguan = { make: "Volkswagen", model: "Tiguan", title: "2019 Volkswagen Tiguan 1.4TSI" };
    const everest = { make: "Ford", model: "Everest", title: "2019 Ford Everest 2.0SiT XLT" };
    const pick = findVehicleByTitleFragment(
        [everest, tiguan],
        "2019 Volkswagen Tiguan 1.4TSI Comfortline Auto"
    );
    assert.equal(pick?.model, "Tiguan");
    assert.equal(stripDeferredDeliveryPhrases("Just a moment — I'll send photos."), "");
    assert.equal(replyDefersDelivery("I'll send the details shortly."), true);
});

test("wantsSarahAppVehicleGallery detects photo and showroom asks", () => {
    assert.equal(wantsSarahAppVehicleGallery("show me photos of SUVs"), true);
    assert.equal(wantsSarahAppVehicleGallery("what sedans do you have available"), true);
    assert.equal(wantsSarahAppVehicleGallery("go ahead and send me images"), true);
    assert.equal(wantsSarahAppVehicleGallery("images"), true);
    assert.equal(wantsSarahAppVehicleGallery("show me SUVs"), true);
    assert.equal(wantsSarahAppVehicleGallery("what are your opening hours"), false);
});

test("buildSarahAppVehicleMarkdownGallery uses real URLs", () => {
    const md = buildSarahAppVehicleMarkdownGallery([
        {
            title: "2019 Toyota Fortuner",
            bodyType: "SUV",
            images: ["https://www.centralmotorsrtb.co.za/stock/a.jpg"],
        },
        {
            make: "Honda",
            model: "Amaze",
            bodyType: "Sedan",
            images: ["https://example.com/fake.jpg", "https://cdn.example/real.png"],
        },
    ]);
    assert.match(md, /centralmotorsrtb\.co\.za/);
    assert.doesNotMatch(md, /example\.com\/fake/);
    assert.doesNotMatch(md, /example\.com\/fake/);
    assert.match(md, /\*\*1\. SUV:\*\*/);
});

test("isSarahAppDisplayableImageUrl rejects placeholders", () => {
    assert.equal(isSarahAppDisplayableImageUrl("https://example.com/x.jpg"), false);
    assert.equal(isSarahAppDisplayableImageUrl("https://www.centralmotorsrtb.co.za/x.webp"), true);
    assert.equal(
        isSarahAppDisplayableImageUrl(
            "https://babescarsales.co.za/wp-content/uploads/2024/01/stock-hero.jpg"
        ),
        true
    );
    assert.equal(
        isSarahAppDisplayableImageUrl(
            "https://sarah.ziricai.com/api/network/v1/listing-media/lmed_x/content?token=abc"
        ),
        true
    );
});

test("parseBulletVehicleLinesFromReply for Babes-style lists", () => {
    const reply = `I can share photos:
- **2014 FORD RANGER 3.2 TDCI 4X4**
- **2025 BMW G45 X3 2.0d xDrive**
- **2015 NISSAN X-TRAIL 2.5 SE 4X4 CVT**`;
    const bullets = parseBulletVehicleLinesFromReply(reply);
    assert.equal(bullets.length, 3);
    assert.match(bullets[0].title, /RANGER/i);
    const lines = parseVehicleLinesFromReply(reply);
    assert.equal(lines.length, 3);
});

test("customerAsksVehiclePhoto for short pic asks with prior SUV list", () => {
    const history = [
        { role: "assistant", content: "Try the **2014 FORD RANGER** or **2025 BMW X3**" },
    ];
    assert.equal(customerAsksVehiclePhoto("Any pics", history), true);
    assert.equal(customerAsksVehiclePhoto("Do you have any images for them", history), true);
});

test("replyContainsMarkdownImages", () => {
    assert.equal(replyContainsMarkdownImages("![SUV](https://x.com/a.jpg)"), true);
    assert.equal(replyContainsMarkdownImages("plain text"), false);
});

test("expandDealerImageCandidates adds full-size WordPress url", () => {
    const urls = expandDealerImageCandidates(
        "https://www.centralmotorsrtb.co.za/wp-content/uploads/x-150x150.jpg"
    );
    assert.equal(urls.length, 2);
    assert.match(urls[1], /x\.jpg$/);
});

test("resolveMediaSearchContext inherits SUV from prior turn", () => {
    const ctx = resolveMediaSearchContext("images", [
        { role: "user", content: "show me SUVs" },
        { role: "assistant", content: "ok" },
        { role: "user", content: "images" },
    ]);
    assert.match(ctx, /suv/i);
});

test("scrubInvalidMarkdownImages removes SUV Model placeholders", () => {
    const raw = "Intro\n\n![SUV Model 1](https://example.com/a.jpg)\n![2019 Fortuner](https://www.centralmotorsrtb.co.za/a.jpg)";
    const out = scrubInvalidMarkdownImages(raw);
    assert.doesNotMatch(out.text, /SUV Model 1/);
    assert.match(out.text, /Fortuner/);
    assert.equal(out.removed, 1);
});
