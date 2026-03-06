export const slugify = (value: string) =>
    value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

export const buildProductSlug = (productName: string, productId: string) => {
    const namePart = slugify(productName) || "produk";
    const uniquePart = productId.replace(/-/g, "").slice(0, 10).toLowerCase();
    return `${namePart}--${uniquePart}`;
};

export const extractUniquePart = (slugOrId: string) => {
    if (!slugOrId) return "";
    const parts = slugOrId.split("--");
    if (parts.length >= 2) {
        return parts[parts.length - 1].replace(/[^a-z0-9]/g, "").toLowerCase();
    }
    return slugOrId.replace(/-/g, "").toLowerCase();
};

