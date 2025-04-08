/**
 * @file scripts/token-fx.js
 * A UMD bundle: registers helpers, injects UI, applies & caches filters.
 */
(() => {
    console.log("Token FX | Loading UMD bundle");


    /**
     * Given a Token placeable, return its primary sprite (the token image).
     */
    function getTokenSprite(token) {
        const c = token.children || token.mesh?.children || [];
        for (let child of c) {
            if (child instanceof PIXI.Sprite && child.texture && child.texture.baseTexture) {
                return child;
            }
        }
        // Fallback: if none found, return the token itself
        return token;
    }

    // Simple glow filter
    class GlowFilter {
        /**
         * Creates a glow by blurring and then tinting.
         * @param {number} color - 0xRRGGBB tint color.
         * @param {number} blur - The blur strength.
         * @param {number} alpha - The tint alpha (0–1).
         */
        constructor(color = 0xff0000, blur = 8, alpha = 0.5) {
            // A BlurFilter from PIXI
            this.blurFilter = new PIXI.filters.BlurFilter(blur, 1, 1);

            // A ColorMatrixFilter to tint
            this.colorFilter = new PIXI.filters.ColorMatrixFilter();
            const r = ((color >> 16) & 0xff) / 255;
            const g = ((color >> 8) & 0xff) / 255;
            const b = (color & 0xff) / 255;

            // Multiply each channel by the tint color
            this.colorFilter.matrix = [
                r, 0, 0, 0, 0,
                0, g, 0, 0, 0,
                0, 0, b, 0, 0,
                0, 0, 0, alpha, 0
            ];
        }

        /**
         * Returns an array of filters to apply: first blur, then color.
         */
        getFilters() {
            return [ this.blurFilter, this.colorFilter ];
        }
    }

    /**
     * A simple glow that outlines the sprite in color and then blurs it.
     */
    class SimpleGlow {
        /**
         * @param {number} color - 0xRRGGBB tint color.
         * @param {number} thickness - outline thickness in pixels.
         * @param {number} blur - blur radius.
         * @param {number} alpha - overall glow alpha (0–1).
         */
        constructor(color = 0xff0000, thickness = 4, blur = 8, alpha = 0.5) {
            // OutlineFilter: draws a solid outline
            this.outline = new PIXI.filters.OutlineFilter(thickness, color);
            // BlurFilter: softens the outline
            this.blur = new PIXI.filters.BlurFilter(blur, 1, 1);
            // A ColorMatrixFilter to apply alpha
            this.tint = new PIXI.filters.ColorMatrixFilter();
            this.tint.alpha = alpha; // apply alpha to the whole
        }

        getFilters() {
            return [ this.outline, this.blur, this.tint ];
        }
    }




    // Cache filters per-token
    const _filterCache = new Map(); // token.id → { fx, color, strength, filter }

    function _applyFX(token) {
        // Target the actual image sprite
        const sprite = getTokenSprite(token);
        console.log("Token FX | sprite for token", token.id, sprite);

        // Clear previous filters
        sprite.filters = [];

        // Read flags
        const fx = token.document.getFlag("my-token-fx-module", "fx");
        const glowColor = token.document.getFlag("my-token-fx-module", "glowColor");
        const glowStrength = token.document.getFlag("my-token-fx-module", "glowStrength");

        console.log("Token FX | flags:", { fx, glowColor, glowStrength });

        if (fx !== "glow") return;

        // Test blur + tint on the sprite
        const blur = new PIXI.filters.BlurFilter(12, 1, 1);
        const tint = new PIXI.filters.ColorMatrixFilter();
        tint.matrix = [
            1,0,0,0,0,
            0,0,0,0,0,
            0,0,0,0,0,
            0,0,0,0.5,0
        ];

        console.log("Token FX | Applying blur+tint to sprite");
        sprite.filters = [ blur, tint ];
    }





    // Register Handlebars eq helper
    Hooks.once("init", () => {
        console.log("Token FX | init – registering Handlebars helpers");
        Handlebars.registerHelper("eq", (a, b) => a == b);
    });

    // Apply FX on load and on token changes
    Hooks.on("ready", () => canvas.tokens.placeables.forEach(t => _applyFX(t)));
    Hooks.on("createToken", doc => _applyFX(doc.object));
    Hooks.on("updateToken", doc => _applyFX(doc.object));

    // Inject UI into TokenConfig
    Hooks.on("renderTokenConfig", async (app, html) => {
        if (app.constructor.name !== "TokenConfig5e") return;
        console.log("Token FX | injecting FX tab into", app.constructor.name);

        // 1. Add the nav button
        const nav = html.find("nav.sheet-tabs[data-group='main']");
        const fxTabButton = $(`<a class="item" data-tab="fx"><i class="fas fa-fire"></i> FX</a>`);
        nav.append(fxTabButton);

        // 2. Render our FX pane
        const fxPaneHtml = await renderTemplate(
            "modules/my-token-fx-module/templates/token-fx-config.html",
            app.object
        );

        // 3. Insert into the form before the footer
        const form = html.find("form");
        const footer = form.find("footer.sheet-footer");
        footer.before(fxPaneHtml);

        // 4. Tab switching
        nav.on("click", "a.item", (event) => {
            const tab = event.currentTarget.dataset.tab;
            nav.find("a.item").removeClass("active");
            form.find(".tab[data-group='main']").removeClass("active");
            $(event.currentTarget).addClass("active");
            form.find(`.tab[data-group='main'][data-tab="${tab}"]`).addClass("active");
        });
        if (!nav.find("a.item.active").length) {
            const first = nav.find("a.item").first();
            first.addClass("active");
            const firstTab = first.attr("data-tab");
            form.find(`.tab[data-group='main'][data-tab="${firstTab}"]`).addClass("active");
        }

        // 5. Intercept form submission to write our flags
        form.off("submit.tokenfx");
        form.on("submit.tokenfx", async (event) => {
            const data = new FormData(event.currentTarget);
            const fx = data.get("flags.my-token-fx-module.fx") || "";
            const glowColor = data.get("flags.my-token-fx-module.glowColor") || "";
            const glowStrength = data.get("flags.my-token-fx-module.glowStrength") || "";
            console.log("Token FX | Saving flags:", { fx, glowColor, glowStrength });
            await app.object.document.setFlag("my-token-fx-module", "fx", fx);
            await app.object.document.setFlag("my-token-fx-module", "glowColor", glowColor);
            await app.object.document.setFlag("my-token-fx-module", "glowStrength", glowStrength);
        });
    });

})();
