export type ProductStatus = "Aktif" | "Habis" | "Hold" | "Expired" | "Tidak Aktif";

const META_PREFIX = "__POS_META__:";

type ProductMeta = {
    status?: ProductStatus;
    statusDate?: string | null;
    isPublic?: boolean;
};

const PRODUCT_STATUS: ProductStatus[] = ["Aktif", "Habis", "Hold", "Expired", "Tidak Aktif"];

export function extractProductMeta(description?: string | null): ProductMeta {
    if (!description) {
        return {};
    }

    try {
        const raw = description.includes(META_PREFIX)
            ? description.slice(description.lastIndexOf(META_PREFIX) + META_PREFIX.length)
            : description.startsWith(META_PREFIX)
                ? description.slice(META_PREFIX.length)
                : "";
        if (!raw) return {};
        const parsed = JSON.parse(raw) as ProductMeta;
        const status = PRODUCT_STATUS.includes(parsed.status as ProductStatus)
            ? (parsed.status as ProductStatus)
            : undefined;
        const statusDate = parsed.statusDate || null;
        const isPublic = typeof parsed.isPublic === "boolean" ? parsed.isPublic : undefined;

        return { status, statusDate, isPublic };
    } catch {
        return {};
    }
}

export function buildProductMetaDescription(meta: ProductMeta): string | null {
    const payload: ProductMeta = {
        status: meta.status,
        statusDate: meta.statusDate || null,
        isPublic: typeof meta.isPublic === "boolean" ? meta.isPublic : undefined,
    };

    if (!payload.status && !payload.statusDate && payload.isPublic === undefined) {
        return null;
    }

    return `${META_PREFIX}${JSON.stringify(payload)}`;
}

export function extractProductText(description?: string | null): string {
    if (!description) return "";
    if (description.startsWith(META_PREFIX)) return "";
    const idx = description.lastIndexOf(`\n\n${META_PREFIX}`);
    if (idx === -1) return description;
    return description.slice(0, idx).trim();
}

export function buildProductDescription(text: string | null | undefined, meta: ProductMeta): string | null {
    const cleanText = (text || "").trim();
    const metaPart = buildProductMetaDescription(meta);

    if (cleanText && metaPart) {
        return `${cleanText}\n\n${metaPart}`;
    }
    if (cleanText) return cleanText;
    return metaPart;
}

export function resolveProductStatus(
    stock: number,
    status?: ProductStatus | null,
    statusDate?: string | null
): ProductStatus {
    if (statusDate) {
        const target = new Date(statusDate);
        if (!Number.isNaN(target.getTime()) && target.getTime() < Date.now()) {
            return "Expired";
        }
    }

    if (stock <= 0) {
        return "Habis";
    }

    if (status === "Hold" || status === "Tidak Aktif") {
        return status;
    }

    return "Aktif";
}
