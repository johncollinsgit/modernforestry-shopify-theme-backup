# Stable homepage banner height

The rotating homepage banner used each photo's natural aspect ratio and enabled Flickity's adaptive height. At 1728px wide, the five banners measured 768, 1070, 1231, 1152 and 2592px tall. At 390px wide they measured 585, 242, 278, 260 and 585px. Automatic rotation changed document height and moved the content below the banner.

The slideshow now uses its first slide's desktop and mobile image ratios for all slides. Photos fill those frames with `object-fit: cover`, and adaptive height is disabled. Reordering the first slide in the theme editor determines the shared frame proportions. Fullscreen mode retains its existing viewport sizing. Image width and height attributes reserve intrinsic dimensions while images load.

Only `sections/slideshow.liquid` changes storefront behavior. Homepage content, order, links, rewards, customer authentication and cart behavior are preserved.

Validation: Shopify Liquid validation passes with the existing deprecated `img_url` warnings. Native Safari review and isolated WebKit checks use the actual rendered section, five current banner images and the live slideshow libraries. Desktop, tablet and phone checks cover constant banner and following-content position, scroll position after changing slides, loaded images, visible text and buttons, and horizontal overflow. GitHub-connected theme synchronization and public storefront are verified after merge.
